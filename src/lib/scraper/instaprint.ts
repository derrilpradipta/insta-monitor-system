/**
 * Klien website internal Instaprint (www.instasiaga.com).
 *
 * Struktur yang dipakai di sini DIDAPAT DARI INSPEKSI LANGSUNG ke situs sumber:
 * - Login: form POST ke /login/process (field username, password).
 * - Daftar pesanan: /order_list?date1=DD-MM-YYYY&date2=DD-MM-YYYY&per_page=<OFFSET>
 *   Tabel #dataTable, 10 baris per halaman; `per_page` adalah OFFSET (0, 10, 20, ...),
 *   bukan jumlah baris. Kolom: #, Aksi, Outlet, Jenis, Status, Nota,
 *   Tanggal Order, Tanggal Bayar, Produk, Pelanggan.
 *   Setiap baris punya elemen ber-atribut data-id = ID transaksi sumber.
 * - Detail pesanan: /workflow_order/detail/<id> memuat Nota, Outlet, Jenis,
 *   Status Pembayaran, Tanggal Order, Deadline, Nama Pelanggan, PIC, dan
 *   Deadline per produk. Halaman ini terbuka untuk pesanan pada tahap mana pun.
 */
import type { Browser, BrowserContext, Page } from "playwright";
import { cleanCustomerName } from "@/lib/text";

type PlaywrightModule = typeof import("playwright");
let playwrightModule: PlaywrightModule | null = null;

/**
 * Playwright dimuat secara lazy, BUKAN di level atas modul.
 *
 * Alasannya: modul ini ikut dirangkai ke dalam rantai
 * instrumentation -> scheduler -> sync -> scraper. Kalau `playwright` diimpor
 * di level atas, Next.js memuatnya pada SETIAP request (termasuk /login), dan
 * di Vercel itu gagal karena `playwright-core/browsers.json` tidak ikut ke
 * bundel fungsi serverless. Akibatnya seluruh aplikasi 500.
 *
 * Dengan lazy import, halaman biasa tidak pernah menyentuh Playwright; hanya
 * proses pengambilan data yang memuatnya.
 */
async function loadPlaywright(): Promise<PlaywrightModule> {
  if (!playwrightModule) {
    playwrightModule = await import("playwright");
  }
  return playwrightModule;
}

type ServerlessChromium = {
  executablePath: string;
  args: string[];
};

/**
 * Chromium untuk lingkungan serverless (Vercel/AWS Lambda).
 *
 * Playwright tidak menyertakan biner browser di bundel fungsi serverless, dan
 * Playwright miliknya sendiri (451 MB) jauh melebihi batas 250 MB. Paket
 * `@sparticuz/chromium` menyediakan Chromium ~67 MB yang diekstrak ke /tmp saat
 * pertama dipakai — itu yang kita pakai bila berjalan di serverless.
 *
 * Di lokal/Docker, fungsi ini mengembalikan null sehingga Playwright memakai
 * biner bawaannya seperti biasa.
 */
async function loadServerlessChromium(): Promise<ServerlessChromium | null> {
  const serverless = Boolean(process.env.VERCEL) || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
  if (!serverless) return null;

  try {
    const mod = await import("@sparticuz/chromium");
    const chromium = (mod.default ?? mod) as unknown as {
      args: string[];
      executablePath: () => Promise<string>;
    };
    const executablePath = await chromium.executablePath();
    return { executablePath, args: chromium.args };
  } catch (error) {
    console.error("[scraper] gagal memuat @sparticuz/chromium:", error);
    throw new Error(
      "Chromium serverless tidak tersedia. Pengambilan data otomatis sebaiknya dijalankan di VPS/Docker.",
    );
  }
}

export type ScrapedOrderRow = {
  sourceId: string;
  outlet: string;
  channel: string;
  sourceStatus: string;
  orderNumber: string;
  orderDateRaw: string;
  paymentDateRaw: string;
  products: string[];
  customerRaw: string;
};

export type ScrapedOrderDetail = {
  orderNumber: string;
  outlet: string;
  channel: string | null;
  paymentStatus: string;
  orderDateRaw: string;
  deadlineRaw: string | null;
  customerName: string;
  customerPhone: string | null;
  workStatus: string | null;
  pic: string | null;
  products: { name: string; deadlineRaw: string | null }[];
};

export type ScrapeOptions = {
  baseUrl?: string;
  loginUrl?: string;
  username?: string;
  password?: string;
  headless?: boolean;
};

