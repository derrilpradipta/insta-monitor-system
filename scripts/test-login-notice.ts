import "dotenv/config";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/**
 * Memastikan pesan "sesi berakhir" hanya muncul saat sesi benar-benar habis,
 * bukan pada kunjungan pertama.
 */
async function main() {
  const browser = await chromium.launch({ headless: true });
  let failed = 0;

  const check = (label: string, actual: string, expected: string) => {
    const ok = actual === expected;
    if (!ok) failed += 1;
    console.log(`${ok ? "✓" : "✗"} ${label}: ${actual}${ok ? "" : ` (harusnya ${expected})`}`);
  };

  // --- 1. Kunjungan pertama, tanpa cookie sama sekali ---
  const fresh = await browser.newContext();
  await fresh.addInitScript("globalThis.__name = function (fn) { return fn; };");
  const page = await fresh.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  check("pertama buka /", new URL(page.url()).pathname + new URL(page.url()).search, "/login");

  const notice = await page
    .locator("text=Sesi Anda telah berakhir")
    .count();
  check("notice 'sesi berakhir' pada kunjungan pertama", String(notice), "0");

  // --- 2. Akses /deadline langsung tanpa login ---
  await page.goto(`${BASE}/deadline`, { waitUntil: "networkidle" });
  check("akses /deadline tanpa login", new URL(page.url()).pathname + new URL(page.url()).search, "/login");

  // --- 3. Logout manual -> harus reason=logout ---
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => {
      const b = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      return Boolean(b && !b.disabled);
    },
    { timeout: 30000 },
  );
  await page.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL ?? "frankyinsta");
  await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD ?? "");
  await Promise.all([page.waitForURL(/\/deadline/, { timeout: 40000 }), page.click('button[type="submit"]')]);
  console.log("  (login berhasil:", new URL(page.url()).pathname + ")");

  const cookies = await fresh.cookies();
  const sessionCookie = cookies.find((c) => c.name === "ipms_session");
  console.log("  cookie sesi ada:", Boolean(sessionCookie));

  // --- 4. Sesi ada tapi tokennya tidak valid -> harus reason=expired ---
  await fresh.clearCookies();
  await fresh.addCookies([
    {
      name: "ipms_session",
      value: "token-palsu-yang-tidak-ada-di-database",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(`${BASE}/deadline`, { waitUntil: "networkidle" });
  const expiredUrl = new URL(page.url());
  check("cookie ada tapi tidak valid", expiredUrl.pathname + expiredUrl.search, "/login?reason=expired");
  const expiredNotice = await page.locator("text=Sesi Anda telah berakhir").count();
  check("notice tampil saat sesi tidak valid", expiredNotice > 0 ? "ada" : "tidak ada", "ada");

  await browser.close();
  console.log(failed === 0 ? "\nSEMUA LULUS" : `\n${failed} GAGAL`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("GAGAL:", e.message);
  process.exit(1);
});
