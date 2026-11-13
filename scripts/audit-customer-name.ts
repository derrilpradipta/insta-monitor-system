import "dotenv/config";
import fs from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

/**
 * Bandingkan nama pelanggan untuk SEMUA pesanan satu tanggal memakai halaman
 * daftar (/order_list), plus periksa apa yang sebenarnya ditampilkan
 * /workflow_order (tab Verifikasi Pesanan).
 */
const ISO = process.argv[2] ?? "2026-11-12";

/** "Transfer Order (Cabang) [KODE] (Nama)" -> "Nama" */
function unwrapCustomer(raw: string): string {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  const m = text.match(/^Transfer Order\s*\([^)]*\)\s*\[[^\]]*\]\s*\((.*)\)\s*$/i);
  const inner = (m ? m[1]! : text).trim();
  const phone = inner.match(/\s-\s(\d[\d\s-]{6,})$/);
  return (phone ? inner.slice(0, phone.index) : inner).trim();
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  const [y, m, d] = ISO.split("-");
  const sourceDate = `${d}-${m}-${y}`;

  const dbOrders = await prisma.order.findMany({
    where: { orderDate: new Date(`${ISO}T00:00:00.000Z`) },
    select: { orderNumber: true, customerName: true, sourceOrderId: true },
  });
  const dbByNota = new Map(dbOrders.map((o) => [o.orderNumber, o]));

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Jakarta" });
  await ctx.addInitScript("globalThis.__name = function (fn) { return fn; };");
  const page = await ctx.newPage();
  await page.goto(process.env.SOURCE_LOGIN_URL!, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="username"]', process.env.SCRAPER_USERNAME!);
  await page.fill('input[name="password"]', process.env.SCRAPER_PASSWORD!);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  // --- 1. Nama pelanggan dari /order_list, seluruh halaman ---
  const listRows: { nota: string; customer: string; status: string }[] = [];
  for (let offset = 0; offset < 300; offset += 10) {
    await page.goto(`https://www.instasiaga.com/order_list?date1=${sourceDate}&date2=${sourceDate}&per_page=${offset}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1000);
    const rows = await page.evaluate(() => {
      const trs = Array.from(document.querySelectorAll("table tbody tr"));
      return trs
        .map((tr) => {
          const cells = Array.from(tr.querySelectorAll("td")).map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim());
          if (cells.length < 10) return null;
          return { nota: cells[5] ?? "", customer: cells[9] ?? "", status: cells[4] ?? "" };
        })
        .filter((r): r is NonNullable<typeof r> => Boolean(r && r.nota));
    });
    listRows.push(...rows);
    if (rows.length < 10) break;
  }

  let customerMatch = 0;
  const customerMismatch: { nota: string; source: string; db: string }[] = [];
  for (const row of listRows) {
    const db = dbByNota.get(row.nota);
    if (!db) continue;
    const sourceName = norm(unwrapCustomer(row.customer));
    const dbName = norm(db.customerName);
    if (sourceName === dbName || sourceName.includes(dbName) || dbName.includes(sourceName)) customerMatch += 1;
    else customerMismatch.push({ nota: row.nota, source: row.customer, db: db.customerName });
  }

  // --- 2. Apa yang ditampilkan /workflow_order ---
  await page.goto("https://www.instasiaga.com/workflow_order", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const wfInfo = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input, select")).map((el) => ({
      tag: el.tagName.toLowerCase(),
      name: (el as HTMLInputElement).name ?? "",
      type: (el as HTMLInputElement).type ?? "",
      value: (el as HTMLInputElement).value ?? "",
    }));
    const rows = Array.from(document.querySelectorAll("table tbody tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim()),
    );
    const tabs = Array.from(document.querySelectorAll(".nav-tabs a, [role=tab], .nav a")).map((a) => (a.textContent ?? "").trim()).filter(Boolean);
    return { rowCount: rows.length, firstRows: rows.slice(0, 3), inputs, tabs: tabs.slice(0, 20) };
  });

  console.log(`\n=== Nama pelanggan: ${ISO} ===`);
  console.log(`baris /order_list: ${listRows.length} | nama cocok: ${customerMatch} | tidak cocok: ${customerMismatch.length}`);
  for (const r of customerMismatch.slice(0, 10)) console.log(`  ${r.nota} | sumber="${r.source}" | DB="${r.db}"`);

  console.log("\n=== /workflow_order (apa adanya) ===");
  console.log("jumlah baris di halaman pertama:", wfInfo.rowCount);
  console.log("contoh baris:", wfInfo.firstRows);
  console.log("input/filter:", wfInfo.inputs);
  console.log("tab:", wfInfo.tabs);

  fs.mkdirSync(".smoke", { recursive: true });
  fs.writeFileSync(
    ".smoke/audit-customer.json",
    JSON.stringify({ iso: ISO, listRows: listRows.length, customerMatch, customerMismatch, wfInfo }, null, 2),
  );

  await browser.close();
  await prisma.$disconnect();
}

main();
