import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

/** Uji pemilih tanggal di Orderan + default "hari ini" di Deadline. */
async function main() {
  const OUT = path.join(process.cwd(), ".smoke");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL ?? "admin");
  await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD ?? "");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  // 1) Orderan default = kemarin
  await page.goto("http://localhost:3000/orders", { waitUntil: "networkidle" });
  const ordersDefault = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  console.log("[orderan] deskripsi:", ordersDefault.match(/Pesanan dengan tanggal masuk [^·]+/)?.[0]?.trim());
  console.log("[orderan] total:", ordersDefault.match(/TOTAL PESANAN\s*(\d+)/)?.[1]);
  await page.screenshot({ path: path.join(OUT, "date-orders-default.png"), fullPage: false });

  // 2) Ganti tanggal lewat date picker ke 12 Nov 2026
  await page.fill('input[type="date"]', "2026-11-11");
  await page.waitForTimeout(2500);
  const afterPick = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  console.log("[orderan] setelah pilih 11 Nov ->", page.url());
  console.log("[orderan] deskripsi:", afterPick.match(/Pesanan dengan tanggal masuk [^·]+/)?.[0]?.trim());
  console.log("[orderan] total:", afterPick.match(/TOTAL PESANAN\s*(\d+)/)?.[1]);
  await page.screenshot({ path: path.join(OUT, "date-orders-12nov.png"), fullPage: false });

  // 3) Tanggal tanpa data
  await page.goto("http://localhost:3000/orders?date=2026-09-15", { waitUntil: "networkidle" });
  const empty = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  console.log("[orderan] tanggal kosong:", empty.match(/Belum ada pesanan[^.]*\./)?.[0]);

  // 4) Deadline default harus HARI INI
  await page.goto("http://localhost:3000/deadline", { waitUntil: "networkidle" });
  const deadline = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  console.log("[deadline] deskripsi:", deadline.match(/Pesanan dengan tenggat [^.]+\./)?.[0]);
  console.log("[deadline] nilai date picker:", await page.inputValue('input[type="date"]'));
  console.log("[deadline] total:", deadline.match(/TOTAL PADA TANGGAL INI\s*(\d+)/)?.[1]);
  await page.screenshot({ path: path.join(OUT, "date-deadline-today.png"), fullPage: false });

  // 5) Tombol Besok masih berfungsi
  await page.click('button:has-text("Besok")');
  await page.waitForTimeout(2000);
  const tomorrow = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  console.log("[deadline] setelah klik Besok:", tomorrow.match(/Pesanan dengan tenggat [^.]+\./)?.[0]);

  console.log("[errors]", errors.length ? errors.join(" | ") : "(tidak ada)");
  await browser.close();
}

main();
