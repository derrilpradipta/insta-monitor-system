import "dotenv/config";
import { prisma } from "../src/lib/db";
import { joinProductNames } from "../src/lib/text";

/**
 * Isi ulang nama produk yang kosong ("-") dari snapshot terakhir
 * (produk daftar order) tanpa scraping ulang.
 * Jalankan: npx tsx scripts/backfill-products.ts
 */
async function main() {
  const orders = await prisma.order.findMany({
    where: { productName: "-" },
    select: { id: true, orderNumber: true },
  });
  console.log("[backfill] pesanan tanpa produk:", orders.length);

  let filled = 0;
  for (const order of orders) {
    const snapshot = await prisma.orderSnapshot.findFirst({
      where: { orderId: order.id },
      orderBy: { scrapedAt: "desc" },
      select: { sourceData: true },
    });
    if (!snapshot) continue;

    const data = snapshot.sourceData as {
      list?: { products?: string[] };
      detail?: { products?: { name?: string }[] };
    };
    const names = [
      ...(data.detail?.products ?? []).map((p) => p.name ?? ""),
      ...(data.list?.products ?? []),
    ];
    const productName = joinProductNames(names);
    if (productName === "-") continue;

    await prisma.order.update({ where: { id: order.id }, data: { productName } });
    filled += 1;
  }

  console.log("[backfill] berhasil diisi:", filled);
  console.log("[backfill] sisa tanpa produk:", await prisma.order.count({ where: { productName: "-" } }));
}

main().finally(() => prisma.$disconnect());
