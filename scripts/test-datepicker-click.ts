import "dotenv/config";
import fs from "node:fs";
import { chromium } from "playwright";

/** Uji apakah kontrol tanggal bisa diklik & membuka kalender. */
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

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

  await page.goto("http://localhost:3000/orders", { waitUntil: "networkidle" });
  await page.waitForSelector('input[type="date"]', { timeout: 25000 });
  await page.waitForTimeout(800);

  const input = page.locator('input[type="date"]').first();
  console.log("disabled?", await input.isDisabled());
  console.log("visible?", await input.isVisible());
  console.log("box:", await input.boundingBox());
  console.log("has showPicker?", await input.evaluate((el) => typeof (el as HTMLInputElement).showPicker === "function"));

  // Klik input → harus fokus (kalender native tidak bisa diuji headless, tapi
  // minimal kontrolnya merespons klik dan tidak mati).
  await input.click();
  await page.waitForTimeout(400);
  console.log("focused after click?", await input.evaluate((el) => el === document.activeElement));

  // Indikator kalender native harus ada dan bisa diklik
  const indicator = await input.evaluate((el) => {
    const style = getComputedStyle(el, "::-webkit-calendar-picker-indicator");
    return { display: style.display, cursor: style.cursor };
  }).catch(() => null);
  console.log("indikator native:", JSON.stringify(indicator));
  const box = await input.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width - 12, box.y + box.height / 2);
    await page.waitForTimeout(400);
    console.log("focused after klik ikon kanan?", await input.evaluate((el) => el === document.activeElement));
  }

  // Ganti tanggal lewat input (jalur yang dipakai pengguna saat memilih)
  await input.fill("2026-11-10");
  await page.waitForTimeout(2500);
  console.log("url setelah pilih 10 Nov:", page.url());
  const t = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  console.log("deskripsi:", t.match(/Pesanan dengan tanggal masuk [^·]+/)?.[0]?.trim());
  console.log("total:", t.match(/TOTAL PESANAN\s*(\d+)/)?.[1]);

  fs.mkdirSync(".smoke", { recursive: true });
  await page.screenshot({ path: ".smoke/datepicker-fixed.png" });
  console.log("[errors]", errors.length ? errors.join(" | ") : "(tidak ada)");
  await browser.close();
}

main();
