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
  // Playwright (dengan binary Chromium) harus tetap di luar bundle server.
  serverExternalPackages: ["playwright", "playwright-core"],

  // Saat dev server diakses lewat tunnel (cloudflared/ngrok) untuk demo,
  // Next.js memblokir aset dev dari origin lain sehingga React tidak pernah
  // hidrasi dan tombol form (mis. "Masuk") tetap disabled. Daftarkan domain
  // tunnel di sini. Hanya berlaku di mode dev; produksi tidak terpengaruh.
  allowedDevOrigins: ["*.trycloudflare.com", "**.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.io", "*.loca.lt"],
};

export default nextConfig;
