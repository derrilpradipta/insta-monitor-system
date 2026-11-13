import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getSession, getClientIp } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Nilai yang dianggap "dicentang" saat file diunggah balik. */
const CHECKED_VALUES = new Set(["✓", "✔", "v", "x", "ya", "sudah", "selesai", "true", "1", "yes", "ok"]);

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

/**
 * Impor kembali file Excel yang sudah dicentang di kolom "Ceklis".
 *
 * Hanya pesanan yang dicentang yang diubah menjadi SELESAI (status manual,
 * `manualConfirmed` = true) sehingga tidak diturunkan lagi oleh sinkronisasi
 * otomatis berikutnya. Pesanan yang tidak dicentang tidak disentuh sama sekali —
 * mengosongkan centang TIDAK membatalkan status yang sudah selesai.
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
    return NextResponse.json({ ok: false, message: "File tidak terbaca. Unggah file .xlsx hasil export." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ ok: false, message: "Tidak ada file yang diunggah." }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ ok: false, message: "Ukuran file melebihi 15 MB." }, { status: 400 });
  }
  if (!/\.xlsx$/i.test(file.name)) {
    return NextResponse.json({ ok: false, message: "Format harus .xlsx (file hasil Export Excel)." }, { status: 400 });
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

  // Cari baris header (baris pertama yang memuat "No. Pesanan").
  let headerRowNumber = 0;
  let orderCol = 0;
  let checkCol = 0;

  // row.values adalah sparse array (index 0 kosong dan sel kosong = lubang),
  // jadi tidak boleh dipakai .map/.findIndex langsung — baca per sel.
  const HEADER_SCAN_LIMIT = 20;
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, HEADER_SCAN_LIMIT); rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    let foundOrder = 0;
    let foundCheck = 0;
    for (let col = 1; col <= Math.min(row.cellCount, 20); col += 1) {
      const text = String(row.getCell(col).text ?? "").trim().toLowerCase();
      if (!text) continue;
      if (!foundOrder && (text.startsWith("no. pesanan") || text === "no pesanan")) foundOrder = col;
      if (!foundCheck && (text.startsWith("ceklis") || text.startsWith("centang"))) foundCheck = col;
    }
    if (foundOrder && foundCheck) {
      headerRowNumber = rowNumber;
      orderCol = foundOrder;
      checkCol = foundCheck;
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

  const checkedNumbers: string[] = [];
  const seen = new Set<string>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const orderNumber = row.getCell(orderCol).text?.trim();
    if (!orderNumber) return;
    if (seen.has(orderNumber)) return;
    seen.add(orderNumber);
    if (isChecked(row.getCell(checkCol).value)) checkedNumbers.push(orderNumber);
  });

  if (checkedNumbers.length === 0) {
    return NextResponse.json({
      ok: true,
      dryRun,
      checked: 0,
      updated: 0,
      alreadyDone: 0,
      notFound: [],
      message: "Tidak ada baris yang dicentang. Tidak ada yang diubah.",
    });
  }

  const orders = await prisma.order.findMany({
    where: { orderNumber: { in: checkedNumbers } },
    select: { id: true, orderNumber: true, monitoringStatus: true },
  });

  const foundNumbers = new Set(orders.map((order) => order.orderNumber));
  const notFound = checkedNumbers.filter((number) => !foundNumbers.has(number));
  const toUpdate = orders.filter((order) => order.monitoringStatus !== "SELESAI");
  const alreadyDone = orders.length - toUpdate.length;

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      checked: checkedNumbers.length,
      updated: toUpdate.length,
      alreadyDone,
      notFound,
      message: `Pratinjau: ${toUpdate.length} pesanan akan ditandai selesai, ${alreadyDone} sudah selesai, ${notFound.length} tidak ditemukan.`,
    });
  }

  let updated = 0;
  if (toUpdate.length > 0) {
    const ids = toUpdate.map((order) => order.id);
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

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "IMPORT_CEKLIS",
        entityType: "order",
        description: `Import ceklis Excel: ${updated} pesanan ditandai selesai (${file.name})`,
        ipAddress: await getClientIp(),
      },
    });
  }

  return NextResponse.json({
    ok: true,
    dryRun: false,
    checked: checkedNumbers.length,
    updated,
    alreadyDone,
    notFound,
    message:
      notFound.length > 0
        ? `${updated} pesanan ditandai selesai. ${notFound.length} nomor tidak ditemukan di database.`
        : `${updated} pesanan ditandai selesai.`,
  });
}
