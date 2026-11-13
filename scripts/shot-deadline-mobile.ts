import "dotenv/config";
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
async function main() {
  const b = await chromium.launch({ headless: true });
  for (const [name, w, h] of [["desktop", 1440, 950], ["mobile", 390, 844]] as const) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript("globalThis.__name = function (fn) { return fn; };");
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 45000 });
    await p.waitForFunction(() => { const x = document.querySelector('button[type="submit"]') as HTMLButtonElement | null; return Boolean(x && !x.disabled); }, { timeout: 30000 });
    await p.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL ?? "frankyinsta");
    await p.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD ?? "");
    await Promise.all([p.waitForURL(/\/deadline/, { timeout: 40000 }), p.click('button[type="submit"]')]);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `.smoke/final-${name}.png` });
    if (name === "desktop") {
      // cek overflow horizontal
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log("desktop overflow px:", overflow);
    } else {
      await p.goto(`${BASE}/deadline?mode=bulan`, { waitUntil: "networkidle" });
      await p.waitForTimeout(1200);
      await p.screenshot({ path: `.smoke/final-mobile-bulan.png` });
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log("mobile overflow px:", overflow);
    }
    await ctx.close();
  }
  await b.close();
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });
