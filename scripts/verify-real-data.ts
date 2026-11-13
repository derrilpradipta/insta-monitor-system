import "dotenv/config";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

/**
 * Bukti scraping nyata: ambil satu pesanan dari database, lalu buka halaman
 * detailnya di instasiaga.com dan bandingkan datanya.
 */
async function main() {
  const orders = await prisma.order.findMany({
    orderBy: { lastScrapedAt: "desc" },
    take: 3,
    select: {
      sourceOrderId: true,
      orderNumber: true,
      customerName: true,
      sourceStatus: true,
      deadlineDate: true,
      orderDate: true,
      lastScrapedAt: true,
      sourceUrl: true,
      branch: { select: { branchName: true } },
    },
  });

  console.log("=== 3 pesanan terakhir di database ===");
  for (const order of orders) {
    console.log(
      [
        order.orderNumber,
        `id=${order.sourceOrderId}`,
        order.branch.branchName,
        order.customerName,
        `status="${order.sourceStatus}"`,
        `masuk=${order.orderDate.toISOString().slice(0, 10)}`,
        `tenggat=${order.deadlineDate?.toISOString().slice(0, 10) ?? "-"}`,
      ].join(" | "),
    );
  }

  const target = orders[0];
  if (!target) return;

  console.log("\n=== Bandingkan dengan situs sumber (live) ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ timezoneId: "Asia/Jakarta" });
  await context.addInitScript("globalThis.__name = function (fn) { return fn; };");
  const page = await context.newPage();

  await page.goto(process.env.SOURCE_LOGIN_URL!, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="username"]', process.env.SCRAPER_USERNAME!);
  await page.fill('input[name="password"]', process.env.SCRAPER_PASSWORD!);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(target.sourceUrl!, { waitUntil: "domcontentloaded" });
  const live = await page.evaluate(() => {
    const text = (document.body.innerText ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const grab = (label: string) => {
      const m = text.match(new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i"));
      return m ? m[1]!.trim() : null;
    };
    return {
      url: location.href,
      nota: text.match(/^\s*([A-Z0-9]{6,})\s*-\s*([^\n]+)$/m)?.[1] ?? null,
      outlet: text.match(/^\s*([A-Z0-9]{6,})\s*-\s*([^\n]+)$/m)?.[2] ?? null,
      status: grab("Status Pembayaran"),
      tanggalOrder: grab("Tanggal Order"),
      deadline: grab("Deadline"),
      pelanggan: grab("Nama Pelanggan"),
    };
  });

  console.log("SITUS :", JSON.stringify(live, null, 1));
  console.log("DB    :", JSON.stringify(
    {
      nota: target.orderNumber,
      outlet: target.branch.branchName,
      status: target.sourceStatus,
      customer: target.customerName,
      tenggat: target.deadlineDate?.toISOString().slice(0, 10),
    },
    null,
    1,
  ));

  console.log(
    "\nCOCOK?",
    live.nota === target.orderNumber &&
      (live.pelanggan ?? "").includes(target.customerName.split(" (")[0]!.slice(0, 12)),
  );

  const logs = await prisma.scrapingLog.findMany({
    where: { status: "SUCCESS" },
    orderBy: { startedAt: "desc" },
    take: 4,
    select: { processType: true, startedAt: true, finishedAt: true, totalFound: true, totalCreated: true, totalUpdated: true },
  });
  console.log("\n=== Log proses tersimpan ===");
  for (const log of logs) {
    const seconds = log.finishedAt ? Math.round((log.finishedAt.getTime() - log.startedAt.getTime()) / 1000) : null;
    console.log(`${log.processType} | mulai ${log.startedAt.toISOString()} | ${seconds}s | ditemukan ${log.totalFound}, baru ${log.totalCreated}, diperbarui ${log.totalUpdated}`);
  }

  await browser.close();
  await prisma.$disconnect();
}

main();
