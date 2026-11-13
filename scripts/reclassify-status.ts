/**
 * Hitung ulang kategori status sumber & status pemantauan untuk seluruh pesanan
 * memakai aturan normalisasi terbaru. Tidak mengubah konfirmasi manual.
 * Jalankan: npx tsx scripts/reclassify-status.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { categorizeSourceStatus, monitoringFromSource } from "../src/lib/status";

async function main() {
  const orders = await prisma.order.findMany({
    select: {
      id: true,
      orderNumber: true,
      sourceStatus: true,
      sourceStatusCategory: true,
      monitoringStatus: true,
      manualConfirmed: true,
    },
  });

  let categoryChanged = 0;
  let statusChanged = 0;

  for (const order of orders) {
    const category = categorizeSourceStatus(order.sourceStatus);
    const fromSource = monitoringFromSource(category);
    const nextStatus =
      order.manualConfirmed && order.monitoringStatus === "SELESAI"
        ? order.monitoringStatus
        : fromSource;

    if (category !== order.sourceStatusCategory || nextStatus !== order.monitoringStatus) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          sourceStatusCategory: category,
          monitoringStatus: nextStatus,
          ...(nextStatus !== order.monitoringStatus
            ? { monitoringStatusSource: "AUTO" as const, monitoringStatusChangedAt: new Date() }
            : {}),
        },
      });
      if (category !== order.sourceStatusCategory) categoryChanged += 1;
      if (nextStatus !== order.monitoringStatus) statusChanged += 1;
    }
  }

  console.log(`[reclassify] ${orders.length} pesanan diperiksa`);
  console.log(`[reclassify] kategori berubah: ${categoryChanged}, status pemantauan berubah: ${statusChanged}`);

  const byCategory = await prisma.order.groupBy({
    by: ["sourceStatus", "sourceStatusCategory"],
    _count: { _all: true },
    orderBy: { _count: { sourceStatus: "desc" } },
  });
  console.log("[reclassify] distribusi status sumber:");
  for (const row of byCategory) {
    console.log(`  ${row.sourceStatusCategory.padEnd(12)} ${String(row._count._all).padStart(4)}  ${row.sourceStatus}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
