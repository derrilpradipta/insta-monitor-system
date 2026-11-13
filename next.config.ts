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
};

export default nextConfig;
