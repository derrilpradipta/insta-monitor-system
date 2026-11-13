import "dotenv/config";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

const DATE = process.argv[2] ?? "12-11-2026"; // DD-MM-YYYY untuk situs sumber

type Row = { nota: string; outlet: string; status: string; tanggal: string; deadline: string };

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Jakarta" });
  await ctx.addInitScript("globalThis.__name = function (fn) { return fn; };");
  const page = await ctx.newPage();

  await page.goto(process.env.SOURCE_LOGIN_URL!, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="username"]', process.env.SCRAPER_USERNAME!);
  await page.fill('input[name="password"]', process.env.SCRAPER_PASSWORD!);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  // ---------- 1. /workflow_order : seluruh halaman ----------
  const wf: Row[] = [];
  const wfPages: { offset: number; rows: number; total: number }[] = [];
  let offset = 0;
  for (let i = 0; i < 200; i += 1) {
    await page.goto(`https://www.instasiaga.com/workflow_order?per_page=${offset}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const rows = await page.evaluate(() => {
      const trs = Array.from(document.querySelectorAll("table tbody tr"));
      return trs
        .map((tr) => {
          const cells = Array.from(tr.querySelectorAll("td")).map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim());
          if (cells.length < 8) return null;
          return {
            outlet: cells[2] ?? "",
            status: cells[4] ?? "",
            nota: cells[5] ?? "",
            tanggal: cells[6] ?? "",
            deadline: cells[7] ?? "",
          };
        })
        .filter((r): r is NonNullable<typeof r> => Boolean(r && r.nota));
    });
    wfPages.push({ offset, rows: rows.length, total: wf.length + rows.length });
    wf.push(...rows);
    if (rows.length < 10) break;
    offset += 10;
  }
  console.log("=== /workflow_order (Verifikasi Pesanan) ===");
  console.log("halaman:", wfPages.length, "| total baris:", wf.length);
  console.log("sample:", wf.slice(0, 3));

  // ---------- 2. /order_list untuk tanggal tertentu ----------
  const [d, m, y] = DATE.split("-");
  const iso = `${y}-${m}-${d}`;
  const ol: Row[] = [];
  offset = 0;
  for (let i = 0; i < 200; i += 1) {
    await page.goto(`https://www.instasiaga.com/order_list?date1=${DATE}&date2=${DATE}&per_page=${offset}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1200);
    const rows = await page.evaluate(() => {
      const trs = Array.from(document.querySelectorAll("table tbody tr"));
      return trs
        .map((tr) => {
          const cells = Array.from(tr.querySelectorAll("td")).map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim());
          if (cells.length < 6) return null;
          return {
            outlet: cells[2] ?? "",
            status: cells[4] ?? "",
            nota: cells[5] ?? "",
            tanggal: cells[6] ?? "",
            deadline: "",
          };
        })
        .filter((r): r is NonNullable<typeof r> => Boolean(r && r.nota));
    });
    ol.push(...rows);
    if (rows.length < 10) break;
    offset += 10;
  }
  console.log("\n=== /order_list " + DATE + " ===");
  console.log("total baris:", ol.length);

  // ---------- 3. Database ----------
  const dbOrders = await prisma.order.findMany({
    where: { orderDate: new Date(`${iso}T00:00:00.000Z`) },
    select: { orderNumber: true, sourceOrderId: true, deadlineDate: true, sourceStatus: true },
  });
  console.log("\n=== Database aplikasi ===");
  console.log("total:", dbOrders.length, "| punya deadline:", dbOrders.filter((o) => o.deadlineDate).length);

  // ---------- 4. Bandingkan himpunan ----------
  const olSet = new Set(ol.map((r) => r.nota));
  const dbSet = new Set(dbOrders.map((o) => o.orderNumber));
  const wfSet = new Set(wf.map((r) => r.nota));

  const missingInDb = [...olSet].filter((n) => !dbSet.has(n));
  const extraInDb = [...dbSet].filter((n) => !olSet.has(n));
  const inOlNotInWf = [...olSet].filter((n) => !wfSet.has(n));

  console.log("\n=== Selisih ===");
  console.log("/order_list ada, DB tidak:", missingInDb.length, missingInDb.slice(0, 10));
  console.log("DB ada, /order_list tidak:", extraInDb.length, extraInDb.slice(0, 10));
  console.log("/order_list ada, /workflow_order tidak:", inOlNotInWf.length);
  console.log("daftar:", inOlNotInWf);

  // Status dari order_list untuk yang tidak ada di workflow_order
  const detailMissing = ol.filter((r) => !wfSet.has(r.nota));
  console.log("\nstatus pesanan yang tidak muncul di workflow_order:");
  for (const r of detailMissing) {
    console.log(`  ${r.nota} | ${r.status} | ${r.outlet}`);
  }

  const summary = {
    date: DATE,
    orderListCount: olSet.size,
    dbCount: dbSet.size,
    workflowCount: wfSet.size,
    workflowPages: wfPages.length,
    missingInDb: missingInDb.length,
    extraInDb: extraInDb.length,
    inOlNotInWf: inOlNotInWf.length,
    wfStatusBreakdown: Object.entries(
      wf.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {}),
    ),
  };
  const fs = await import("node:fs");
  fs.writeFileSync(".smoke/audit-coverage.json", JSON.stringify({ summary, missingInDb, extraInDb, inOlNotInWf }, null, 2));
  console.log("\n=== RINGKASAN ===");
  console.log(JSON.stringify(summary, null, 1));

  await browser.close();
  await prisma.$disconnect();
}

main();
