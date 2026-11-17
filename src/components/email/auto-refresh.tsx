"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Segarkan tampilan halaman ini secara berkala.
 *
 * Ini hanya memperbarui TAMPILAN (membaca ulang database), bukan mengambil email
 * dari mailbox. Pengambilan tetap dikerjakan penjadwal di server, supaya data
 * tetap terisi walau tidak ada tab yang terbuka.
 *
 * Memakai router.refresh() agar data server component diambil ulang tanpa
 * kehilangan posisi gulir.
 */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      // Jangan menyegarkan saat tab tidak terlihat: tidak ada gunanya dan hanya
      // membebani server.
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);

    // Segarkan sekali saat tab kembali dibuka, kalau sudah lewat satu interval.
    let lastRefresh = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefresh < intervalMs) return;
      lastRefresh = Date.now();
      router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, router]);

  return null;
}
