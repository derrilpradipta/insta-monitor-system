/**
 * Jalankan pemeriksaan bulanan manual dari CLI.
 * Contoh: npx tsx scripts/run-monthly.ts 2026 11
 */
import "dotenv/config";
import { runMonthlyReview } from "../src/lib/sync";
import { prisma } from "../src/lib/db";

async function main() {
  const year = Number(process.argv[2]);
  const month = Number(process.argv[3]);
  if (!year || !month) throw new Error("Usage: tsx scripts/run-monthly.ts <year> <month>");

  console.log(`[monthly] mulai ${month}/${year}`);
  const started = Date.now();
  const result = await runMonthlyReview({ year, month, createdBy: null });
  console.log("[monthly] selesai dalam", Math.round((Date.now() - started) / 1000), "detik");
  console.log("[monthly]", JSON.stringify({ reviewId: result.reviewId, logId: result.logId, totalOrders: result.totalOrders, result: result.result }, null, 2));
}

main()
  .catch((error) => {
    console.error("[monthly] gagal", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
