/**
 * Uji nyata scraper terhadap website sumber (tanpa database).
 * Jalankan: npx tsx scripts/test-scraper.ts [YYYY-MM-DD] [YYYY-MM-DD]
 */
import "dotenv/config";
import { InstaprintClient, parseSourceDate, parseSourceDeadlineDate } from "../src/lib/scraper/instaprint";

async function main() {
  const start = process.argv[2] ?? new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const end = process.argv[3] ?? start;
  const client = new InstaprintClient();

  try {
    console.log(`[1] login...`);
    await client.login();
    console.log("[1] login OK");

    console.log(`[2] ambil pesanan ${start} s/d ${end} (semua halaman)`);
    const rows = await client.fetchOrdersForDateRange(start, end, (info) =>
      console.log(`    halaman=${info.page} terkumpul=${info.collected} baris-halaman=${info.pageRows}`),
    );
    console.log(`[2] total pesanan: ${rows.length}`);

    const outlets = [...new Set(rows.map((r) => r.outlet))];
    console.log("[3] cabang ditemukan:", outlets.join(", ") || "(kosong)");

    console.log("[4] contoh 3 baris:");
    for (const row of rows.slice(0, 3)) {
      console.log(
        JSON.stringify({
          id: row.sourceId,
          outlet: row.outlet,
          status: row.sourceStatus,
          nota: row.orderNumber,
          tanggal: row.orderDateRaw,
          produk: row.products.length,
          pelanggan: row.customerRaw,
        }),
      );
    }

    console.log("[5] ambil detail (deadline) untuk 3 pesanan pertama");
    for (const row of rows.slice(0, 3)) {
      const detail = await client.fetchOrderDetail(row.sourceId);
      console.log(
        JSON.stringify({
          id: row.sourceId,
          nota: detail.orderNumber || row.orderNumber,
          outlet: detail.outlet || row.outlet,
          status: detail.paymentStatus,
          tanggalOrder: detail.orderDateRaw,
          tanggalParsed: parseSourceDate(detail.orderDateRaw),
          deadline: detail.deadlineRaw,
          deadlineDate: parseSourceDeadlineDate(detail.deadlineRaw),
          pelanggan: detail.customerName,
          produk: detail.products.slice(0, 3),
        }),
      );
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[GAGAL]", error);
  process.exit(1);
});
