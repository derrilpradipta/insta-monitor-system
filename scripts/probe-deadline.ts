/**
 * Probe lanjutan: cari halaman/fitur yang memuat TANGGAL TENGGAT pesanan.
 * Jalankan: npx tsx scripts/probe-deadline.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT = path.join(process.cwd(), ".probe");
const url = process.env.SOURCE_WEBSITE_URL!;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: process.env.SCRAPER_HEADLESS !== "false" });
  const ctx = await browser.newContext({ locale: "id-ID", timezoneId: "Asia/Jakarta" });
  const page = await ctx.newPage();

  const xhr: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "xhr" || r.resourceType() === "fetch") xhr.push(`${r.method()} ${r.url()}`);
  });

  await page.goto(process.env.SOURCE_LOGIN_URL!, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="username"]', process.env.SCRAPER_USERNAME!);
  await page.fill('input[name="password"]', process.env.SCRAPER_PASSWORD!);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  const targets = [
    "/order_list",
    "/order_list?date1=01-11-2026&date2=12-11-2026&per_page=20",
    "/workflow_production",
    "/workflow_delivery",
    "/product_delivery",
  ];

  for (const t of targets) {
    try {
      const res = await page.goto(url + t, { waitUntil: "domcontentloaded", timeout: 45000 });
      const info = await page.evaluate(() => {
        const table = document.querySelector("table");
        return {
          title: document.title,
          h2: Array.from(document.querySelectorAll("h1,h2,h3,.page-title,.box-title"))
            .map((e) => (e.textContent ?? "").trim())
            .filter(Boolean)
            .slice(0, 5),
          headers: table
            ? Array.from(table.querySelectorAll("thead tr")).map((tr) =>
                Array.from(tr.querySelectorAll("th,td")).map((c) => (c.textContent ?? "").trim()),
              )
            : [],
          rowCount: table ? table.querySelectorAll("tbody tr").length : 0,
          firstRow: table
            ? Array.from(table.querySelectorAll("tbody tr")[0]?.querySelectorAll("td") ?? []).map((td) =>
                (td.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 100),
              )
            : [],
          deadlineWords: (document.body.innerText.match(/[^\n]*(tenggat|deadline|estimasi|target selesai)[^\n]*/gi) ?? []).slice(0, 5),
        };
      });
      const name = t.replace(/[/?=&]/g, "_");
      fs.writeFileSync(path.join(OUT, `${name}.html`), await page.content());
      console.log("\n=== ", t, " HTTP", res?.status(), " ===");
      console.log(JSON.stringify(info, null, 2));
    } catch (e) {
      console.log("\n=== ", t, " GAGAL ===", (e as Error).message);
    }
  }

  console.log("\n=== XHR endpoints ===");
  console.log([...new Set(xhr)].join("\n"));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
