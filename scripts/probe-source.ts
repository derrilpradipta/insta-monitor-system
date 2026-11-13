/**
 * Probe struktur website internal Instaprint.
 * Hanya untuk pengembangan: login otomatis lalu dump struktur halaman order_list.
 * Jalankan: npx tsx scripts/probe-source.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const OUT_DIR = path.join(process.cwd(), ".probe");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Env ${name} belum diset`);
  return value;
}

async function dump(page: Page, name: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.html`);
  fs.writeFileSync(file, await page.content());
  console.log(`[dump] ${name} -> ${file}`);
}

async function main() {
  const loginUrl = requireEnv("SOURCE_LOGIN_URL");
  const ordersUrl = requireEnv("SOURCE_ORDERS_URL");
  const username = requireEnv("SCRAPER_USERNAME");
  const password = requireEnv("SCRAPER_PASSWORD");
  const headless = process.env.SCRAPER_HEADLESS !== "false";

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log(`[probe] membuka ${loginUrl} sebagai ${username}`);
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await dump(page, "login");

  console.log("[probe] login form:", await page.evaluate(() =>
    Array.from(document.querySelectorAll("form")).map((f) => ({
      action: (f as HTMLFormElement).getAttribute("action"),
      method: (f as HTMLFormElement).getAttribute("method"),
      fields: Array.from(f.querySelectorAll("input,select,button")).map((el) => ({
        tag: el.tagName.toLowerCase(),
        name: (el as HTMLInputElement).name || undefined,
        type: (el as HTMLInputElement).type || undefined,
        text: el.textContent?.trim().slice(0, 30) || undefined,
      })),
    })),
  ));

  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null),
    page.click('button[type="submit"], input[type="submit"]'),
  ]);
  await page.waitForTimeout(1500);

  console.log("[probe] setelah login url:", page.url(), "title:", await page.title());
  await dump(page, "after-login");

  const errorText = await page
    .locator(".login-error-message, .alert, .error, .text-danger")
    .allInnerTexts()
    .catch(() => []);
  if (errorText.filter(Boolean).length) console.log("[probe] pesan:", errorText.filter(Boolean));

  const cookies = await context.cookies();
  console.log("[probe] cookies:", cookies.map((c) => `${c.name}@${c.domain}`).join(", ") || "(kosong)");

  if (/\/login/.test(page.url())) {
    console.log("[probe] LOGIN GAGAL — masih di halaman login");
    const body = (await page.locator("body").innerText()).slice(0, 800);
    console.log("[probe] isi halaman:\n", body);
    await browser.close();
    process.exit(2);
  }

  console.log(`[probe] membuka ${ordersUrl}`);
  const response = await page.goto(ordersUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  console.log("[probe] status:", response?.status(), "url:", page.url());
  await page.waitForTimeout(1000);
  await dump(page, "order_list");

  const summary = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll("table")).map((table, ti) => ({
      index: ti,
      id: table.id || undefined,
      className: table.className || undefined,
      headers: Array.from(table.querySelectorAll("thead tr")).map((tr) =>
        Array.from(tr.querySelectorAll("th,td")).map((c) => (c.textContent ?? "").trim()),
      ),
      rowCount: table.querySelectorAll("tbody tr").length,
      firstRows: Array.from(table.querySelectorAll("tbody tr")).slice(0, 3).map((tr) =>
        Array.from(tr.querySelectorAll("td")).map((td) => ({
          text: (td.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 120),
          html: td.innerHTML.trim().slice(0, 200),
        })),
      ),
    }));

    const selects = Array.from(document.querySelectorAll("select")).map((s) => ({
      name: s.name || undefined,
      id: s.id || undefined,
      options: Array.from(s.options).map((o) => ({ value: o.value, label: o.text.trim() })),
    }));

    const inputs = Array.from(document.querySelectorAll("input")).map((i) => ({
      name: i.name || undefined,
      id: i.id || undefined,
      type: i.type,
      value: i.value?.slice(0, 40),
      placeholder: i.placeholder || undefined,
    }));

    const links = Array.from(document.querySelectorAll("a")).map((a) => ({
      text: (a.textContent ?? "").trim().slice(0, 40),
      href: a.getAttribute("href") ?? "",
      class: a.className.slice(0, 60),
    })).filter((l) => l.href && (/(page|pagin|sort|order|date|tgl|tanggal|cabang|branch)/i.test(l.href) || /page|pagin/i.test(l.class)));

    const forms = Array.from(document.querySelectorAll("form")).map((f) => ({
      action: f.getAttribute("action"),
      method: f.getAttribute("method"),
      fields: Array.from(f.querySelectorAll("input,select,button")).map((el) => ({
        tag: el.tagName.toLowerCase(),
        name: (el as HTMLInputElement).name || undefined,
        type: (el as HTMLInputElement).type || undefined,
        value: (el as HTMLInputElement).value?.slice(0, 40) || undefined,
      })),
    }));

    return {
      title: document.title,
      tables,
      selects,
      inputs,
      links: links.slice(0, 40),
      forms,
      bodyText: (document.body.innerText ?? "").replace(/\s+/g, " ").slice(0, 1200),
    };
  });

  console.log("[probe] RINGKASAN:", JSON.stringify(summary, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error("[probe] ERROR", error);
  process.exit(1);
});
