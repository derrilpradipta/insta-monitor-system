/**
 * Pembuat file Excel daftar deadline.
 *
 * Dipakai DUA tempat yang harus menghasilkan file IDENTIK:
 *  1. tombol "Export Excel" di halaman Deadline (unduhan manual)
 *  2. kiriman email otomatis pagi hari
 *
 * Karena itu seluruh pembuatan file tinggal di sini, bukan di dalam route.
 * Kalau formatnya diubah, kedua jalur ikut berubah — tidak ada versi yang
 * tertinggal dan menghasilkan file berbeda untuk data yang sama.
 */

import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateOnlyToDb, formatDateId } from "@/lib/time";

export type FilterDeadline = {
  /** YYYY-MM-DD, waktu WIB. */
  dari: string;
  sampai: string;
  branchId?: string;
  status?: string;
  q?: string;
};

/** Susun klausa Prisma dari filter yang sama seperti halaman Deadline. */
export function whereDeadline(filter: FilterDeadline): Prisma.OrderWhereInput {
  const start = dateOnlyToDb(filter.dari);
  const end = new Date(dateOnlyToDb(filter.sampai).getTime());
  end.setUTCDate(end.getUTCDate() + 1);

  const status = filter.status ?? "";
  const q = (filter.q ?? "").trim();

  return {
    ...(status === "TANPA_TENGGAT" ? { deadlineDate: null } : { deadlineDate: { gte: start, lt: end } }),
    ...(filter.branchId ? { branchId: filter.branchId } : {}),
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
}

export type HasilExcel = {
  buffer: ExcelJS.Buffer;
  fileName: string;
  jumlah: number;
};

/**
 * Bangun file Excel daftar pesanan untuk rentang tenggat tertentu.
 *
 * Kolom Ceklis (G) dan Keterangan (H) sengaja dibiarkan kosong: file ini
 * diisi tim produksi lalu diunggah kembali ke halaman Deadline.
 */
export async function buatExcelDeadline(filter: FilterDeadline): Promise<HasilExcel> {
  const { dari: from, sampai: to } = filter;

  const orders = await prisma.order.findMany({
    where: whereDeadline(filter),
    orderBy: [{ deadlineDate: "asc" }, { branch: { branchName: "asc" } }, { orderNumber: "asc" }],
    include: { branch: { select: { branchName: true } } },
    take: 20_000,
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Instaprint Monitoring System";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Deadline");

  const title = from === to ? `Tenggat ${formatDateId(from)}` : `Tenggat ${formatDateId(from)} – ${formatDateId(to)}`;
  sheet.mergeCells("A1:H1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `Daftar Pesanan — ${title}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { vertical: "middle" };

  sheet.mergeCells("A2:H2");
  const metaCell = sheet.getCell("A2");
  metaCell.value = `Dicetak ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB · ${orders.length} pesanan · Isi kolom "Ceklis" dengan ✓ untuk pesanan yang benar-benar sudah selesai, dan kolom "Keterangan" bila perlu catatan, lalu unggah kembali file ini di halaman Deadline`;
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
    "Keterangan",
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
      order.notes ?? null,
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
    { width: 40 },
  ];
  sheet.views = [{ state: "frozen", ySplit: 3 }];
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 8 } };

  // Kolom Ceklis: dropdown berisi "✓" supaya sekali klik = tercentang.
  const lastRow = sheet.rowCount;
  if (lastRow >= 4) {
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

    for (let row = 4; row <= lastRow; row += 1) {
      const cell = sheet.getCell(`G${row}`);
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
      cell.border = {
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
      };

      const ket = sheet.getCell(`H${row}`);
      ket.alignment = { vertical: "top", wrapText: true };
      ket.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
      ket.border = {
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
      };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer,
    fileName: `deadline-${from}${from === to ? "" : `_${to}`}.xlsx`,
    jumlah: orders.length,
  };
}
