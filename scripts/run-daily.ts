/**
 * Jalankan pengambilan data harian secara manual ke database.
 * Contoh: npx tsx scripts/run-daily.ts 2026-11-11
 * Tanpa argumen: memakai tanggal kemarin (WIB).
 */
import "dotenv/config";
import { runDailyScrape } from "../src/lib/sync";
import { prisma } from "../src/lib/db";

async function main() {
  const date = process.argv[2];
  console.log(`[run] mulai pengambilan harian ${date ?? "(kemarin WIB)"}`);
  const { logId, result } = await runDailyScrape(date, "manual-script");
  console.log("[run] log:", logId);
  console.log("[run] hasil:", JSON.stringify(result, null, 2));
  const total = await prisma.order.count();
  console.log("[run] total pesanan di database:", total);
}

main()
  .catch((error) => {
    console.error("[run] gagal", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
