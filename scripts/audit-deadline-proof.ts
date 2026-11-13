import "dotenv/config";
import fs from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";
import { parseSourceDate } from "../src/lib/scraper/instaprint";

/**
 * Bukti audit: untuk pesanan 12 Nov 2026, ambil 5 pesanan yang TIDAK muncul di
 * /workflow_order, buka halaman detailnya satu per satu, dan bandingkan nilai
 * Deadline mentah dari situs dengan nilai yang tersimpan di database.
 */
async function main() {
  const iso = "2026-11-12";
  const rows = await prisma.order.findMany({
    where: { orderDate: new Date(`${iso}T00:00:00.000Z`) },
    select: { orderNumber: true, sourceOrderId: true, deadlineDate: true, sourceStatus: true },
    orderBy: { orderNumber: "asc" },
  });
  const withDeadline = rows.filter((r) => r.deadlineDate);
  const without = rows.filter((r) => !r.deadlineDate);
  console.log(`DB 12 Nov: total ${rows.length} | punya deadline ${withDeadline.length} | kosong ${without.length}`);

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

  // Ambil 5 "tab" menu Workflow untuk tahu halaman apa saja yang tersedia.
  await page.goto("https://www.instasiaga.com/", { waitUntil: "networkidle" });
  const menu = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"))
      .map((a) => ({ text: (a.textContent ?? "").replace(/\s+/g, " ").trim(), href: (a as HTMLAnchorElement).getAttribute("href") ?? "" }))
      .filter((m) => /workflow|order/i.test(m.href))
      .slice(0, 25),
  );

  const sample = [...withDeadline.slice(0, 3), ...without.slice(0, 2)];
  const results: {
    orderNumber: string;
    sourceOrderId: string;
    dbDeadline: string | null;
    sourceDeadlineRaw: string | null;
    productDeadlines: (string | null)[];
    match: boolean | null;
    sourceStatus: string;
    httpStatus: number | null;
    textLength: number;
  }[] = [];

  for (const row of sample) {
    const resp = await page.goto(`https://www.instasiaga.com/workflow_order/detail/${row.sourceOrderId}`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .waitForFunction(() => (document.body.innerText ?? "").length > 250 && /Pelanggan|Deadline/i.test(document.body.innerText ?? ""), {
        timeout: 15_000,
      })
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
        deleted: /tidak ditemukan|not found|404/i.test(text),
        deadlineRaw: grab("Deadline"),
        paymentStatus: grab("Status Pembayaran") ?? grab("Status"),
        productDeadlines,
        textLength: text.length,
      };
    });

    const dbIso = row.deadlineDate?.toISOString().slice(0, 10) ?? null;
    const candidates = live.productDeadlines.filter((v): v is string => Boolean(v) && parseSourceDate(v!) !== null);
    candidates.sort((a, b) => (parseSourceDate(a) ?? "").localeCompare(parseSourceDate(b) ?? ""));
    const sourceIso =
      (parseSourceDate(live.deadlineRaw ?? "") ?? "").slice(0, 10) || (parseSourceDate(candidates.at(-1) ?? "") ?? "").slice(0, 10);

    results.push({
      orderNumber: row.orderNumber,
      sourceOrderId: row.sourceOrderId,
      dbDeadline: dbIso,
      sourceDeadlineRaw: live.deadlineRaw,
      productDeadlines: live.productDeadlines,
      match: dbIso && sourceIso ? dbIso === sourceIso : dbIso === null && !sourceIso,
      sourceStatus: row.sourceStatus,
      httpStatus: resp?.status() ?? null,
      textLength: live.textLength,
    });
  }

  fs.mkdirSync(".smoke", { recursive: true });
  fs.writeFileSync(".smoke/audit-deadline.json", JSON.stringify({ menu, results }, null, 2));

  console.log("\n=== Menu Workflow di sidebar ===");
  for (const m of menu) console.log(`  ${m.text} -> ${m.href}`);

  console.log("\n=== Bandingkan DB vs situs (5 pesanan 12 Nov) ===");
  for (const r of results) {
    const flag = r.match === true ? "COCOK" : r.match === false ? "BEDA" : "TIDAK ADA DI SUMBER";
    console.log(`\n${r.orderNumber} (id ${r.sourceOrderId}) [${flag}]`);
    console.log(`  HTTP ${r.httpStatus} | panjang teks ${r.textLength}`);
    console.log(`  sumber: Deadline header = ${JSON.stringify(r.sourceDeadlineRaw)}`);
    console.log(`  sumber: deadline produk = ${JSON.stringify(r.productDeadlines)}`);
    console.log(`  DB    : ${r.dbDeadline}`);
  }

  await browser.close();
  await prisma.$disconnect();
}

main();
