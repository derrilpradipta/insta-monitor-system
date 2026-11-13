import "dotenv/config";
import { prisma } from "../src/lib/db";
import { InstaprintClient, parseSourceDeadlineDate, parseSourceDate } from "../src/lib/scraper/instaprint";
import { dateOnlyToDb } from "../src/lib/time";

/**
 * Isi ulang deadline pesanan yang masih kosong dengan mengambil halaman detail
 * dari situs sumber (termasuk fallback ke deadline per produk).
 */
async function main() {
  const orders = await prisma.order.findMany({
    where: { deadlineDate: null },
    select: { id: true, orderNumber: true, sourceOrderId: true, sourceUrl: true },
  });
  console.log("[deadline] pesanan tanpa deadline:", orders.length);

  const scraper = new InstaprintClient();
  let filled = 0;
  let stillEmpty = 0;
  let failed = 0;

  try {
    for (const [index, order] of orders.entries()) {
      try {
        const detail = await scraper.fetchOrderDetail(order.sourceOrderId);
        let deadline = parseSourceDeadlineDate(detail.deadlineRaw ?? null);
        if (!deadline && detail.products.length) {
          const candidates = detail.products
            .map((p) => p.deadlineRaw)
            .filter((v): v is string => Boolean(v))
            .filter((v) => parseSourceDate(v) !== null)
            .sort((a, b) => (parseSourceDate(a) ?? "").localeCompare(parseSourceDate(b) ?? ""));
          deadline = parseSourceDeadlineDate(candidates.at(-1) ?? null);
        }

        if (deadline) {
          await prisma.order.update({
            where: { id: order.id },
            data: { deadlineDate: dateOnlyToDb(deadline), lastScrapedAt: new Date() },
          });
          filled += 1;
          console.log(`  ${index + 1}/${orders.length} ${order.orderNumber} -> ${deadline}`);
        } else {
          stillEmpty += 1;
          console.log(`  ${index + 1}/${orders.length} ${order.orderNumber} -> tetap kosong (sumber tidak punya deadline)`);
        }
      } catch (error) {
        failed += 1;
        console.error(`  ${order.orderNumber} gagal:`, (error as Error).message);
      }
    }
  } finally {
    await scraper.close();
  }

  console.log("[deadline] terisi:", filled, "| tetap kosong:", stillEmpty, "| gagal:", failed);
  console.log("[deadline] sisa tanpa deadline:", await prisma.order.count({ where: { deadlineDate: null } }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
