"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Kendali pengecekan email: tombol "Cek sekarang" + hitungan waktu menuju
 * penyegaran tampilan otomatis berikutnya.
 *
 * Tombol ini memanggil /api/email/sync yang membaca IMAP saat itu juga. Membaca
 * email tidak mengubah status belum-dibaca di mailbox.
 */
export function EmailSyncControls({ intervalMs = 60 * 60 * 1000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hasil, setHasil] = useState<string | null>(null);
  const [sisa, setSisa] = useState<number>(intervalMs);
  const acuan = useRef<number>(0);

  // Hitung mundur menuju penyegaran otomatis berikutnya (hanya tampilan).
  useEffect(() => {
    acuan.current = Date.now();
    const timer = setInterval(() => {
      const lewat = Date.now() - acuan.current;
      const s = Math.max(0, intervalMs - lewat);
      setSisa(s);
      if (s === 0) acuan.current = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  }, [intervalMs]);

  const cek = () => {
    setError(null);
    setHasil(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/email/sync", { method: "POST" });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: string;
          unreadFound?: number;
          created?: number;
          markedRead?: number;
        };

        if (!res.ok || !data.ok) {
          setError(data.message ?? "Terjadi kesalahan pada server. Silakan coba lagi.");
          return;
        }

        const bagian = [`${data.unreadFound ?? 0} belum dibaca`];
        if (data.created) bagian.push(`${data.created} baru`);
        if (data.markedRead) bagian.push(`${data.markedRead} sudah dibaca`);
        setHasil(bagian.join(" · "));

        acuan.current = Date.now();
        setSisa(intervalMs);
        router.refresh();
      } catch {
        setError("Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.");
      }
    });
  };

  const menit = Math.floor(sisa / 60000);
  const detik = Math.floor((sisa % 60000) / 1000);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <span className="hidden text-[11.5px] text-muted-foreground sm:inline">
          Pembaruan otomatis dalam {menit}m {String(detik).padStart(2, "0")}d
        </span>
        <Button size="sm" onClick={cek} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {pending ? "Mengecek…" : "Cek sekarang"}
        </Button>
      </div>

      {hasil ? <p className="text-[11.5px] text-emerald-700">{hasil}</p> : null}
      {error ? <p className="text-[11.5px] text-red-600">{error}</p> : null}
    </div>
  );
}
