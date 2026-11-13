"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Tombol pengambilan data manual dari halaman Orderan. */
export function RunScrapeButton({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/scraper/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = (await response.json()) as { ok?: boolean; logId?: string; message?: string };
      if (!response.ok || !data.ok) {
        setError(data.message ?? "Pengambilan data gagal.");
        return;
      }
      setOpen(false);
      if (data.logId) router.push(`/history/${data.logId}`);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <RefreshCw className="size-4" /> Ambil data
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ambil data pesanan</DialogTitle>
          <DialogDescription>
            Sistem akan login ke website internal dan mengambil seluruh pesanan pada tanggal masuk yang dipilih,
            termasuk detail tenggat. Proses berjalan di server dan aman dijalankan ulang.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="scrape-date">Tanggal masuk pesanan</Label>
          <Input
            id="scrape-date"
            type="date"
            value={date}
            max={defaultDate}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Batal
          </Button>
          <Button onClick={run} disabled={pending || !date}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {pending ? "Mengambil data…" : "Mulai"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
