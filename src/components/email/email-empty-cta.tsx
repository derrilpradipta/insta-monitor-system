"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Tombol "Cek sekarang" untuk keadaan kosong, khusus satu akun. */
export function EmailEmptyCta({ account }: { account: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cek = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/email/sync?account=${encodeURIComponent(account)}`, { method: "POST" });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
        if (!res.ok || !data.ok) {
          setError(data.message ?? "Terjadi kesalahan pada server. Silakan coba lagi.");
          return;
        }
        router.refresh();
      } catch {
        setError("Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.");
      }
    });
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button size="sm" onClick={cek} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        {pending ? "Mengecek…" : "Cek sekarang"}
      </Button>
      {error ? <p className="text-[11.5px] text-red-600">{error}</p> : null}
    </div>
  );
}
