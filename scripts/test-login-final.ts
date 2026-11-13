import "dotenv/config";
import { chromium } from "playwright";

/**
 * Verifikasi akhir login: tunggu respons POST /login yang sebenarnya
 * (bukan jeda tetap), lalu pastikan diarahkan ke /orders.
 */
async function main() {
  const browser = await chromium.launch({ headless: true });
  let ok = 0;

  for (let i = 1; i <= 10; i += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL ?? "admin");
    await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD ?? "");

    const [response] = await Promise.all([
      page.waitForResponse((res) => res.request().method() === "POST" && res.url().endsWith("/login"), {
        timeout: 30_000,
      }),
      page.click('button[type="submit"]'),
    ]);

    await page.waitForURL("**/orders", { timeout: 30_000 }).catch(() => null);
    const success = page.url().endsWith("/orders");
    if (success) ok += 1;
    console.log(
      `#${i} HTTP ${response.status()} -> ${page.url().replace("http://localhost:3000", "")}`,
    );
    await context.close();
  }

  console.log(`HASIL: ${ok}/10 login berhasil`);
  await browser.close();
}

main();
