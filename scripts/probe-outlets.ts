/**
 * Probe: daftar outlet (cabang) + cek apakah master produk punya estimasi SLA.
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

  const outlets = await page.evaluate(async () => {
    const res = await fetch("/workflow/get_outlet", { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 2000) };
  });
  console.log("=== get_outlet ===");
  console.log(outlets.status, outlets.body);

  for (const p of ["/product", "/workflow_order"]) {
    try {
      await page.goto(base + p, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(800);
      const info = await page.evaluate(() => {
        const table = document.querySelector("table");
        return {
          headers: table
            ? Array.from(table.querySelectorAll("thead th")).map((c) => (c.textContent ?? "").trim())
            : [],
          firstRow: table
            ? Array.from(table.querySelectorAll("tbody tr")[0]?.querySelectorAll("td") ?? []).map((td) =>
                (td.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
              )
            : [],
          keyword: (document.body.innerText.match(/[^\n]*(estimasi|tenggat|deadline|hari kerja)[^\n]*/gi) ?? []).slice(0, 8),
        };
      });
      console.log("\n=== ", p, " ===");
      console.log(JSON.stringify(info, null, 2));
      fs.writeFileSync(path.join(OUT, `probe${p.replace(/\//g, "_")}.html`), await page.content());
    } catch (e) {
      console.log(p, "gagal", (e as Error).message);
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
