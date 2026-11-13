import "dotenv/config";
import { prisma } from "../src/lib/db";

/** Kembalikan seluruh konfirmasi checklist uji ke keadaan belum diperiksa. */
async function main() {
  const items = await prisma.reviewItem.findMany({ where: { reviewStatus: "DONE" }, select: { id: true, orderId: true } });
  console.log("[reset] item DONE:", items.length);

  for (const item of items) {
    await prisma.reviewItem.update({
      where: { id: item.id },
      data: { reviewStatus: "PENDING", checkedBy: null, checkedAt: null },
    });
    await prisma.order.update({
      where: { id: item.orderId },
      data: {
        monitoringStatus: "BELUM_SELESAI",
        monitoringStatusSource: null,
        monitoringStatusChangedAt: null,
        manualConfirmed: false,
        manualConfirmedBy: null,
        manualConfirmedAt: null,
      },
    });
  }

  const done = await prisma.reviewItem.count({ where: { reviewStatus: "DONE" } });
  const manual = await prisma.order.count({ where: { manualConfirmed: true } });
  console.log("[reset] sisa DONE:", done, "| manual confirmed:", manual);
}

main().finally(() => prisma.$disconnect());
