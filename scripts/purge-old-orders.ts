import "dotenv/config";
import { prisma } from "../src/lib/db";

/**
 * Hapus data pesanan di luar bulan berjalan (November 2026).
 * Urutan: review item -> snapshot -> pesanan. Log proses tidak disentuh.
 *
 * Jalankan dengan argumen "execute" untuk benar-benar menghapus:
 *   npx tsx scripts/purge-old-orders.ts execute
 */
const KEEP_YEAR = 2026;
const KEEP_MONTH = 11; // November

async function main() {
  const execute = process.argv[2] === "execute";

  const start = new Date(Date.UTC(KEEP_YEAR, KEEP_MONTH - 1, 1));
  const end = new Date(Date.UTC(KEEP_YEAR, KEEP_MONTH, 1));

  const targets = await prisma.order.findMany({
    where: { OR: [{ orderDate: { lt: start } }, { orderDate: { gte: end } }] },
    select: { id: true, orderNumber: true, orderDate: true },
  });

  const ids = targets.map((o) => o.id);
  console.log(`[purge] pesanan di luar ${KEEP_MONTH}/${KEEP_YEAR}: ${ids.length}`);
  if (ids.length === 0) {
    console.log("[purge] tidak ada yang perlu dihapus");
    return;
  }

  const perMonth = targets.reduce<Record<string, number>>((acc, o) => {
    const key = o.orderDate.toISOString().slice(0, 7);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  console.log("[purge] rincian:", perMonth);

  const snapshots = await prisma.orderSnapshot.count({ where: { orderId: { in: ids } } });
  const reviewItems = await prisma.reviewItem.count({ where: { orderId: { in: ids } } });
  console.log(`[purge] terkait: ${snapshots} snapshot, ${reviewItems} item pemeriksaan`);

  if (!execute) {
    console.log("[purge] DRY RUN — tambahkan argumen 'execute' untuk menghapus.");
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const r = await tx.reviewItem.deleteMany({ where: { orderId: { in: ids } } });
    const s = await tx.orderSnapshot.deleteMany({ where: { orderId: { in: ids } } });
    const o = await tx.order.deleteMany({ where: { id: { in: ids } } });
    return { reviewItems: r.count, snapshots: s.count, orders: o.count };
  });

  console.log("[purge] terhapus:", result);
  console.log("[purge] sisa pesanan:", await prisma.order.count());
  const rows = await prisma.$queryRawUnsafe<{ bulan: string; jumlah: number }[]>(
    `SELECT to_char(order_date, 'YYYY-MM') AS bulan, count(*)::int AS jumlah
     FROM orders GROUP BY 1 ORDER BY 1`,
  );
  console.log("[purge] per bulan sekarang:", rows);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
