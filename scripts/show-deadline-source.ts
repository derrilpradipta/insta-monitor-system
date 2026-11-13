import "dotenv/config";
import fs from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

/**
 * Tunjukkan dari mana deadline diambil: buka halaman detail pesanan di situs
 * sumber, cetak baris yang memuat "Deadline", dan simpan tangkapan layarnya.
 */
async function main() {
  const order = await prisma.order.findFirst({
    where: { deadlineDate: { not: null } },
    orderBy: { lastScrapedAt: "desc" },
    select: { sourceOrderId: true, orderNumber: true, deadlineDate: true, sourceUrl: true },
  });
  if (!order) throw new Error("Tidak ada pesanan dengan deadline");
  console.log("Pesanan uji:", order.orderNumber, "| deadline di DB:", order.deadlineDate?.toISOString().slice(0, 10));
  console.log("URL sumber    :", order.sourceUrl);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Jakarta" });
  await context.addInitScript("globalThis.__name = function (fn) { return fn; };");
  const page = await context.newPage();

  await page.goto(process.env.SOURCE_LOGIN_URL!, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="username"]', process.env.SCRAPER_USERNAME!);
  await page.fill('input[name="password"]', process.env.SCRAPER_PASSWORD!);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(order.sourceUrl!, { waitUntil: "networkidle" });

  const info = await page.evaluate(() => {
    const raw = document.body.innerText ?? "";
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const hits = lines
      .map((line, i) => ({ line, i }))
      .filter((x) => /deadline/i.test(x.line))
      .map((x) => ({
        line: x.line.slice(0, 160),
        context: lines.slice(Math.max(0, x.i - 2), x.i + 3).join(" // ").slice(0, 300),
      }));
    return { url: location.href, title: document.title, hits, totalLines: lines.length };
  });

  console.log("\nHalaman:", info.url);
  console.log("Judul  :", info.title);
  console.log("\nBaris yang mengandung kata 'Deadline' (", info.hits.length, "):");
  for (const hit of info.hits) {
    console.log("  -", hit.line);
    console.log("    konteks:", hit.context);
  }

  fs.mkdirSync(".smoke", { recursive: true });
  await page.screenshot({ path: ".smoke/source-detail-deadline.png", fullPage: true });
  console.log("\nScreenshot: .smoke/source-detail-deadline.png");

  await browser.close();
  await prisma.$disconnect();
}

main();
