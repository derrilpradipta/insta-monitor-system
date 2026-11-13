import "dotenv/config";
import fs from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

/**
 * Uji klaim "tab Verifikasi Pesanan hanya menampilkan 89 dari 105":
 * filter /workflow_order ke 12-11-2026 dengan Semua Status, lalu bandingkan
 * nota yang muncul dengan daftar 105 pesanan di database.
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

  // Isi filter tanggal di halaman Verifikasi Pesanan, lalu submit.
  await page.goto("https://www.instasiaga.com/workflow_order", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const filled = await page.evaluate(
    ({ start, end }) => {
      const set = (name: string, value: string) => {
        const el = document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
        if (!el) return false;
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      };
      const a = set("start_date", start);
      const b = set("end_date", end);
      const form = document.querySelector("form");
      form?.submit();
      return { a, b };
    },
    { start: sourceDate, end: sourceDate },
  ).catch(() => null);
  console.log("filter diisi:", JSON.stringify(filled));
  await page.waitForTimeout(2500);

  // Kumpulkan seluruh baris (semua halaman).
  const wfRows: { nota: string; status: string; deadline: string }[] = [];
  for (let offset = 0; offset < 400; offset += 10) {
    await page.goto(`https://www.instasiaga.com/workflow_order?per_page=${offset}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
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
    const inRange = rows.filter((r) => r.tanggal.startsWith(sourceDate));
    wfRows.push(...inRange.map((r) => ({ nota: r.nota, status: r.status, deadline: r.deadline })));
    if (rows.length < 10) break;
  }

  const wfSet = new Set(wfRows.map((r) => r.nota));
  const dbSet = new Set(dbOrders.map((o) => o.orderNumber));
  const notInWf = [...dbSet].filter((n) => !wfSet.has(n));

  const breakdown: Record<string, number> = {};
  for (const nota of notInWf) {
    const st = dbByNota.get(nota)?.sourceStatus ?? "?";
    breakdown[st] = (breakdown[st] ?? 0) + 1;
  }

  // Berapa dari yang TIDAK muncul di workflow_order tapi tetap punya deadline di DB?
  const missingButHasDeadline = notInWf.filter((n) => dbByNota.get(n)?.deadlineDate).length;

  console.log(`\n=== ${ISO} ===`);
  console.log("DB total          :", dbSet.size);
  console.log("workflow_order    :", wfSet.size, "baris (status apa pun, tanggal sama)");
  console.log("tidak muncul di wf:", notInWf.length);
  console.log("  rincian status  :", breakdown);
  console.log("  tapi punya deadline di DB:", missingButHasDeadline);
  console.log("  contoh          :", notInWf.slice(0, 8));

  fs.mkdirSync(".smoke", { recursive: true });
  fs.writeFileSync(
    ".smoke/audit-workflow-gap.json",
    JSON.stringify({ iso: ISO, dbTotal: dbSet.size, wfTotal: wfSet.size, notInWf, breakdown, missingButHasDeadline }, null, 2),
  );

  await browser.close();
  await prisma.$disconnect();
}

main();
