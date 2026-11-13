import "dotenv/config";
import { chromium } from "playwright";

/** Pastikan date picker di Deadline juga bisa diklik. */
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => {
      const b = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      return Boolean(b && !b.disabled);
    },
    { timeout: 25000 },
  );
  await page.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL ?? "admin");
  await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD ?? "");
  await Promise.all([
    page.waitForURL(/\/orders/, { timeout: 25000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  await page.goto("http://localhost:3000/deadline", { waitUntil: "networkidle" });
  await page.waitForSelector('input[type="date"]', { timeout: 25000 });
  await page.waitForTimeout(600);
  const input = page.locator('input[type="date"]').first();
  const box = await input.boundingBox();
  console.log("deadline input box:", box);
  await input.click();
  await page.waitForTimeout(300);
  console.log("fokus setelah klik:", await input.evaluate((el) => el === document.activeElement));
  await input.fill("2026-11-20");
  await page.waitForTimeout(2200);
  console.log("url:", page.url());
  await page.screenshot({ path: ".smoke/datepicker-deadline.png" });
  await browser.close();
}

main();
