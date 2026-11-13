/** Helper uji jalur gagal: login dengan kredensial salah. */
import { runScrape } from "../src/lib/sync";
import { wibDateString } from "../src/lib/time";
import { chromium } from "playwright";

export async function runScrapeFailureProbe(creds: { username: string; password: string }) {
  // Pastikan halaman login benar-benar menolak kredensial ini sebelum menguji runScrape.
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  await page.goto(process.env.SOURCE_LOGIN_URL!, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="username"]', creds.username);
  await page.fill('input[name="password"]', creds.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  const rejected = /\/login\/?$/.test(new URL(page.url()).pathname);
  await browser.close();

  if (!rejected) {
    return { skipped: true, reason: "Kredensial salah ternyata diterima; uji dibatalkan." };
  }

  // Paksa runScrape memakai kredensial salah (nilai env asli dipulihkan setelahnya).
  const originalPassword = process.env.SCRAPER_PASSWORD;
  process.env.SCRAPER_PASSWORD = creds.password;
  try {
    await runScrape({
      startDate: wibDateString(),
      endDate: wibDateString(),
      processType: "DAILY_SCRAPE",
      fetchDetails: false,
      triggeredBy: "uji-gagal",
    });
    return { skipped: false, failedAsExpected: false };
  } catch (error) {
    return { skipped: false, failedAsExpected: true, message: (error as Error).message };
  } finally {
    process.env.SCRAPER_PASSWORD = originalPassword;
  }
}
