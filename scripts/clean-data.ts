/**
 * Rapikan nama pelanggan dan nama produk yang sudah tersimpan
 * memakai aturan normalisasi terbaru (tanpa scraping ulang).
 * Jalankan: npx tsx scripts/clean-data.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { cleanCustomerName, joinProductNames } from "../src/lib/text";

async function main() {
  const orders = await prisma.order.findMany({
    select: { id: true, customerName: true, productName: true },
  });

  let changed = 0;
  for (const order of orders) {
    const customerName = cleanCustomerName(order.customerName);
    const productName = joinProductNames(order.productName.split(";"));
    if (customerName !== order.customerName || productName !== order.productName) {
      await prisma.order.update({
        where: { id: order.id },
        data: { customerName: customerName || "-", productName: productName || "-" },
      });
      changed += 1;
    }
  }

  console.log(`[clean] ${orders.length} pesanan diperiksa, ${changed} diperbarui`);
  const sample = await prisma.order.findMany({ select: { customerName: true, productName: true }, take: 5, orderBy: { orderDate: "desc" } });
  for (const row of sample) console.log(`  ${row.customerName} | ${row.productName.slice(0, 90)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
