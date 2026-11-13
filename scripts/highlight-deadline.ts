import "dotenv/config";
import { chromium } from "playwright";

/**
 * Tangkap halaman detail pesanan di situs sumber dan sorot baris Deadline,
 * supaya jelas di mana letaknya di UI.
 */
async function main() {
  const id = "313284";
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Jakarta" });
  await ctx.addInitScript("globalThis.__name = function (fn) { return fn; };");
  const page = await ctx.newPage();

  await page.goto(process.env.SOURCE_LOGIN_URL!, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="username"]', process.env.SCRAPER_USERNAME!);
  await page.fill('input[name="password"]', process.env.SCRAPER_PASSWORD!);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`https://www.instasiaga.com/workflow_order/detail/${id}`, { waitUntil: "networkidle" });

  await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("td, div, span, li, p, strong, b"));
    const target = nodes.find((el) => {
      const text = (el.textContent ?? "").trim();
      return /^Deadline\s*:?\s*$/i.test(text) || /^Deadline\s*:\s*\d{2}-\d{2}-\d{4}/i.test(text);
    });
    const row = target?.closest("tr") ?? target?.parentElement ?? null;
    if (row) {
      (row as HTMLElement).style.outline = "3px solid #ef4444";
      (row as HTMLElement).style.outlineOffset = "-2px";
      (row as HTMLElement).scrollIntoView({ block: "center" });
    }
    // Tandai juga baris "Tanggal Order" supaya konteksnya kelihatan.
    const tgl = nodes.find((el) => /^Tanggal Order\s*:?\s*$/i.test((el.textContent ?? "").trim()));
    const tglRow = tgl?.closest("tr") ?? tgl?.parentElement ?? null;
    if (tglRow) {
      (tglRow as HTMLElement).style.outline = "2px dashed #94a3b8";
      (tglRow as HTMLElement).style.outlineOffset = "-2px";
    }
  });

  await page.waitForTimeout(600);
  await page.screenshot({ path: ".smoke/source-deadline-highlight.png", fullPage: false });
  console.log("saved .smoke/source-deadline-highlight.png");
  await browser.close();
}

main();
