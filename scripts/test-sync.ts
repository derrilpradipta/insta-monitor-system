import "dotenv/config";
import { syncActiveOrderStatuses } from "../src/lib/sync";
import { prisma } from "../src/lib/db";

/** Uji sinkronisasi status dengan batas umur pesanan kecil agar cepat. */
async function main() {
  process.env.SYNC_MAX_AGE_DAYS = process.argv[2] ?? "2";
  const started = Date.now();
  const result = await syncActiveOrderStatuses("uji-sync");
  console.log("[sync] selesai dalam", Math.round((Date.now() - started) / 1000), "detik");
  console.log("[sync]", result);
}

main()
  .catch((error) => {
    console.error("[sync] gagal", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
