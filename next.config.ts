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
};

export default nextConfig;
