"use client";

import { useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Tombol "Kirim ke email" untuk menguji laporan sebelum penjadwal pagi
 * menjalankannya sendiri.
 *
 * Yang dikirim adalah tanggal yang SEDANG dibuka, bukan selalu hari ini —
 * supaya bisa memeriksa hasil untuk tanggal lain tanpa menunggu besok.
 */
export function KirimLaporanButton({ tanggal }: { tanggal: string }) {
  const [jalan, setJalan] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const kirim = async () => {
    setJalan(true);
    setPesan(null);
    setGalat(null);

    try {
      const res = await fetch(`/api/email/deadline-report?tanggal=${encodeURIComponent(tanggal)}`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        orderCount?: number;
        skipped?: boolean;
        reason?: string;
        to?: string[];
      };

      if (!res.ok || !data.ok) {
        setGalat(data.message ?? "Laporan gagal dikirim. Silakan coba lagi.");
        return;
      }

      if (data.skipped) {
        setPesan(data.reason ?? "Tidak ada pesanan pada tanggal ini.");
      } else {
        setPesan(`${data.orderCount} pesanan terkirim ke ${(data.to ?? []).join(", ")}`);
      }
    } catch {
      setGalat("Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.");
    } finally {
      setJalan(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={kirim} disabled={jalan}>
        {jalan ? (
          <Loader2 className="size-4 animate-spin" />
        ) : pesan ? (
          <Check className="size-4 text-emerald-600" />
        ) : (
          <Send className="size-4" />
        )}
        {jalan ? "Mengirim…" : "Kirim ke email"}
      </Button>
      {pesan ? <span className="max-w-[240px] text-right text-[11px] text-muted-foreground">{pesan}</span> : null}
      {galat ? <span className="max-w-[240px] text-right text-[11px] text-red-600">{galat}</span> : null}
    </div>
  );
}
