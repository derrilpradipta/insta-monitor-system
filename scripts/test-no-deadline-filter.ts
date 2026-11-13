import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

/** Uji filter "Tanpa tenggat" di halaman Deadline + label kolom kosong. */
async function main() {
  const OUT = path.join(process.cwd(), ".smoke");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Login: tunggu hidrasi selesai (tombol submit disabled sampai React siap).
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
  console.log("[login] url:", page.url());

  const open = async (url: string, waitFor: string) => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(waitFor, { timeout: 25000 });
    await page.waitForTimeout(700);
  };

  // 1) Deadline normal (hari ini)
  await open("http://localhost:3000/deadline", 'select[name="status"]');
  const normal = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  console.log("[deadline] deskripsi:", normal.match(/Pesanan dengan tenggat [^.]+\./)?.[0]);
  const opts = await page.locator('select[name="status"] option').allTextContents();
  console.log("[deadline] opsi status:", opts.map((o) => o.trim()).join(" | "));
  await page.screenshot({ path: path.join(OUT, "deadline-normal.png") });

  // 2) Filter Tanpa tenggat lewat dropdown
  await page.selectOption('select[name="status"]', "TANPA_TENGGAT");
  await Promise.all([
    page.waitForURL(/status=TANPA_TENGGAT/, { timeout: 25000 }).catch(() => null),
    page.locator('form:has(select[name="status"]) button[type="submit"]').click(),
  ]);
  await page.waitForTimeout(2500);
  const noDl = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  console.log("[tanpa tenggat] url:", page.url());
  console.log("[tanpa tenggat] deskripsi:", noDl.match(/Pesanan tanpa tenggat[^.]*\./)?.[0]);
  console.log("[tanpa tenggat] total:", noDl.match(/TOTAL TANPA TENGGAT\s*(\d+)/)?.[1]);
  const rows = await page.locator("table tbody tr").count();
  const emptyLabels = await page.locator("table tbody td", { hasText: "Tanpa tenggat" }).count();
  console.log("[tanpa tenggat] baris tabel:", rows, "| sel berlabel 'Tanpa tenggat':", emptyLabels);
  await page.screenshot({ path: path.join(OUT, "deadline-tanpa-tenggat.png") });

  // 3) Pintasan di header
  await open("http://localhost:3000/deadline?date=2026-11-13", 'select[name="status"]');
  await page.getByRole("link", { name: /Tanpa tenggat/i }).first().click();
  await page.waitForTimeout(2500);
  console.log("[pintasan] url:", page.url());
  console.log(
    "[pintasan] date picker:",
    await page.locator('input[type="date"]').count(),
    "| link 'Kembali ke tanggal':",
    await page.getByRole("link", { name: /Kembali ke tanggal/i }).count(),
  );

  // 4) Kolom tenggat di Orderan juga menandai kosong
  await open("http://localhost:3000/orders?date=2026-11-12", "table tbody tr");
  const ordersText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  console.log("[orderan] ada teks 'Tanpa tenggat':", /Tanpa tenggat/.test(ordersText));

  console.log("[errors]", errors.length ? errors.join(" | ") : "(tidak ada)");
  await browser.close();
}

main();
