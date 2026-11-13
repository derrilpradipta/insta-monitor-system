/**
 * Uji alur UI yang butuh interaksi: panel AI, checklist bulanan, ganti password salah.
 * Jalankan: npx tsx scripts/test-ai-ui.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), ".smoke");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL ?? "admin@instaprint.local");
  await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD!);
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null), page.click('button[type="submit"]')]);

  // 1) Panel AI
  await page.goto(`${BASE}/analysis`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button:has-text("Ringkas kondisi operasional")', { timeout: 30_000 });
  await page.click('button:has-text("Ringkas kondisi operasional")');
  await page.waitForTimeout(2500);
  const aiState = await page.evaluate(() => {
    const text = document.body.innerText;
    const analyzing = /Menganalisis/.test(text);
    const err = /AI belum dikonfigurasi|Layanan AI menolak|Gagal menghubungi/.test(text);
    const heading = /Asisten Analisis AI/.test(text);
    return { analyzing, err, heading, snippet: text.slice(0, 0) };
  });
  console.log("[AI] state awal:", JSON.stringify(aiState));

  // tunggu hasil (maks 90 detik)
  for (let i = 0; i < 45; i += 1) {
    await page.waitForTimeout(2000);
    const done = await page.evaluate(() => !/Menganalisis/.test(document.body.innerText));
    if (done) break;
  }
  const aiText = await page.evaluate(() => {
    const el = document.querySelector(".whitespace-pre-wrap");
    return el ? (el.textContent ?? "").slice(0, 900) : null;
  });
  const aiError = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("p")).find((p) =>
      /AI belum dikonfigurasi|Layanan AI menolak|Gagal menghubungi/.test(p.textContent ?? ""),
    );
    return el ? el.textContent : null;
  });
  console.log("[AI] jawaban:", aiText ? aiText.replace(/\s+/g, " ").slice(0, 600) : "(kosong)");
  console.log("[AI] error:", aiError);
  await page.screenshot({ path: path.join(OUT, "ai-result.png"), fullPage: true });

  // 2) Checklist bulanan (jika ada review)
  await page.goto(`${BASE}/monthly-review`, { waitUntil: "domcontentloaded" });
  const reviewLink = await page.$('a[href^="/monthly-review/"]');
  if (reviewLink) {
    await reviewLink.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => document.body.innerText.match(/(\d+) \/ (\d+) pesanan ditandai selesai/)?.[0] ?? null);
    const checkboxes = await page.$$('[role="checkbox"]');
    console.log("[checklist] jumlah checkbox:", checkboxes.length, "| sebelum:", before);
    if (checkboxes.length > 0) {
      await checkboxes[0]!.click();
      await page.waitForTimeout(2500);
      const after = await page.evaluate(() => document.body.innerText.match(/(\d+) \/ (\d+) pesanan ditandai selesai/)?.[0] ?? null);
      const firstRow = await page.evaluate(() => {
        const row = document.querySelector("tbody tr");
        return row ? (row.textContent ?? "").replace(/\s+/g, " ").slice(0, 120) : null;
      });
      console.log("[checklist] sesudah:", after, "| baris pertama:", firstRow);
      await page.screenshot({ path: path.join(OUT, "checklist-checked.png"), fullPage: true });

      // batalkan lagi (elemen lama sudah terlepas setelah refresh server)
      const again = await page.$$('[role="checkbox"]');
      if (again.length > 0) {
        await again[0]!.click();
        await page.waitForTimeout(2500);
        const reverted = await page.evaluate(() => document.body.innerText.match(/(\d+) \/ (\d+) pesanan ditandai selesai/)?.[0] ?? null);
        console.log("[checklist] setelah dibatalkan:", reverted);
      }
    }
  } else {
    console.log("[checklist] belum ada pemeriksaan bulanan");
  }

  // 3) Ganti password dengan password lama salah harus ditolak
  await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="currentPassword"]', "password-salah-sekali");
  await page.fill('input[name="newPassword"]', "PasswordBaru123");
  await page.fill('input[name="confirmPassword"]', "PasswordBaru123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  const pwMessage = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("p")).find((p) =>
      /Password lama salah|berhasil diubah/.test(p.textContent ?? ""),
    );
    return el ? el.textContent : null;
  });
  console.log("[password] pesan:", pwMessage);

  console.log("[errors]", errors.length ? errors.join(" | ") : "(tidak ada)");
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
