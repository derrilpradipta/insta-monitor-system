import "dotenv/config";
import { chromium } from "playwright";

/** Uji endpoint: /api/scraper/run (tanggal kosong), /api/cron, dan proteksi API tanpa login. */
async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1) Tanpa login -> 401
  const unauthorized = await page.request.post("http://localhost:3000/api/scraper/run", { data: {} });
  console.log("[api] tanpa login:", unauthorized.status(), (await unauthorized.text()).slice(0, 80));

  // 2) Cron tanpa secret -> 401
  const cronNoSecret = await page.request.post("http://localhost:3000/api/cron?job=reminders");
  console.log("[cron] tanpa secret:", cronNoSecret.status());
  const cronBadSecret = await page.request.post("http://localhost:3000/api/cron?job=reminders", {
    headers: { "x-cron-secret": "salah" },
  });
  console.log("[cron] secret salah:", cronBadSecret.status());

  // 3) Login lalu jalankan scrape tanggal tanpa pesanan (cepat)
  await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL!);
  await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD!);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  const run = await page.request.post("http://localhost:3000/api/scraper/run", {
    data: { date: "2026-10-01" },
    timeout: 120_000,
  });
  console.log("[api] scrape tanggal kosong:", run.status(), (await run.text()).slice(0, 240));

  // 4) Cron dengan secret benar
  const cronOk = await page.request.post("http://localhost:3000/api/cron?job=cleanup", {
    headers: { "x-cron-secret": process.env.CRON_SECRET! },
  });
  console.log("[cron] cleanup:", cronOk.status(), (await cronOk.text()).slice(0, 160));

  await browser.close();
}

main();
