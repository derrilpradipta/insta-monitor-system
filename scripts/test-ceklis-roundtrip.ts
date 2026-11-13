import "dotenv/config";
import ExcelJS from "exceljs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  await ctx.addInitScript("globalThis.__name = function (fn) { return fn; };");
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForFunction(() => {
    const b = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    return Boolean(b && !b.disabled);
  }, { timeout: 30000 });
  await page.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL ?? "frankyinsta");
  await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD ?? "");
  await Promise.all([page.waitForURL(/\/deadline/, { timeout: 40000 }), page.click('button[type="submit"]')]);

  // 1) Export satu hari
  await page.goto(`${BASE}/deadline?date=2026-11-10`, { waitUntil: "networkidle" });
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.click('a:has-text("Export Excel")'),
  ]);
  await dl.saveAs(".smoke/ceklis-in.xlsx");
  console.log("1. export terunduh:", dl.suggestedFilename());

  // 2) Centang 3 baris pertama
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(".smoke/ceklis-in.xlsx");
  const ws = wb.worksheets[0];
  console.log("2. header:", [1,2,3,4,5,6,7].map((c) => ws.getRow(3).getCell(c).value).join(" | "));

  const marked: string[] = [];
  for (let row = 4; row <= 6; row += 1) {
    const orderNumber = String(ws.getRow(row).getCell(1).value ?? "").trim();
    if (!orderNumber) continue;
    ws.getRow(row).getCell(7).value = "✓";
    marked.push(orderNumber);
  }
  await wb.xlsx.writeFile(".smoke/ceklis-marked.xlsx");
  console.log("3. dicentang:", marked.join(", "));

  // 3) Cek status awal di DB
  const before = await prisma.order.findMany({
    where: { orderNumber: { in: marked } },
    select: { orderNumber: true, monitoringStatus: true, manualConfirmed: true },
  });
  console.log("4. status sebelum:", before.map((o) => `${o.orderNumber}=${o.monitoringStatus}`).join(", "));

  // 4) Unggah balik lewat UI
  await page.click('button:has-text("Unggah ceklis")');
  await page.waitForSelector('input[type="file"]', { timeout: 15000 });
  await page.setInputFiles('input[type="file"]', ".smoke/ceklis-marked.xlsx");
  await page.click('button:has-text("Terapkan ceklis")');
  await page.waitForSelector("text=Dicentang:", { timeout: 60000 });
  const resultText = await page.locator("div.border-emerald-200").first().innerText();
  console.log("5. hasil unggah:", resultText.replace(/\n+/g, " | "));
  await page.screenshot({ path: ".smoke/ceklis-upload-result.png" });

  // 5) Verifikasi DB berubah
  const after = await prisma.order.findMany({
    where: { orderNumber: { in: marked } },
    select: { orderNumber: true, monitoringStatus: true, monitoringStatusSource: true, manualConfirmed: true },
  });
  console.log("6. status sesudah:", after.map((o) => `${o.orderNumber}=${o.monitoringStatus}/${o.monitoringStatusSource}/manual=${o.manualConfirmed}`).join(", "));

  // 6) Pastikan sinkronisasi otomatis tidak menurunkan status
  const { nextMonitoringStatus } = await import("../src/lib/status");
  const guard = nextMonitoringStatus({ current: "SELESAI", manualConfirmed: true, fromSource: "BELUM_SELESAI" });
  console.log("7. proteksi sync:", JSON.stringify(guard), "(harus tetap SELESAI)");

  await browser.close();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("GAGAL:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
