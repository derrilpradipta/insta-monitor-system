/**
 * Probe halaman detail pesanan: cari tanggal tenggat / estimasi selesai.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT = path.join(process.cwd(), ".probe");
const base = process.env.SOURCE_WEBSITE_URL!;

async function main() {
  const browser = await chromium.launch({ headless: process.env.SCRAPER_HEADLESS !== "false" });
  const ctx = await browser.newContext({ locale: "id-ID", timezoneId: "Asia/Jakarta" });
  const page = await ctx.newPage();

  await page.goto(process.env.SOURCE_LOGIN_URL!, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="username"]', process.env.SCRAPER_USERNAME!);
  await page.fill('input[name="password"]', process.env.SCRAPER_PASSWORD!);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  // Ambil satu ID detail dari workflow_delivery
  await page.goto(`${base}/workflow_delivery`, { waitUntil: "domcontentloaded" });
  const detailHref = await page.evaluate(() => {
    const a = document.querySelector('a[href*="/workflow_delivery/detail/"]');
    return a?.getAttribute("href") ?? null;
  });
  console.log("detail href:", detailHref);

  if (detailHref) {
    await page.goto(detailHref, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    fs.writeFileSync(path.join(OUT, "delivery_detail.html"), await page.content());
    const info = await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        url: location.href,
        title: document.title,
        labels: Array.from(document.querySelectorAll("label,th,dt,strong,b"))
          .map((e) => (e.textContent ?? "").trim())
          .filter((t) => t && t.length < 40)
          .slice(0, 60),
        dateStrings: Array.from(
          new Set(body.match(/\b\d{1,2}[-/]\d{1,2}[-/]\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/g) ?? []),
        ).slice(0, 30),
        bodySnippet: body.replace(/\s+/g, " ").slice(0, 2500),
      };
    });
    console.log(JSON.stringify(info, null, 2));
  }

  // Cek endpoint selective_detail (modal) untuk satu nota
  const firstNota = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("table tbody tr"));
    for (const r of rows) {
      const cells = Array.from(r.querySelectorAll("td")).map((c) => (c.textContent ?? "").trim());
      if (cells.length >= 6) return cells[5];
    }
    return null;
  });
  console.log("nota contoh:", firstNota);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