const PAGE_SIZE = 10;
const MAX_PAGES = 500; // pengaman: 500 halaman x 10 baris = 5000 pesanan per rentang

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Konfigurasi ${name} belum diisi`);
  return value;
}

/** YYYY-MM-DD -> DD-MM-YYYY (format tanggal situs sumber). */
export function toSourceDate(dateString: string): string {
  const [y, m, d] = dateString.split("-");
  return `${d}-${m}-${y}`;
}

/** Parse tanggal situs sumber (DD-MM-YYYY[ HH:MM[:SS]], zona WIB) -> ISO string. */
export function parseSourceDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, d, mo, y, hh = "00", mi = "00", ss = "00"] = m;
  if (y === "1970") return null; // 01-01-1970 = nilai kosong dari sistem sumber
  return `${y}-${mo}-${d}T${hh}:${mi}:${ss}+07:00`;
}

/** Ambil tanggal (YYYY-MM-DD) dari string Deadline sumber. */
export function parseSourceDeadlineDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = parseSourceDate(raw);
  return parsed ? parsed.slice(0, 10) : null;
}

const TRANSFER_RE = /^Transfer Order\s*\(([^)]+)\)\s*\[([^\]]+)\]\s*\((.*)\)\s*$/i;
const PHONE_SUFFIX_RE = /\s-\s(\d[\d\s-]{6,})$/;

/** Pisahkan nama pelanggan dan nomor telepon dari kolom "Pelanggan". */
export function parseCustomer(raw: string): {
  name: string;
  phone: string | null;
  transferFromBranch: string | null;
  transferFromOrderNumber: string | null;
} {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  const transfer = text.match(TRANSFER_RE);
  const inner = transfer ? transfer[3]!.trim() : text;
  const phoneMatch = inner.match(PHONE_SUFFIX_RE);
  const name = cleanCustomerName((phoneMatch ? inner.slice(0, phoneMatch.index) : inner).trim() || inner);
  return {
    name,
    phone: phoneMatch ? phoneMatch[1]!.replace(/[^0-9]/g, "") : null,
    transferFromBranch: transfer ? transfer[1]!.trim() : null,
    transferFromOrderNumber: transfer ? transfer[2]!.trim() : null,
  };
}

export class InstaprintClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly baseUrl: string;
  private readonly loginUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly headless: boolean;
  private loggedIn = false;

  constructor(options: ScrapeOptions = {}) {
    this.baseUrl = (options.baseUrl ?? env("SOURCE_WEBSITE_URL")).replace(/\/$/, "");
    this.loginUrl = options.loginUrl ?? env("SOURCE_LOGIN_URL");
    this.username = options.username ?? env("SCRAPER_USERNAME");
    this.password = options.password ?? env("SCRAPER_PASSWORD");
    this.headless = options.headless ?? process.env.SCRAPER_HEADLESS !== "false";
  }

  async open(): Promise<void> {
    if (this.page) return;
    const { chromium } = await loadPlaywright();
    const serverless = await loadServerlessChromium();
    this.browser = await chromium.launch({
      headless: this.headless,
      ...(serverless ?? {}),
      args: serverless ? serverless.args : ["--disable-dev-shm-usage", "--no-sandbox"],
    });
    this.context = await this.browser.newContext({
      locale: "id-ID",
      timezoneId: "Asia/Jakarta",
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    });
    // Build tool (esbuild/tsx) menyisipkan helper __name ke fungsi yang dievaluasi
    // di browser. Definisikan agar evaluasi tidak error saat dijalankan via tsx.
    await this.context.addInitScript("globalThis.__name = function (fn) { return fn; };");
    // Blokir aset berat agar scraping cepat dan hemat bandwidth.
    await this.context.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "font" || type === "media") return route.abort();
      return route.continue();
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(45_000);
  }

  private get currentPage(): Page {
    if (!this.page) throw new Error("Browser belum dibuka. Panggil open() lebih dulu.");
    return this.page;
  }

  async login(): Promise<void> {
    await this.open();
    const page = this.currentPage;
    await page.goto(this.loginUrl, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="username"]', this.username);
    await page.fill('input[name="password"]', this.password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
      page.click('button[type="submit"], input[type="submit"]'),
    ]);

    if (/\/login\/?$/.test(new URL(page.url()).pathname)) {
      const message = await page
        .locator(".login-error-message, .alert, .text-danger")
        .first()
        .innerText()
        .catch(() => "");
      throw new Error(
        `Login ke website sumber gagal${message.trim() ? ` (${message.trim()})` : ""}. Periksa kredensial scraper.`,
      );
    }
    this.loggedIn = true;
  }

  /**
   * Ambil pesanan berdasarkan rentang tanggal masuk (kolom Tanggal Order),
   * menelusuri seluruh halaman sampai halaman terakhir.
   */
  async fetchOrdersForDateRange(
    startDate: string,
    endDate: string,
    onPage?: (info: { offset: number; rows: number; total: number }) => void,
  ): Promise<ScrapedOrderRow[]> {
    await this.open();
    const page = this.currentPage;
    const results: ScrapedOrderRow[] = [];
    const seen = new Set<string>();
    let offset = 0;

    for (let i = 0; i < MAX_PAGES; i += 1) {
      const url = `${this.baseUrl}/order_list?date1=${toSourceDate(startDate)}&date2=${toSourceDate(endDate)}&per_page=${offset}`;
      await page.goto(url, { waitUntil: "domcontentloaded" });

      const rows = await page.evaluate(() => {
        const trs = Array.from(document.querySelectorAll("table tbody tr"));
        const parsed = trs.map((tr) => {
          const cells = Array.from(tr.querySelectorAll("td"));
          if (cells.length < 6) return null;
          const idEl = tr.querySelector("[data-id]");
          const cellText = (index: number) =>
            (cells[index]?.textContent ?? "").replace(/\s+/g, " ").trim();
          const products = Array.from(tr.querySelectorAll(".product-list"))
            .map((el) => (el.textContent ?? "").trim())
            .filter(Boolean);
          return {
            sourceId: idEl?.getAttribute("data-id") ?? "",
            outlet: cellText(2),
            channel: cellText(3),
            sourceStatus: cellText(4),
            orderNumber: cellText(5),
            orderDateRaw: cellText(6),
            paymentDateRaw: cellText(7),
            products: products.length ? products : cellText(8) ? [cellText(8)] : [],
            customerRaw: cellText(9),
          };
        });
        return parsed.filter((row): row is NonNullable<typeof row> => Boolean(row && row.orderNumber));
      });

      for (const row of rows) {
        const key = row.sourceId || `${row.orderNumber}|${row.outlet}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(row as ScrapedOrderRow);
      }
      onPage?.({ offset, rows: rows.length, total: results.length });

      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return results;
  }

  /** Buka halaman detail pesanan dan ambil data lengkap termasuk deadline. */
  async fetchOrderDetail(sourceId: string): Promise<ScrapedOrderDetail> {
    await this.open();
    // Halaman detail hanya bisa dibaca setelah login; kalau belum, login dulu.
    if (!this.loggedIn) await this.login();
    const page = this.currentPage;
    await page.goto(`${this.baseUrl}/workflow_order/detail/${sourceId}`, {
      waitUntil: "domcontentloaded",
    });

    // Konten detail dirender setelah HTML awal; tunggu sampai benar-benar ada
    // isinya, kalau tidak deadline/produk akan terbaca kosong.
    await page
      .waitForFunction(
        () => {
          const text = document.body.innerText ?? "";
          return text.length > 250 && /Deadline|Status|Pelanggan/i.test(text) && /Kembali|Work Order/i.test(text);
        },
        { timeout: 20_000 },
      )
      .catch(() => null);

    return page.evaluate(() => {
      const text = (document.body.innerText ?? "").replace(/\r/g, "");
      const flat = text.replace(/[ \t]+/g, " ");
      const grab = (label: string): string | null => {
        const re = new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i");
        const m = flat.match(re);
        return m ? m[1]!.trim() : null;
      };
      const header = flat.match(/^\s*([A-Z0-9]{6,})\s*-\s*([^\n]+)$/m);

      const productDeadlines: { name: string; deadlineRaw: string | null }[] = [];
      for (const tr of Array.from(document.querySelectorAll("table tbody tr"))) {
        const cells = Array.from(tr.querySelectorAll("td")).map((c) =>
          (c.textContent ?? "").replace(/\s+/g, " ").trim(),
        );
        if (cells.length < 2) continue;
        // Kolom kedua tabel detail = Produk (berisi nama + "Deadline: ..." + "Catatan Deskprint : ...").
        const productCell = cells[1] ?? "";
        const joined = cells.join(" | ");
        const dm = joined.match(/Deadline\s*:\s*(\d{2}-\d{2}-\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i);
        if (!productCell) continue;
        productDeadlines.push({ name: productCell.slice(0, 300), deadlineRaw: dm ? dm[1]! : null });
      }

      return {
        orderNumber: header ? header[1]!.trim() : "",
        outlet: header ? header[2]!.trim() : "",
        channel: null,
        paymentStatus: grab("Status Pembayaran") ?? grab("Status") ?? "",
        orderDateRaw: grab("Tanggal Order") ?? "",
        deadlineRaw: grab("Deadline"),
        customerName: grab("Nama Pelanggan") ?? "",
        customerPhone: null,
        workStatus: grab("Pekerjaan"),
        pic: grab("Nama PIC"),
        products: productDeadlines,
      };
    }) as Promise<ScrapedOrderDetail>;
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => null);
    await this.browser?.close().catch(() => null);
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}
