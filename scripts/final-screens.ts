import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

/** Screenshot akhir untuk dokumentasi + cek tampilan mobile. */
async function main() {
  const OUT = path.join(process.cwd(), ".smoke");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  // Login page (desktop)
  const desktop = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await desktop.goto("http://localhost:3100/login", { waitUntil: "networkidle" });
  await desktop.screenshot({ path: path.join(OUT, "final-login.png"), fullPage: false });

  await desktop.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL!);
  await desktop.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD!);
  await Promise.all([
    desktop.waitForNavigation({ waitUntil: "networkidle" }).catch(() => null),
    desktop.click('button[type="submit"]'),
  ]);
  for (const [name, url] of [
    ["final-orders", "http://localhost:3100/orders"],
    ["final-deadline", "http://localhost:3100/deadline"],
    ["final-monthly", "http://localhost:3100/monthly-review"],
  ] as const) {
    await desktop.goto(url, { waitUntil: "networkidle" });
    await desktop.waitForTimeout(800);
    await desktop.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  }

  // Mobile
  const mobile = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  await mobile.goto("http://localhost:3100/login", { waitUntil: "networkidle" });
  await mobile.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL!);
  await mobile.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD!);
  await Promise.all([
    mobile.waitForNavigation({ waitUntil: "networkidle" }).catch(() => null),
    mobile.click('button[type="submit"]'),
  ]);
  await mobile.goto("http://localhost:3100/orders", { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1200);
  await mobile.screenshot({ path: path.join(OUT, "final-mobile-orders.png"), fullPage: false });
  console.log("mobile url:", mobile.url());
  console.log("text:", (await mobile.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 200));

  await browser.close();
}

main();
