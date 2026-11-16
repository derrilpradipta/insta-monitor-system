"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { monthLabelId } from "@/lib/time";

/**
 * Tombol pemeriksaan bulanan.
 *
 * Di Vercel tombol ini dinonaktifkan: pemeriksaan bulanan butuh 685–1352 detik
 * (terukur dari database), sedangkan batas maksimum fungsi Vercel Hobby 300
 * detik. Kalau dibiarkan aktif, hasilnya tombol yang selalu gagal di tengah
 * jalan. Pemeriksaan bulanan dijalankan di VPS/Docker yang menyala 24 jam.
 */
export function RunReviewButton({
  year,
  month,
  disabled = false,
  disabledReason,
}: {
  year: number;
  month: number;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/monthly/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      const data = (await response.json()) as { ok?: boolean; reviewId?: string; message?: string };
      if (!response.ok || !data.ok || !data.reviewId) {
        setError(data.message ?? "Pemeriksaan gagal dijalankan.");
        return;
      }
      setOpen(false);
      router.push(`/monthly-review/${data.reviewId}`);
      router.refresh();
    });
  };

  if (disabled) {
    return (
      <Button size="sm" disabled title={disabledReason} aria-disabled>
        <PlayCircle className="size-4" /> Periksa {monthLabelId(month, year)}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlayCircle className="size-4" /> Periksa {monthLabelId(month, year)}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Jalankan pemeriksaan {monthLabelId(month, year)}?</DialogTitle>
          <DialogDescription>
            Sistem akan login ke website internal dan mengambil ulang seluruh pesanan dengan tanggal masuk pada
            bulan ini, lalu memperbarui status pemantauan. Proses ini bisa memakan beberapa menit dan aman
            dijalankan ulang.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Batal
          </Button>
          <Button onClick={run} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
            {pending ? "Menjalankan…" : "Mulai pemeriksaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
