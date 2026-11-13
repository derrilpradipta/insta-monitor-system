import "dotenv/config";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  await ctx.addInitScript("globalThis.__name = function (fn) { return fn; };");
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForFunction(
    () => {
      const b = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      return Boolean(b && !b.disabled);
    },
    { timeout: 30000 },
  );
  await page.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL ?? "frankyinsta");
  await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD ?? "");
  await Promise.all([page.waitForURL(/\/deadline/, { timeout: 40000 }), page.click('button[type="submit"]')]);
  console.log("1. login ->", page.url().replace(BASE, ""));

  const bigTotal = await page.locator("section p.tabular-nums").first().textContent();
  console.log("2. total hari ini:", bigTotal?.trim());

  // Mode rentang
  await page.click('button:has-text("Rentang")');
  await page.waitForURL(/mode=rentang/, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const totalRange = await page.locator("section p.tabular-nums").first().textContent();
  console.log("3. mode rentang aktif:", page.url().replace(BASE, ""), "| total:", totalRange?.trim());
  await page.screenshot({ path: ".smoke/dl-rentang.png" });

  // Mode bulan
  await page.click('button:has-text("Bulan")');
  await page.waitForURL(/mode=bulan/, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const totalMonth = await page.locator("section p.tabular-nums").first().textContent();
  console.log("4. mode bulan aktif:", page.url().replace(BASE, ""), "| total:", totalMonth?.trim());
  await page.screenshot({ path: ".smoke/dl-bulan.png" });

  // Export Excel dari mode bulan
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 45000 }),
    page.click('a:has-text("Export Excel")'),
  ]);
  const path = ".smoke/export-bulan.xlsx";
  await download.saveAs(path);
  console.log("5. export terunduh:", download.suggestedFilename());

  // Mode tanggal lagi + cek stats lama sudah hilang
  await page.goto(`${BASE}/deadline`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const body = await page.locator("body").innerText();
  console.log("6. label lama masih ada?", {
    "Belum selesai": body.includes("Belum selesai"),
    "Terlambat": body.includes("Terlambat"),
  });
  const navLabels = await page.locator("aside a, nav a").allInnerTexts();
  console.log("7. menu sidebar:", navLabels.map((t) => t.trim()).filter(Boolean).join(" | "));

  // Tab tanpa tenggat
  await page.click('a:has-text("Tanpa tenggat")');
  await page.waitForURL(/TANPA_TENGGAT/, { timeout: 20000 });
  await page.waitForTimeout(1200);
  console.log("8. halaman tanpa tenggat:", page.url().replace(BASE, ""));
  const noDeadlineTotal = await page.locator("section p.tabular-nums").first().textContent();
  console.log("   total:", noDeadlineTotal?.trim());

  await page.screenshot({ path: ".smoke/dl-tanpa-tenggat.png" });
  await browser.close();
}

main().catch((error) => {
  console.error("GAGAL:", error.message);
  process.exit(1);
});
