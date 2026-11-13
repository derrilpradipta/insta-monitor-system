import "dotenv/config";
import { chromium } from "playwright";

/** Uji centang lalu batalkan pada baris yang sama (berpindah filter setelah status berubah). */
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

  await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL!);
  await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD!);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  await page.goto("http://localhost:3000/monthly-review", { waitUntil: "domcontentloaded" });
  const href = await page.getAttribute('a[href^="/monthly-review/"]', "href");
  const baseUrl = `http://localhost:3000${href}`;
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const label = await page.locator('[role="checkbox"]').first().getAttribute("aria-label");
  console.log("baris diuji:", label);

  await page.locator('[role="checkbox"]').first().click();
  await page.waitForTimeout(2500);
  console.log(
    "setelah centang, masih di daftar 'belum diperiksa'?",
    (await page.locator(`[aria-label="${label}"]`).count()) > 0,
  );

  await page.goto(`${baseUrl}?status=DONE`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const doneBox = page.locator(`[aria-label="${label}"]`);
  console.log("ada di daftar 'sudah diperiksa'?", (await doneBox.count()) > 0);

  if ((await doneBox.count()) > 0) {
    await doneBox.first().click();
    await page.waitForTimeout(2500);
    console.log(
      "setelah batal, masih ada di daftar 'sudah diperiksa'?",
      (await page.locator(`[aria-label="${label}"]`).count()) > 0,
    );
  }

  await browser.close();
}

main();
