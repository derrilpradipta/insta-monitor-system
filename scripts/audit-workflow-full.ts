import "dotenv/config";
import fs from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";
import { parseSourceDate } from "../src/lib/scraper/instaprint";

/**
 * Hitung SEMUA pesanan 12-11-2026 di tab Verifikasi Pesanan (/workflow_order)
 * memakai filter start_date/end_date yang benar, lalu cocokkan per nota.
 */
const ISO = process.argv[2] ?? "2026-11-12";

async function main() {
  const [y, m, d] = ISO.split("-");
  const sourceDate = `${d}-${m}-${y}`;

  const dbOrders = await prisma.order.findMany({
    where: { orderDate: new Date(`${ISO}T00:00:00.000Z`) },
    select: { orderNumber: true, sourceStatus: true, deadlineDate: true },
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

  const collected = new Map<string, { status: string; deadline: string; tanggal: string }>();
  let pages = 0;

  // Pagination memakai ?per_page=<offset> (10 baris per halaman).
  for (let offset = 0; offset < 500; offset += 10) {
    pages += 1;
    await page.goto(
      `https://www.instasiaga.com/workflow_order?start_date=${sourceDate}&end_date=${sourceDate}&per_page=${offset}`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForTimeout(1100);
    const rows = await page.evaluate(() => {
      const trs = Array.from(document.querySelectorAll("table tbody tr"));
      return trs
        .map((tr) => {
          const cells = Array.from(tr.querySelectorAll("td")).map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim());
          if (cells.length < 8) return null;
          return { status: cells[4] ?? "", nota: cells[5] ?? "", tanggal: cells[6] ?? "", deadline: cells[7] ?? "" };
        })
        .filter((r): r is NonNullable<typeof r> => Boolean(r && r.nota));
    });
    for (const r of rows) collected.set(r.nota, { status: r.status, deadline: r.deadline, tanggal: r.tanggal });
    if (rows.length < 10) break;
  }

  const wfNota = [...collected.keys()];
  const dbNota = [...dbByNota.keys()];
  const missingInWf = dbNota.filter((n) => !collected.has(n));
  const extraInWf = wfNota.filter((n) => !dbByNota.has(n));

  // Deadline dari tabel workflow_order vs DB
  let deadlineMatch = 0;
  const deadlineMismatch: { nota: string; wf: string; db: string }[] = [];
  for (const [nota, v] of collected) {
    const db = dbByNota.get(nota);
    if (!db) continue;
    const wfIso = (parseSourceDate(v.deadline) ?? "").slice(0, 10);
    const dbIso = db.deadlineDate?.toISOString().slice(0, 10) ?? "";
    if ((wfIso || "") === (dbIso || "")) deadlineMatch += 1;
    else deadlineMismatch.push({ nota, wf: v.deadline, db: dbIso });
  }

  const statusBreakdown: Record<string, number> = {};
  for (const v of collected.values()) statusBreakdown[v.status] = (statusBreakdown[v.status] ?? 0) + 1;

  const summary = {
    iso: ISO,
    pages,
    workflowTotal: collected.size,
    dbTotal: dbByNota.size,
    missingInWf: missingInWf.length,
    extraInWf: extraInWf.length,
    deadlineMatch,
    deadlineMismatch: deadlineMismatch.length,
    statusBreakdown,
    missingByStatus: missingInWf.reduce<Record<string, number>>((acc, n) => {
      const st = dbByNota.get(n)?.sourceStatus ?? "?";
      acc[st] = (acc[st] ?? 0) + 1;
      return acc;
    }, {}),
    missingButHasDeadline: missingInWf.filter((n) => dbByNota.get(n)?.deadlineDate).length,
  };

  fs.mkdirSync(".smoke", { recursive: true });
  fs.writeFileSync(
    ".smoke/audit-workflow-full.json",
    JSON.stringify({ summary, missingInWf, extraInWf, deadlineMismatch }, null, 2),
  );

  console.log(JSON.stringify(summary, null, 1));
  if (deadlineMismatch.length) {
    console.log("\nDeadline beda (workflow vs DB):");
    for (const r of deadlineMismatch.slice(0, 15)) console.log(`  ${r.nota} | wf=${r.wf} | db=${r.db}`);
  }

  await browser.close();
  await prisma.$disconnect();
}

main();
