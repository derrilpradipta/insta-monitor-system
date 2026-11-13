import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

/** Smoke test singkat setelah pembersihan data Oktober. */
async function main() {
  const OUT = path.join(process.cwd(), ".smoke");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      return Boolean(btn && !btn.disabled);
    },
    { timeout: 25000 },
  );
  await page.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL ?? "admin");
  await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD ?? "");
  await Promise.all([
    page.waitForURL(/\/orders/, { timeout: 25000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  const check = async (url: string, label: string) => {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const t = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const rows = await page.locator("table tbody tr").count();
    console.log(`[${label}] baris=${rows} | ${t.match(/TOTAL[^0-9]{0,30}(\d+)/)?.[0] ?? t.slice(0, 90)}`);
    return t;
  };

  await check("http://localhost:3000/orders", "orderan kemarin");
  await check("http://localhost:3000/orders?date=2026-11-01", "orderan 1 Nov");
  await check("http://localhost:3000/orders?date=2026-10-05", "orderan 5 Okt (harus kosong)");
  const deadline = await check("http://localhost:3000/deadline", "deadline hari ini");
  await check("http://localhost:3000/deadline?status=TANPA_TENGGAT", "tanpa tenggat");
  await check("http://localhost:3000/history", "riwayat");
  await check("http://localhost:3000/monthly-review", "pemeriksaan bulanan");
  await check("http://localhost:3000/analysis", "analisis");

  await page.goto("http://localhost:3000/orders?date=2026-10-05", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "after-cleanup-oct-empty.png") });
  await page.goto("http://localhost:3000/orders", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "after-cleanup-orders.png") });

  console.log("[errors]", errors.length ? errors.join(" | ") : "(tidak ada)");
  console.log("[deadline] potongan:", deadline.slice(0, 160));
  await browser.close();
}

main();
