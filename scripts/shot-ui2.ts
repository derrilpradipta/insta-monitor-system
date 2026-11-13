import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

/** Tangkap semua halaman utama untuk review desain. */
async function main() {
  const OUT = path.join(process.cwd(), ".smoke");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 960 } })).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("http://localhost:3200/login", { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => {
      const b = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      return Boolean(b && !b.disabled);
    },
    { timeout: 30000 },
  );
  await page.screenshot({ path: path.join(OUT, "ui2-login.png") });

  await page.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL ?? "admin");
  await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD ?? "");
  await Promise.all([
    page.waitForURL(/\/orders/, { timeout: 30000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  const shots: [string, string][] = [
    ["/orders", "ui2-orders"],
    ["/deadline", "ui2-deadline"],
    ["/history", "ui2-history"],
    ["/analysis", "ui2-analysis"],
    ["/monthly-review", "ui2-monthly"],
    ["/notifications", "ui2-notifications"],
    ["/profile", "ui2-profile"],
  ];

  for (const [url, name] of shots) {
    await page.goto(`http://localhost:3200${url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log(`captured ${url}`);
  }

  // tampilan mobile
  const mobile = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await mobile.goto("http://localhost:3200/login", { waitUntil: "networkidle" });
  await mobile.waitForFunction(
    () => {
      const b = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      return Boolean(b && !b.disabled);
    },
    { timeout: 30000 },
  );
  await mobile.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL ?? "admin");
  await mobile.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD ?? "");
  await Promise.all([
    mobile.waitForURL(/\/orders/, { timeout: 30000 }).catch(() => null),
    mobile.click('button[type="submit"]'),
  ]);
  await mobile.waitForTimeout(1500);
  await mobile.screenshot({ path: path.join(OUT, "ui2-orders-mobile.png"), fullPage: false });
  console.log("captured mobile");

  console.log("[errors]", errors.length ? errors.join(" | ") : "(tidak ada)");
  await browser.close();
}

main();
