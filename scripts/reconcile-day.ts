import "dotenv/config";
import fs from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";
import { parseSourceDate } from "../src/lib/scraper/instaprint";

/**
 * Rekonsiliasi penuh untuk satu tanggal masuk: buka halaman detail SETIAP
 * pesanan di situs sumber dan bandingkan dengan database aplikasi.
 */
const ISO = process.argv[2] ?? "2026-11-12";

type Compare = {
  orderNumber: string;
  sourceOrderId: string;
  httpStatus: number | null;
  pageHasContent: boolean;
  sourceDeadline: string | null;
  dbDeadline: string | null;
  deadlineMatch: boolean;
  sourceStatus: string | null;
  dbStatus: string;
  statusMatch: boolean;
  sourceOrderDate: string | null;
  dbOrderDate: string;
  customerOk: boolean;
};

async function main() {
  const rows = await prisma.order.findMany({
    where: { orderDate: new Date(`${ISO}T00:00:00.000Z`) },
    select: {
      orderNumber: true,
      sourceOrderId: true,
      deadlineDate: true,
      sourceStatus: true,
      customerName: true,
      orderDate: true,
    },
    orderBy: { orderNumber: "asc" },
  });
  console.log(`[audit] pesanan ${ISO} di DB: ${rows.length}`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: "Asia/Jakarta" });
  await ctx.addInitScript("globalThis.__name = function (fn) { return fn; };");
  const page = await ctx.newPage();
  await page.goto(process.env.SOURCE_LOGIN_URL!, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="username"]', process.env.SCRAPER_USERNAME!);
  await page.fill('input[name="password"]', process.env.SCRAPER_PASSWORD!);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  const out: Compare[] = [];
  let i = 0;
  for (const row of rows) {
    i += 1;
    const resp = await page
      .goto(`https://www.instasiaga.com/workflow_order/detail/${row.sourceOrderId}`, { waitUntil: "domcontentloaded" })
      .catch(() => null);
    await page
      .waitForFunction(
        () => (document.body.innerText ?? "").length > 250 && /Pelanggan|Deadline/i.test(document.body.innerText ?? ""),
        { timeout: 15_000 },
      )
      .catch(() => null);

    const live = await page.evaluate(() => {
      const text = (document.body.innerText ?? "").replace(/\r/g, "");
      const flat = text.replace(/[ \t]+/g, " ");
      const grab = (label: string) => {
        const m = flat.match(new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i"));
        return m ? m[1]!.trim() : null;
      };
      const productDeadlines: (string | null)[] = [];
      for (const tr of Array.from(document.querySelectorAll("table tbody tr"))) {
        const cells = Array.from(tr.querySelectorAll("td")).map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim());
        if (cells.length < 2) continue;
        const dm = cells.join(" | ").match(/Deadline\s*:\s*(\d{2}-\d{2}-\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i);
        productDeadlines.push(dm ? dm[1]! : null);
      }
      return {
        deadlineRaw: grab("Deadline"),
        orderDateRaw: grab("Tanggal Order"),
        status: grab("Status Pembayaran") ?? grab("Status"),
        customer: grab("Nama Pelanggan"),
        productDeadlines,
        textLength: text.length,
      };
    });

    const validProducts = live.productDeadlines.filter((v): v is string => Boolean(v) && parseSourceDate(v!) !== null);
    validProducts.sort((a, b) => (parseSourceDate(a) ?? "").localeCompare(parseSourceDate(b) ?? ""));
    const sourceDeadline =
      (parseSourceDate(live.deadlineRaw ?? "") ?? "").slice(0, 10) || (parseSourceDate(validProducts.at(-1) ?? "") ?? "").slice(0, 10);
    const dbDeadline = row.deadlineDate?.toISOString().slice(0, 10) ?? "";

    const sourceOrderDate = (parseSourceDate(live.orderDateRaw ?? "") ?? "").slice(0, 10);
    const dbOrderDate = row.orderDate.toISOString().slice(0, 10);

    // Bandingkan nama pelanggan secara longgar (nama bisa terpotong/berformat).
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18);
    const customerOk = Boolean(live.customer) && norm(live.customer!).includes(norm(row.customerName).slice(0, 10));

    out.push({
      orderNumber: row.orderNumber,
      sourceOrderId: row.sourceOrderId,
      httpStatus: resp?.status() ?? null,
      pageHasContent: live.textLength > 250,
      sourceDeadline: sourceDeadline || null,
      dbDeadline: dbDeadline || null,
      deadlineMatch: (sourceDeadline || "") === (dbDeadline || ""),
      sourceStatus: live.status,
      dbStatus: row.sourceStatus,
      statusMatch: (live.status ?? "").trim().toUpperCase() === row.sourceStatus.trim().toUpperCase(),
      sourceOrderDate: sourceOrderDate || null,
      dbOrderDate,
      customerOk,
    });

    if (i % 10 === 0) console.log(`  ${i}/${rows.length} diperiksa`);
  }

  const summary = {
    iso: ISO,
    total: out.length,
    httpOk: out.filter((r) => r.httpStatus === 200).length,
    pageHasContent: out.filter((r) => r.pageHasContent).length,
    deadlineMatch: out.filter((r) => r.deadlineMatch).length,
    deadlineMismatch: out.filter((r) => !r.deadlineMatch).length,
    statusMatch: out.filter((r) => r.statusMatch).length,
    statusMismatch: out.filter((r) => !r.statusMatch).length,
    orderDateMatch: out.filter((r) => r.sourceOrderDate === r.dbOrderDate).length,
    customerMatch: out.filter((r) => r.customerOk).length,
    bothDeadlineNull: out.filter((r) => !r.sourceDeadline && !r.dbDeadline).length,
  };

  fs.mkdirSync(".smoke", { recursive: true });
  fs.writeFileSync(".smoke/reconcile-12nov.json", JSON.stringify({ summary, rows: out }, null, 2));
  console.log("\n=== RINGKASAN ===");
  console.log(JSON.stringify(summary, null, 1));
  console.log("\nSelisih deadline:");
  for (const r of out.filter((x) => !x.deadlineMatch)) {
    console.log(`  ${r.orderNumber} | sumber=${r.sourceDeadline} | DB=${r.dbDeadline}`);
  }
  console.log("\nSelisih status:");
  for (const r of out.filter((x) => !x.statusMatch).slice(0, 20)) {
    console.log(`  ${r.orderNumber} | sumber="${r.sourceStatus}" | DB="${r.dbStatus}"`);
  }

  await browser.close();
  await prisma.$disconnect();
}

main();
