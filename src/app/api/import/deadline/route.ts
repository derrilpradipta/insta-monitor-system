import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getSession, getClientIp } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Nilai yang dianggap "dicentang" saat file diunggah balik. */
const CHECKED_VALUES = new Set(["✓", "✔", "v", "x", "ya", "sudah", "selesai", "true", "1", "yes", "ok"]);

/**
 * Batas keamanan panjang keterangan. Bukan batas tampilan: teks disimpan apa
 * adanya sampai batas ini, dan kalau terlampaui dilaporkan, tidak dipotong
 * diam-diam.
 */
const NOTES_MAX = 20_000;

function isChecked(value: ExcelJS.CellValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "object") {
    // Rich text / formula / hyperlink
    if ("richText" in value && Array.isArray(value.richText)) {
      return isChecked(value.richText.map((part) => part.text).join(""));
    }
    if ("result" in value) return isChecked(value.result as ExcelJS.CellValue);
    if ("text" in value) return isChecked(String(value.text));
    return false;
  }
  const text = String(value).trim().toLowerCase();
  return CHECKED_VALUES.has(text);
}

/** Ambil teks sel apa pun bentuknya (rich text, formula, hyperlink). */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text);
    if ("hyperlink" in value) return String(value.hyperlink);
    return "";
  }
  return String(value);
}

type Baris = {
  orderNumber: string;
  checked: boolean;
  /** null = sel keterangan kosong. */
  note: string | null;
};

