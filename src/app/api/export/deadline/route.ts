import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { dateOnlyToDb, formatDateId, isValidDateString, todayWibSafe } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Export daftar pesanan pada rentang tenggat ke file .xlsx.
 * Dipakai halaman Deadline untuk dibagikan ke tim produksi.
 *
 * Query: dari, sampai (YYYY-MM-DD), branch, status, q
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Sesi berakhir. Silakan login ulang." }, { status: 401 });
  }

  const url = new URL(request.url);
  const today = todayWibSafe();
  const fromParam = url.searchParams.get("dari");
  const toParam = url.searchParams.get("sampai");
  const from = fromParam && isValidDateString(fromParam) ? fromParam : today;
  const to = toParam && isValidDateString(toParam) ? toParam : from;

  const branchId = url.searchParams.get("branch") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim();

  // Rentang inklusif: dari 00:00 tanggal awal s/d 00:00 hari setelah tanggal akhir.
  const start = dateOnlyToDb(from);
  const end = new Date(dateOnlyToDb(to).getTime());
  end.setUTCDate(end.getUTCDate() + 1);

  const where: Prisma.OrderWhereInput = {
    ...(status === "TANPA_TENGGAT" ? { deadlineDate: null } : { deadlineDate: { gte: start, lt: end } }),
    ...(branchId ? { branchId } : {}),
    ...(status === "BELUM_SELESAI" || status === "SELESAI" || status === "DIBATALKAN" || status === "TERLAMBAT"
      ? { monitoringStatus: status === "TERLAMBAT" ? "BELUM_SELESAI" : status }
      : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" as const } },
            { customerName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const orders = await prisma.order.findMany({
    where,
    orderBy: [{ deadlineDate: "asc" }, { branch: { branchName: "asc" } }, { orderNumber: "asc" }],
    include: { branch: { select: { branchName: true } } },
    take: 20_000,
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Instaprint Monitoring System";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Deadline");

  const title = from === to ? `Tenggat ${formatDateId(from)}` : `Tenggat ${formatDateId(from)} – ${formatDateId(to)}`;
  sheet.mergeCells("A1:G1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `Daftar Pesanan — ${title}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { vertical: "middle" };

  sheet.mergeCells("A2:G2");
  const metaCell = sheet.getCell("A2");
  metaCell.value = `Dicetak ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB · ${orders.length} pesanan · Isi kolom "Ceklis" dengan ✓ untuk pesanan yang benar-benar sudah selesai, lalu unggah kembali file ini di halaman Deadline`;
  metaCell.font = { size: 10, color: { argb: "FF6B7280" } };

  const headerRow = sheet.getRow(3);
  headerRow.values = [
    "No. Pesanan",
    "Pelanggan",
    "Cabang",
    "Produk",
    "Tanggal Masuk",
    "Tenggat",
    "Ceklis",
  ];
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
  headerRow.height = 22;

  orders.forEach((order, index) => {
    const row = sheet.addRow([
      order.orderNumber,
      order.customerName,
      order.branch.branchName,
      order.productName,
      formatDateId(order.orderDate),
      order.deadlineDate ? formatDateId(order.deadlineDate) : "Tanpa tenggat",
      null,
    ]);

    if (index % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
    }

    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", wrapText: false };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
    });
  });

  sheet.columns = [
    { width: 15 },
    { width: 28 },
    { width: 24 },
    { width: 42 },
    { width: 14 },
    { width: 14 },
    { width: 9 },
  ];
  sheet.views = [{ state: "frozen", ySplit: 3 }];
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 7 } };

  // Kolom Ceklis: dropdown berisi "✓" supaya sekali klik = tercentang.
  // (ExcelJS tidak bisa membuat form-control checkbox, jadi dropdown + conditional
  // formatting adalah pendekatan yang paling andal dan tetap terbaca saat diunggah balik.)
  const lastRow = sheet.rowCount;
  if (lastRow >= 4) {
    // `dataValidations` ada di runtime tetapi belum ada di type definitions ExcelJS.
    const validations = (sheet as unknown as {
      dataValidations: {
        add: (
          address: string,
          validation: {
            type: string;
            allowBlank: boolean;
            formulae: string[];
            showErrorMessage: boolean;
            showInputMessage: boolean;
            promptTitle: string;
            prompt: string;
          },
        ) => void;
      };
    }).dataValidations;

    validations.add(`G4:G${lastRow}`, {
      type: "list",
      allowBlank: true,
      formulae: ['"✓"'],
      showErrorMessage: false,
      showInputMessage: true,
      promptTitle: "Ceklis",
      prompt: "Pilih ✓ bila pesanan ini benar-benar sudah selesai.",
    });

    // Baris yang sudah dicentang jadi hijau muda agar mudah dipindai.
    sheet.addConditionalFormatting({
      ref: `G4:G${lastRow}`,
      rules: [
        {
          type: "expression",
          priority: 1,
          formulae: ['$G4="✓"'],
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD1FAE5" } } },
        },
      ],
    });

    // Semua sel ceklis diberi warna kuning muda sebagai penanda area yang boleh diisi.
    for (let row = 4; row <= lastRow; row += 1) {
      const cell = sheet.getCell(`G${row}`);
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
      cell.border = {
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
      };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `deadline-${from}${from === to ? "" : `_${to}`}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
