/**
 * Uji alur checklist pemeriksaan bulanan memakai data yang SUDAH ada di database
 * (tanpa scraping ulang), lalu membatalkannya kembali.
 * Jalankan: npx tsx scripts/test-review-checklist.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { monthRangeWib } from "../src/lib/time";

async function main() {
  const review = await prisma.monthlyReview.upsert({
    where: { year_month: { year: 2026, month: 11 } },
    update: {},
    create: { year: 2026, month: 11, status: "COMPLETED", finishedAt: new Date(), createdBy: null },
  });
  console.log("[uji] review id:", review.id);

  const range = monthRangeWib(2026, 11);
  const orders = await prisma.order.findMany({
    where: { orderDate: { gte: range.start, lt: range.end }, monitoringStatus: "BELUM_SELESAI" },
    select: { id: true, branchId: true, orderNumber: true },
    take: 5,
  });
  console.log("[uji] pesanan belum selesai:", orders.length);
  if (orders.length === 0) return;

  for (const order of orders) {
    await prisma.reviewItem.upsert({
      where: { monthlyReviewId_orderId: { monthlyReviewId: review.id, orderId: order.id } },
      update: { branchId: order.branchId },
      create: { monthlyReviewId: review.id, orderId: order.id, branchId: order.branchId },
    });
  }

  const items = await prisma.reviewItem.findMany({
    where: { monthlyReviewId: review.id },
    take: 1,
    include: { order: { select: { orderNumber: true } } },
  });
  const item = items[0];
  if (!item) return;

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("Admin tidak ditemukan; jalankan seed dulu");

  // Konfirmasi manual (simulasi aksi pimpinan)
  await prisma.reviewItem.update({
    where: { id: item.id },
    data: { reviewStatus: "DONE", checkedBy: admin.id, checkedAt: new Date() },
  });
  await prisma.order.update({
    where: { id: item.orderId },
    data: {
      monitoringStatus: "SELESAI",
      monitoringStatusSource: "MANUAL",
      monitoringStatusChangedAt: new Date(),
      manualConfirmed: true,
      manualConfirmedBy: admin.id,
      manualConfirmedAt: new Date(),
    },
  });
  const after = await prisma.order.findUnique({ where: { id: item.orderId } });
  console.log(
    `[uji] ${item.order.orderNumber} -> monitoring=${after?.monitoringStatus} source=${after?.sourceStatus} manual=${after?.manualConfirmed}`,
  );

  // Kembalikan seperti semula
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
  console.log("[uji] status dikembalikan, selesai");
}

main()
  .catch((error) => {
    console.error("[uji] gagal", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
