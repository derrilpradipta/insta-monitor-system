/**
 * Smoke test UI: login, kunjungi setiap halaman, ambil screenshot + error konsol.
 * Jalankan: npx tsx scripts/smoke-ui.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), ".smoke");

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@instaprint.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

const PAGES: { path: string; name: string }[] = [
  { path: "/orders", name: "orders" },
  { path: "/orders?status=SELESAI", name: "orders-filter-selesai" },
  { path: "/deadline", name: "deadline" },
  { path: "/deadline?date=2026-11-13", name: "deadline-date" },
  { path: "/history", name: "history" },
  { path: "/monthly-review", name: "monthly" },

  { path: "/notifications", name: "notifications" },
  { path: "/profile", name: "profile" },
  { path: "/analysis", name: "analysis" },
];

async function main() {
  if (!ADMIN_PASSWORD) throw new Error("SEED_ADMIN_PASSWORD belum diset");
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "id-ID" });
  const page = await context.newPage();

  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[console] ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  console.log("setelah login:", page.url());
  await page.goto(`${BASE}/monthly-review`, { waitUntil: "domcontentloaded" });
  const reviewId = await page.evaluate(() => {
    const link = document.querySelector('a[href^="/monthly-review/"]');
    const href = link ? link.getAttribute("href") : null;
    return href ? href.split("/").pop() ?? null : null;
  });
  if (reviewId) PAGES.push({ path: `/monthly-review/${reviewId}`, name: "monthly-detail" });
  console.log("review id:", reviewId);
  await page.screenshot({ path: path.join(OUT, "01-after-login.png"), fullPage: true });

  for (const item of PAGES) {
    await page.goto(`${BASE}${item.path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300);
    await page.screenshot({ path: path.join(OUT, `${item.name}.png`), fullPage: true });
    console.log(`\n=== ${item.path} ===\n${text}`);
  }

  console.log("\nERRORS:", errors.length ? errors.slice(0, 20).join("\n") : "(tidak ada)");
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
