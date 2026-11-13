import "dotenv/config";
import { prisma } from "../src/lib/db";

/** Ringkasan data per bulan sebelum pembersihan. */
async function main() {
  const rows = await prisma.$queryRawUnsafe<{ bulan: string; jumlah: number }[]>(
    `SELECT to_char(order_date, 'YYYY-MM') AS bulan, count(*)::int AS jumlah
     FROM orders GROUP BY 1 ORDER BY 1`,
  );
  console.log("pesanan per bulan (orderDate):");
  for (const r of rows) console.log(" ", r.bulan, r.jumlah);
  console.log("total orders:", await prisma.order.count());
  console.log("order_snapshots:", await prisma.orderSnapshot.count());
  console.log("review_items:", await prisma.reviewItem.count());
  console.log("monthly_reviews:", await prisma.monthlyReview.count());

  const rev = await prisma.monthlyReview.findMany({
    select: { id: true, month: true, year: true, status: true, _count: { select: { items: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  console.log("daftar review:", rev.map((r) => `${r.month}/${r.year} ${r.status} items=${r._count.items}`));

  console.log("scraping_logs:", await prisma.scrapingLog.count());
  const logs = await prisma.scrapingLog.groupBy({ by: ["processType"], _count: { _all: true } });
  console.log("log per tipe:", logs.map((l) => `${l.processType}=${l._count._all}`).join(", "));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
