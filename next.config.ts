import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output standalone dipakai oleh Dockerfile produksi.
  // Vercel TIDAK memakai standalone (ia memotong rute sendiri lewat adapter-nya),
  // dan membiarkannya aktif membuat Vercel gagal di tahap "Deploying outputs"
  // pada Next.js 16.3+ (next-server.js.nft.json tidak lagi ditulis di tempat
  // yang diharapkan adapter). Jadi hanya aktif di luar Vercel.
  output: process.env.VERCEL ? undefined : "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Playwright dan Chromium serverless harus tetap di luar bundle JavaScript
  // (keduanya membawa biner besar yang harus dibaca langsung dari node_modules).
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "@sparticuz/chromium",
    "@sparticuz/chromium-min",
  ],

  // Pastikan biner Chromium serverless dan berkas data Playwright IKUT dikemas
  // ke fungsi yang melakukan scraping.
  //
  // playwright-core membaca browsers.json saat modul dimuat untuk memetakan
  // versi browser. Karena paketnya ditandai eksternal (serverExternalPackages),
  // berkas itu tidak ikut ter-trace otomatis dan fungsi gagal dengan
  // "Cannot find module '/var/task/node_modules/playwright-core/browsers.json'".
  // Jadi seluruh paket Playwright disertakan eksplisit di sini.
  ...(process.env.VERCEL
    ? {
        outputFileTracingIncludes: {
          "/api/scraper/**": [
            "./node_modules/@sparticuz/chromium/**",
            "./node_modules/playwright/**",
            "./node_modules/playwright-core/**",
          ],
          "/api/cron/**": [
            "./node_modules/@sparticuz/chromium/**",
            "./node_modules/playwright/**",
            "./node_modules/playwright-core/**",
          ],
          "/api/monthly/**": [
            "./node_modules/@sparticuz/chromium/**",
            "./node_modules/playwright/**",
            "./node_modules/playwright-core/**",
          ],
        },
      }
    : {}),

  // Saat dev server diakses lewat tunnel (cloudflared/ngrok) untuk demo,
  // Next.js memblokir aset dev dari origin lain sehingga React tidak pernah
  // hidrasi dan tombol form (mis. "Masuk") tetap disabled. Daftarkan domain
  // tunnel di sini. Hanya berlaku di mode dev; produksi tidak terpengaruh.
  allowedDevOrigins: ["*.trycloudflare.com", "**.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.io", "*.loca.lt"],

  // Header keamanan (OWASP A05 Security Misconfiguration).
  // Tidak memakai nonce karena halaman di sini sepenuhnya server-rendered dan
  // tidak menyisipkan HTML mentah; 'unsafe-inline' pada style diperlukan oleh
  // atribut style inline yang dipakai komponen tabel/progress.
  poweredByHeader: false,

  // Navigasi antar halaman jadi instan untuk halaman yang baru saja dibuka.
  //
  // Tanpa ini, Next.js menyetel masa simpan cache klien untuk halaman dinamis
  // ke 0 detik: setiap klik tautan memaksa perjalanan ke server + database.
  // Dengan 30 detik, kembali ke tab yang tadi dibuka langsung tampil dari
  // cache browser, sementara data tetap diperbarui saat halaman dimuat ulang
  // atau setelah jendela 30 detik lewat.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },

  async headers() {
    const dev = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'",
      // Next.js menyisipkan skrip hidrasi inline; tanpa 'unsafe-inline' halaman
      // tidak akan jalan. Tidak ada HTML mentah dari pengguna di aplikasi ini
      // (tidak ada dangerouslySetInnerHTML), jadi risikonya terkendali.
      //
      // 'unsafe-eval' HANYA di mode dev: React memakainya untuk rekonstruksi
      // callstack saat pengembangan. Di produksi React tidak memakai eval,
      // jadi produksi tetap ketat.
      dev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // Server Actions memakai POST ke origin sendiri; koneksi AI/Composio
      // dibuat dari server, bukan browser, sehingga tidak perlu didaftarkan.
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      ...(dev ? [] : ["upgrade-insecure-requests"]),
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
