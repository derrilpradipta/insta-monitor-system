import "dotenv/config";
import { prisma } from "../src/lib/db";

/** Verifikasi setelah pembersihan: tidak ada data yatim / referensi rusak. */
async function main() {
  const orphans = {
    snapshots: await prisma.orderSnapshot.count({ where: { order: { is: undefined } } }).catch(() => -1),
  };

  const [orders, snapshots, reviewItems, reviews] = await Promise.all([
    prisma.order.count(),
    prisma.orderSnapshot.count(),
    prisma.reviewItem.count(),
    prisma.monthlyReview.count(),
  ]);
  console.log("orders:", orders, "| snapshots:", snapshots, "| review_items:", reviewItems, "| monthly_reviews:", reviews);

  // Snapshot tanpa pesanan (harus 0)
  const orphanSnapshots = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM order_snapshots s LEFT JOIN orders o ON o.id = s.order_id WHERE o.id IS NULL`,
  );
  const orphanReviews = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM review_items r LEFT JOIN orders o ON o.id = r.order_id WHERE o.id IS NULL`,
  );
  console.log("snapshot yatim:", orphanSnapshots[0]?.n, "| review item yatim:", orphanReviews[0]?.n);

  // Rentang tanggal yang tersisa
  const range = await prisma.order.aggregate({ _min: { orderDate: true }, _max: { orderDate: true } });
  console.log("rentang tanggal masuk:", range._min.orderDate?.toISOString().slice(0, 10), "→", range._max.orderDate?.toISOString().slice(0, 10));

  const perDay = await prisma.$queryRawUnsafe<{ hari: string; jumlah: number }[]>(
    `SELECT to_char(order_date, 'DD Mon') AS hari, count(*)::int AS jumlah FROM orders GROUP BY order_date ORDER BY order_date`,
  );
  console.log("per hari:", perDay.map((d) => `${d.hari}=${d.jumlah}`).join("  "));

  console.log("tanpa deadline:", await prisma.order.count({ where: { deadlineDate: null } }));
  void orphans;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
