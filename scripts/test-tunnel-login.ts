import "dotenv/config";
import { chromium } from "playwright";

/**
 * Uji login lewat domain tunnel (bukan localhost) untuk memastikan tombol
 * "Masuk" benar-benar bisa diklik — kasus yang gagal saat aset dev diblokir.
 */
const TUNNEL = process.argv[2] ?? "https://ctrl-offering-forest-abc.trycloudflare.com";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors: string[] = [];
  const blocked: string[] = [];

  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
  });
  page.on("requestfailed", (req) => {
    if (req.url().includes("_next")) blocked.push(req.url().slice(0, 110));
  });

  console.log("Tunnel:", TUNNEL);
  const resp = await page.goto(`${TUNNEL}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  console.log("HTTP:", resp?.status());

  // Tunggu hidrasi: tombol submit baru aktif setelah React siap.
  const hydrated = await page
    .waitForFunction(
      () => {
        const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
        return Boolean(btn && !btn.disabled);
      },
      { timeout: 30_000 },
    )
    .then(() => true)
    .catch(() => false);

  console.log("Tombol Masuk aktif (hidrasi berhasil)?", hydrated);
  console.log("Aset _next gagal dimuat:", blocked.length ? blocked : "(tidak ada)");

  if (!hydrated) {
    await page.screenshot({ path: ".smoke/tunnel-login-failed.png" });
    console.log("[errors]", errors.slice(0, 5));
    await browser.close();
    process.exitCode = 1;
    return;
  }

  await page.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL ?? "frankyinsta");
  await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD ?? "");
  await Promise.all([
    page.waitForURL(/\/orders/, { timeout: 40_000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  console.log("URL setelah klik Masuk:", page.url().replace(TUNNEL, ""));
  const ok = /\/orders/.test(page.url());
  console.log("HASIL:", ok ? "LOGIN BERHASIL lewat tunnel" : "LOGIN GAGAL");

  await page.screenshot({ path: ".smoke/tunnel-login-result.png" });
  await browser.close();
  if (!ok) process.exitCode = 1;
}

main();
