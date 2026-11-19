"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Tombol "Ambil data" untuk laporan waktu balas.
 *
 * Prosesnya membaca Gmail (kotak masuk + terkirim) untuk semua mailbox, lalu
 * menghitung selisih waktu. Hanya metadata yang dibaca — tidak ada email yang
 * ditandai sudah dibaca.
 */
export function WaktuBalasControls({
  hari,
  bolehUbah,
  hanyaTombol = false,
}: {
  hari: number;
  bolehUbah: boolean;
  hanyaTombol?: boolean;
}) {
  const router = useRouter();
  const [jalan, setJalan] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const mulai = async () => {
    setJalan(true);
    setGalat(null);
    setPesan("Menghubungi Gmail…");

    try {
      const res = await fetch(`/api/email/waktu-balas?hari=${hari}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        results?: { accountEmail: string; threads: number; replied: number; unreplied: number }[];
      };

      if (!res.ok || !data.ok) {
        setGalat(data.message ?? "Terjadi kesalahan pada server. Silakan coba lagi.");
        setPesan(null);
        return;
      }

      const total = (data.results ?? []).reduce((n, r) => n + r.threads, 0);
      const dibalas = (data.results ?? []).reduce((n, r) => n + r.replied, 0);
      setPesan(`${total} percakapan dibaca · ${dibalas} sudah dibalas`);
      router.refresh();
    } catch {
      setGalat("Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.");
      setPesan(null);
    } finally {
      setJalan(false);
    }
  };

  const tombol = (
    <Button size="sm" onClick={mulai} disabled={jalan || !bolehUbah}>
      {jalan ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      {jalan ? "Mengambil…" : "Ambil data"}
    </Button>
  );

  if (hanyaTombol) return tombol;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">{tombol}</div>
      {pesan ? <span className="text-[11px] text-muted-foreground">{pesan}</span> : null}
      {galat ? <span className="max-w-[280px] text-right text-[11px] text-red-600">{galat}</span> : null}
    </div>
  );
}