/**
 * Impor kembali file Excel hasil Export Excel di halaman Deadline.
 *
 * Dua hal yang dibaca dari file:
 *  1. Kolom "Ceklis" — baris yang dicentang ditandai SELESAI (status manual,
 *     `manualConfirmed` = true) supaya tidak diturunkan lagi oleh sinkronisasi.
 *     Mengosongkan centang TIDAK membatalkan status yang sudah selesai.
 *  2. Kolom "Keterangan" — teksnya disimpan ke kolom `notes` pesanan. Sel yang
 *     dikosongkan akan mengosongkan keterangan juga. Kalau file sama sekali
 *     tidak punya kolom Keterangan (file lama), catatan yang ada tidak disentuh.
 *
 * Body: multipart/form-data dengan field `file`.
 * Query: `dryRun=1` untuk pratinjau tanpa menyimpan.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Sesi berakhir. Silakan login ulang." }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  let file: File | null = null;
  try {
    const form = await request.formData();
    const uploaded = form.get("file");
    if (uploaded instanceof File) file = uploaded;
  } catch {
    return NextResponse.json(
      { ok: false, message: "File tidak terbaca. Unggah file .xlsx hasil export." },
      { status: 400 },
    );
  }

  if (!file) {
    return NextResponse.json({ ok: false, message: "Tidak ada file yang diunggah." }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ ok: false, message: "Ukuran file melebihi 15 MB." }, { status: 400 });
  }
  if (!/\.xlsx$/i.test(file.name)) {
    return NextResponse.json(
      { ok: false, message: "Format harus .xlsx (file hasil Export Excel)." },
      { status: 400 },
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ ok: false, message: "File Excel rusak atau bukan format .xlsx." }, { status: 400 });
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ ok: false, message: "File tidak memiliki sheet." }, { status: 400 });
  }

  // Cari baris header.
  let headerRowNumber = 0;
  let orderCol = 0;
  let checkCol = 0;
  let notesCol = 0;

  // row.values adalah sparse array (index 0 kosong dan sel kosong = lubang),
  // jadi tidak boleh dipakai .map/.findIndex langsung — baca per sel.
  const HEADER_SCAN_LIMIT = 20;
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, HEADER_SCAN_LIMIT); rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    let foundOrder = 0;
    let foundCheck = 0;
    let foundNotes = 0;
    for (let col = 1; col <= Math.min(row.cellCount, 20); col += 1) {
      const text = String(row.getCell(col).text ?? "").trim().toLowerCase();
      if (!text) continue;
      if (!foundOrder && (text.startsWith("no. pesanan") || text === "no pesanan")) foundOrder = col;
      if (!foundCheck && (text.startsWith("ceklis") || text.startsWith("centang"))) foundCheck = col;
      if (!foundNotes && (text.startsWith("keterangan") || text.startsWith("catatan"))) foundNotes = col;
    }
    // "Ceklis" yang wajib ada; Keterangan opsional agar file lama tetap bisa diunggah.
    if (foundOrder && foundCheck) {
      headerRowNumber = rowNumber;
      orderCol = foundOrder;
      checkCol = foundCheck;
      notesCol = foundNotes;
      break;
    }
  }

  if (!headerRowNumber || !orderCol || !checkCol) {
    return NextResponse.json(
      {
        ok: false,
        message:
          'File tidak dikenali: kolom "No. Pesanan" dan "Ceklis" tidak ditemukan. Gunakan file hasil tombol Export Excel.',
      },
      { status: 400 },
    );
  }

  const baris: Baris[] = [];
  const seen = new Set<string>();
  let keteranganTerlaluPanjang = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const orderNumber = row.getCell(orderCol).text?.trim();
    if (!orderNumber) return;
    if (seen.has(orderNumber)) return;
    seen.add(orderNumber);

    const checked = isChecked(row.getCell(checkCol).value);

    // Keterangan disimpan PERSIS seperti yang diketik orang produksi: spasi
    // ganda, baris baru, dan tanda baca tidak diubah. Hanya baris baru gaya
    // Windows (\r\n) yang diseragamkan supaya tidak menyisakan \r tak terlihat.
    // Kalau kolom Keterangan tidak ada di file, `notes` tidak disentuh nanti.
    let note: string | null = null;
    if (notesCol > 0) {
      const mentah = cellText(row.getCell(notesCol).value).replace(/\r\n?/g, "\n");
      if (mentah.length > NOTES_MAX) {
        keteranganTerlaluPanjang += 1;
        note = mentah.slice(0, NOTES_MAX);
      } else {
        note = mentah;
      }
      // Sel yang hanya berisi spasi dianggap kosong, supaya tidak tersimpan
      // keterangan yang tampak kosong di web.
      if (note !== null && note.trim() === "") note = null;
    }

    baris.push({ orderNumber, checked, note });
  });

  const adaKolomKeterangan = notesCol > 0;

  const orderNumbers = baris.map((b) => b.orderNumber);
  const orders = await prisma.order.findMany({
    where: { orderNumber: { in: orderNumbers } },
    select: { id: true, orderNumber: true, monitoringStatus: true, notes: true },
  });

  const peta = new Map(orders.map((o) => [o.orderNumber, o]));
  const notFound = orderNumbers.filter((n) => !peta.has(n));

  const checkedRows = baris.filter((b) => b.checked && peta.has(b.orderNumber));
  const toFinish = checkedRows.filter((b) => peta.get(b.orderNumber)!.monitoringStatus !== "SELESAI");
  const alreadyDone = checkedRows.length - toFinish.length;

  // Hanya baris yang keterangannya benar-benar berbeda dari database yang ditulis.
  const catatanBerubah: { id: string; notes: string | null }[] = [];
  let notesSaved = 0;
  let notesCleared = 0;

  if (adaKolomKeterangan) {
    for (const b of baris) {
      const order = peta.get(b.orderNumber);
      if (!order) continue;
      const target = b.note;
      const sekarang = order.notes ?? null;
      if (sekarang === target) continue;
      catatanBerubah.push({ id: order.id, notes: target });
      if (target) notesSaved += 1;
      else notesCleared += 1;
    }
  }

  if (toFinish.length === 0 && catatanBerubah.length === 0) {
    return NextResponse.json({
      ok: true,
      dryRun,
      checked: checkedRows.length,
      updated: 0,
      alreadyDone,
      notesSaved: 0,
      notesCleared: 0,
      notFound,
      message: "Tidak ada perubahan: centang dan keterangan sama dengan data di web.",
    });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      checked: checkedRows.length,
      updated: toFinish.length,
      alreadyDone,
      notesSaved,
      notesCleared,
      notFound,
      message:
        `Pratinjau: ${toFinish.length} pesanan akan ditandai selesai, ${alreadyDone} sudah selesai, ` +
        `${notFound.length} tidak ditemukan. Keterangan: ${notesSaved} diisi/diubah, ${notesCleared} dikosongkan.`,
    });
  }

  let updated = 0;
  if (toFinish.length > 0) {
    const ids = toFinish.map((b) => peta.get(b.orderNumber)!.id);
    const result = await prisma.order.updateMany({
      where: { id: { in: ids } },
      data: {
        monitoringStatus: "SELESAI",
        monitoringStatusSource: "MANUAL",
        monitoringStatusChangedAt: new Date(),
        manualConfirmed: true,
        manualConfirmedBy: session.user.id,
        manualConfirmedAt: new Date(),
      },
    });
    updated = result.count;
  }

  for (const c of catatanBerubah) {
    await prisma.order.update({ where: { id: c.id }, data: { notes: c.notes } });
  }

  if (updated > 0 || catatanBerubah.length > 0) {
    const potongan: string[] = [];
    if (updated > 0) potongan.push(`${updated} pesanan ditandai selesai`);
    if (notesSaved > 0) potongan.push(`${notesSaved} keterangan disimpan`);
    if (notesCleared > 0) potongan.push(`${notesCleared} keterangan dikosongkan`);

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "IMPORT_CEKLIS",
        entityType: "order",
        description: `Import Excel (${file.name}): ${potongan.join(", ")}`,
        ipAddress: await getClientIp(),
      },
    });
  }

  const ringkas: string[] = [];
  if (updated > 0) ringkas.push(`${updated} pesanan ditandai selesai`);
  if (notesSaved > 0) ringkas.push(`${notesSaved} keterangan disimpan`);
  if (notesCleared > 0) ringkas.push(`${notesCleared} keterangan dikosongkan`);
  if (keteranganTerlaluPanjang > 0) {
    ringkas.push(`${keteranganTerlaluPanjang} keterangan dipotong pada ${NOTES_MAX.toLocaleString("id-ID")} karakter`);
  }
  if (ringkas.length === 0) ringkas.push("Tidak ada perubahan");

  return NextResponse.json({
    ok: true,
    dryRun: false,
    checked: checkedRows.length,
    updated,
    alreadyDone,
    notesSaved,
    notesCleared,
    notFound,
    message:
      notFound.length > 0
        ? `${ringkas.join(", ")}. ${notFound.length} nomor tidak ditemukan di database.`
        : `${ringkas.join(", ")}.`,
  });
}
