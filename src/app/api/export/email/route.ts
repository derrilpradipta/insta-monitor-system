import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatDateTimeId } from "@/lib/time";
import { readMailAccounts, readMailGroups } from "@/lib/email/accounts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Batas jumlah baris agar file tetap wajar dibuka di Excel. */
const MAX_ROWS = 10_000;

/**
 * Export laporan email ke .xlsx — SELALU berisi semua mailbox dalam satu file.
 *
 * Alasannya: laporan ini dibagikan ke atasan, jadi satu file lebih mudah
 * dibanding mengunduh satu per akun. Tiap akun punya blok sendiri di dalam
 * sheet yang sama, lengkap dengan subjudul dan jumlahnya.
 *
 * Query:
 *  - `filter=belum|semua`  bawaan `belum` (hanya yang belum dibaca).
 *
 * Angka yang diekspor selalu dibaca ulang dari database saat tombol ditekan,
 * bukan dari tampilan, supaya file tidak pernah basi.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Sesi berakhir. Silakan login ulang." }, { status: 401 });
  }

  const url = new URL(request.url);
  const semua = url.searchParams.get("filter") === "semua";
  const grupSlug = (url.searchParams.get("grup") ?? "").trim();

  // Tanpa ?grup → semua cabang. Dengan ?grup → hanya alamat di cabang itu.
  const grup = grupSlug ? readMailGroups().find((g) => g.slug === grupSlug) : null;
  const akunTersedia = grup ? grup.accounts : readMailAccounts();

  const emailDiizinkan = akunTersedia.map((a) => a.email);

  const emails = await prisma.emailMessage.findMany({
    where: {
      ...(semua ? {} : { isRead: false }),
      // Operan file antar-cabang tidak wajib dibalas → jangan masuk laporan.
      isInternal: false,
      accountEmail: { in: emailDiizinkan },
    },
    orderBy: [{ accountEmail: "asc" }, { receivedAt: "desc" }],
    take: MAX_ROWS,
    select: {
      accountEmail: true,
      fromName: true,
      fromAddress: true,
      subject: true,
      snippet: true,
      receivedAt: true,
      hasAttachments: true,
      isRead: true,
    },
  });

  // Kelompokkan per akun mengikuti urutan akun di konfigurasi, lalu akun yang
  // tidak terdaftar (kalau ada data lama) ditaruh paling bawah.
  const urutanAkun = [
    ...akunTersedia.map((a) => a.email),
    ...Array.from(new Set(emails.map((e) => e.accountEmail))).filter(
      (email) => !akunTersedia.some((a) => a.email === email),
    ),
  ];

  const labelAkun = new Map(akunTersedia.map((a) => [a.email, a.label]));
  const perAkun = new Map<string, typeof emails>();
  for (const email of urutanAkun) perAkun.set(email, []);
  for (const e of emails) {
    const daftar = perAkun.get(e.accountEmail);
    if (daftar) daftar.push(e);
    else perAkun.set(e.accountEmail, [e]);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Instaprint Monitoring System";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Email");

  const judulFilter = semua ? "Semua email tersimpan" : "Email belum dibaca";
  const judulCabang = grup ? grup.name : "Semua Cabang";

  sheet.mergeCells("A1:J1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `Laporan Email — ${judulCabang}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { vertical: "middle" };

  const ringkas = urutanAkun
    .map((email) => `${labelAkun.get(email) ?? email}: ${perAkun.get(email)?.length ?? 0}`)
    .join(" · ");

  sheet.mergeCells("A2:J2");
  const metaCell = sheet.getCell("A2");
  metaCell.value = `Dicetak ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB · ${judulFilter} · ${emails.length} email · ${ringkas}`;
  metaCell.font = { size: 10, color: { argb: "FF6B7280" } };

  const headerValues = [
    "No",
    "Akun",
    "Pengirim",
    "Alamat Email",
    "Subjek",
    "Cuplikan",
    "Waktu Masuk",
    "Lampiran",
    "Status",
  ];

  let barisSekarang = 3;
  let nomor = 0;

  for (const emailAkun of urutanAkun) {
    const daftar = perAkun.get(emailAkun) ?? [];

    // Subjudul per akun: pembatas jelas antar mailbox dalam satu file.
    const subJudul = sheet.getRow(barisSekarang);
    subJudul.values = [
      `${labelAkun.get(emailAkun) ?? emailAkun} — ${emailAkun} (${daftar.length} email)`,
    ];
    sheet.mergeCells(`A${barisSekarang}:J${barisSekarang}`);
    const subCell = sheet.getCell(`A${barisSekarang}`);
    subCell.font = { bold: true, size: 11, color: { argb: "FF1E3A8A" } };
    subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EFFB" } };
    subCell.alignment = { vertical: "middle" };
    subJudul.height = 20;
    barisSekarang += 1;

    // Header kolom diulang tiap blok supaya tiap bagian terbaca mandiri.
    const headerRow = sheet.getRow(barisSekarang);
    headerRow.values = headerValues;
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
    });
    headerRow.height = 22;
    barisSekarang += 1;

    if (daftar.length === 0) {
      const kosong = sheet.getRow(barisSekarang);
      kosong.values = ["(tidak ada email pada filter ini)"];
      sheet.mergeCells(`A${barisSekarang}:J${barisSekarang}`);
      const cell = sheet.getCell(`A${barisSekarang}`);
      cell.font = { italic: true, size: 10, color: { argb: "FF94A3B8" } };
      barisSekarang += 1;
    }

    daftar.forEach((email, index) => {
      nomor += 1;
      const row = sheet.getRow(barisSekarang);
      row.values = [
        nomor,
        labelAkun.get(email.accountEmail) ?? email.accountEmail,
        email.fromName ?? "",
        email.fromAddress,
        email.subject,
        email.snippet,
        formatDateTimeId(email.receivedAt),
        email.hasAttachments ? "Ada" : "Tidak",
        email.isRead ? "Sudah dibaca" : "Belum dibaca",
      ];

      if (index % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        });
      }

      row.eachCell((cell) => {
        cell.alignment = { vertical: "top", wrapText: true };
        cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      });
      row.height = 30;
      barisSekarang += 1;
    });

    // Jeda satu baris kosong antar akun.
    barisSekarang += 1;
  }

  sheet.columns = [
    { width: 6 },
    { width: 20 },
    { width: 26 },
    { width: 32 },
    { width: 46 },
    { width: 60 },
    { width: 20 },
    { width: 11 },
    { width: 15 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  const bagianNama = grup ? grup.slug : "semua-cabang";
  const filename = `email-${semua ? "semua" : "belum-dibaca"}-${bagianNama}-${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
