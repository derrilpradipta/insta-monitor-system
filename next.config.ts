import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output standalone dipakai oleh Dockerfile produksi.
  output: "standalone",
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
