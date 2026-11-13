import "dotenv/config";
import { closeOrphanProcesses } from "../src/lib/sync";
import { prisma } from "../src/lib/db";

async function main() {
  // Perlakukan proses lebih dari 1 menit sebagai orphan (skrip ini hanya untuk pembersihan manual).
  const result = await prisma.scrapingLog.updateMany({
    where: { status: "RUNNING" },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      errorMessage: "Proses sebelumnya terhenti (waktu tunggu habis / server berhenti). Silakan jalankan ulang.",
    },
  });
  console.log("[cleanup] proses RUNNING ditandai gagal:", result.count);
  console.log("[cleanup] orphan (aturan normal):", await closeOrphanProcesses());
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
