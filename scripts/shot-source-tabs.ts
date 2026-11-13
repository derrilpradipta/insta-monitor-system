import "dotenv/config";
import { chromium } from "playwright";

/** Screenshot tab "Daftar Pesanan" vs "Verifikasi Pesanan" untuk 12 Nov. */
async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, timezoneId: "Asia/Jakarta" });
  await ctx.addInitScript("globalThis.__name = function (fn) { return fn; };");
  const page = await ctx.newPage();

  await page.goto(process.env.SOURCE_LOGIN_URL!, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="username"]', process.env.SCRAPER_USERNAME!);
  await page.fill('input[name="password"]', process.env.SCRAPER_PASSWORD!);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  // Tab "Daftar Pesanan" difilter 12 Nov
  await page.goto("https://www.instasiaga.com/order_list?date1=12-11-2026&date2=12-11-2026", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1200);
  const daftar = await page.evaluate(() => {
    const rows = document.querySelectorAll("table tbody tr").length;
    const info = document.querySelector(".dataTables_info")?.textContent?.trim() ?? "";
    return { rows, info };
  });
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll(".nav-tabs a, .nav a"));
    const t = tabs.find((a) => /Daftar Pesanan/i.test(a.textContent ?? ""));
    if (t) {
      (t as HTMLElement).style.outline = "3px solid #16a34a";
      (t as HTMLElement).style.outlineOffset = "2px";
    }
  });
  await page.screenshot({ path: ".smoke/source-tab-daftar-pesanan.png" });
  console.log("Daftar Pesanan 12 Nov:", JSON.stringify(daftar));

  // Tab "Verifikasi Pesanan" (/workflow_order)
  await page.goto("https://www.instasiaga.com/workflow_order", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const wf = await page.evaluate(() => {
    const rows = document.querySelectorAll("table tbody tr").length;
    const info = document.querySelector(".dataTables_info")?.textContent?.trim() ?? "";
    const dates = Array.from(document.querySelectorAll("input[name=start_date], input[name=end_date]")).map(
      (i) => (i as HTMLInputElement).value,
    );
    return { rows, info, dates };
  });
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll(".nav-tabs a, .nav a"));
    const t = tabs.find((a) => /Verifikasi Pesanan/i.test(a.textContent ?? ""));
    if (t) {
      (t as HTMLElement).style.outline = "3px solid #dc2626";
      (t as HTMLElement).style.outlineOffset = "2px";
    }
  });
  await page.screenshot({ path: ".smoke/source-tab-verifikasi-pesanan.png" });
  console.log("Verifikasi Pesanan (default filter):", JSON.stringify(wf));

  await browser.close();
}

main();
