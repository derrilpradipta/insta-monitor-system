import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { readMailAccounts } from "@/lib/email/accounts";
import { ambilLaporan, formatMenit, type Rentang } from "@/lib/email/reply-report";
import { formatDateTimeId } from "@/lib/time";
import { JAM_KERJA_RINGKAS } from "@/lib/email/replies";

export const maxDuration = 60;

const NAVY = "FF0B1220";
const BIRU_MUDA = "FFEFF4FB";

function petaCabang(): (email: string) => string {
  const akun = readMailAccounts();
  const peta = new Map(akun.map((a) => [a.email.toLowerCase(), a.group]));
  return (email) => peta.get(email.toLowerCase()) ?? email;
}

/**
 * Laporan Excel waktu balas — untuk atasan.
 *
 * Isinya sama dengan halaman /waktu-balas, disusun sebagai beberapa blok dalam
 * satu sheet supaya sekali unduh langsung lengkap: ringkasan, per cabang, pola
 * per jam.
 */
export async function GET(request: Request) {
  const sesi = await getSession();
  if (!sesi) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const url = new URL(request.url);
  const mentah = Number(url.searchParams.get("hari") ?? "30");
  const hari: Rentang = mentah === 7 || mentah === 90 ? mentah : 30;

  const laporan = await ambilLaporan(hari, petaCabang());
  const { keseluruhan: k, perCabang, perJam } = laporan;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Instaprint Monitoring System";
  const ws = wb.addWorksheet("Waktu Balas", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { width: 30 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 42 },
  ];

  let baris = 1;

  // ---------- Judul ----------
  ws.mergeCells(baris, 1, baris, 7);
  const judul = ws.getCell(baris, 1);
  judul.value = "Laporan Waktu Balas Email";
  judul.font = { size: 16, bold: true, color: { argb: NAVY } };
  judul.alignment = { vertical: "middle" };
  ws.getRow(baris).height = 24;
  baris += 1;

  ws.mergeCells(baris, 1, baris, 7);
  const meta = ws.getCell(baris, 1);
  meta.value =
    `Dicetak ${formatDateTimeId(new Date())} WIB · ${hari} hari terakhir · ` +
    `${k.total} percakapan dari pelanggan`;
  meta.font = { size: 10, color: { argb: "FF6B7280" } };
  baris += 2;

  // ---------- Ringkasan ----------
  const bagian = (teks: string) => {
    ws.mergeCells(baris, 1, baris, 7);
    const c = ws.getCell(baris, 1);
    c.value = teks;
    c.font = { size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle" };
    ws.getRow(baris).height = 20;
    baris += 1;
  };

  const headerBaris = (kolom: string[]) => {
    const row = ws.getRow(baris);
    kolom.forEach((teks, i) => {
      const c = row.getCell(i + 1);
      c.value = teks;
      c.font = { size: 10, bold: true, color: { argb: NAVY } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BIRU_MUDA } };
      c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", wrapText: true };
    });
    row.commit();
    baris += 1;
  };

  const isiBaris = (nilai: (string | number)[], rata?: ("left" | "center" | "right")[]) => {
    const row = ws.getRow(baris);
    nilai.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      c.font = { size: 10 };
      c.alignment = { vertical: "middle", horizontal: rata?.[i] ?? "left" };
      if (typeof v === "number") c.numFmt = "#,##0";
    });
    row.commit();
    baris += 1;
  };

  bagian("RINGKASAN");
  headerBaris(["Ukuran", "Nilai", "Keterangan"]);
  isiBaris(["Total percakapan", k.total, "email dari manusia (otomatis dikecualikan)"], ["left", "right", "left"]);
  isiBaris(["Sudah dibalas", k.dibalas, `${k.persenDibalas}% dari total`], ["left", "right", "left"]);
  isiBaris(["Sudah dibalas", k.dibalas, ""], ["left", "right", "left"]);
  isiBaris(
    ["Kecepatan membalas (jam kerja)", formatMenit(k.medianKerjaMenit), `${JAM_KERJA_RINGKAS} — separuh percakapan dibalas lebih cepat dari ini`],
    ["left", "right", "left"],
  );
  isiBaris(
    ["Rata-rata kecepatan membalas (jam kerja)", formatMenit(k.rataKerjaMenit), "tertarik kejadian ekstrem; pakai angka kecepatan di atas untuk menilai kinerja"],
    ["left", "right", "left"],
  );
  isiBaris(
    ["Rata-rata kecepatan membalas (kalender)", formatMenit(k.rataMenit), "apa adanya, termasuk malam & akhir pekan"],
    ["left", "right", "left"],
  );
  isiBaris(["Dibalas ≤ 1 jam kerja", k.dalam1Jam, `${k.dibalas === 0 ? 0 : Math.round((k.dalam1Jam / k.dibalas) * 100)}%`], ["left", "right", "left"]);
  isiBaris(["Dibalas ≤ 4 jam kerja", k.dalam4Jam, `${k.dibalas === 0 ? 0 : Math.round((k.dalam4Jam / k.dibalas) * 100)}%`], ["left", "right", "left"]);
  isiBaris(["Dibalas ≤ 24 jam kalender", k.dalam1Hari, ""], ["left", "right", "left"]);
  baris += 1;

  // ---------- Per cabang ----------
  if (perCabang.length > 0) {
    bagian("PER CABANG");
    headerBaris(["Cabang", "Percakapan", "Dibalas (%)", "Kecepatan (jam kerja)", "≤ 4 jam", "", ""]);
    for (const c of perCabang) {
      const r = c.ringkasan;
      isiBaris(
        [
          c.group,
          r.total,
          `${r.persenDibalas}%`,
          formatMenit(r.medianKerjaMenit),
          r.dibalas === 0 ? "—" : `${Math.round((r.dalam4Jam / r.dibalas) * 100)}%`,
          "",
          "",
        ],
        ["left", "right", "right", "right", "right", "right", "left"],
      );
    }
    baris += 1;
  }

  // ---------- Per jam ----------
  if (perJam.length > 0) {
    bagian("POLA PER JAM MASUK (WIB)");
    headerBaris(["Jam masuk", "Jumlah", "Kecepatan balas", ""]);
    for (const j of perJam) {
      isiBaris(
        [`${String(j.jam).padStart(2, "0")}.00 – ${String(j.jam + 1).padStart(2, "0")}.00`, j.jumlah, formatMenit(j.medianMenit), ""],
        ["left", "right", "right", "left"],
      );
    }
    baris += 1;
  }

  ws.views = [{ state: "frozen", ySplit: 3 }];

  const buffer = await wb.xlsx.writeBuffer();
  const namaFile = `laporan-waktu-balas-${hari}hari.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${namaFile}"`,
      "Cache-Control": "no-store",
    },
  });
}
