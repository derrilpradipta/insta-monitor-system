"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw } from "lucide-react";
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
import { cn } from "@/lib/utils";

type Stage = "login" | "list" | "detail" | "save" | "selesai";

type ProgressEvent =
  | { type: "progress"; stage: "login"; message: string }
  | { type: "progress"; stage: "list"; message: string; page: number; collected: number }
  | { type: "progress"; stage: "detail"; message: string; done: number; total: number }
  | { type: "progress"; stage: "save"; message: string }
  | { type: "done"; ok: true; logId: string }
  | { type: "error"; ok: false; message: string };

const STEPS: { key: Exclude<Stage, "selesai">; label: string }[] = [
  { key: "login", label: "Login ke website sumber" },
  { key: "list", label: "Mengambil daftar pesanan" },
  { key: "detail", label: "Mengambil detail tenggat" },
  { key: "save", label: "Menyimpan ke database" },
];

const ORDER: Record<Stage, number> = { login: 0, list: 1, detail: 2, save: 3, selesai: 4 };

/**
 * Tombol pengambilan data manual dengan progres NYATA.
 *
 * Progres tidak ditebak: server mengirim NDJSON per tahap dan per pekerjaan
 * yang benar-benar sudah selesai (halaman daftar terbaca, pesanan ke-N selesai
 * diambil detailnya). Satu-satunya bagian yang berjalan sendiri hanyalah
 * penghitung detik.
 */
export function RunScrapeButton({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stage, setStage] = useState<Stage>("login");
  const [note, setNote] = useState<string>("");
  const [listInfo, setListInfo] = useState<{ page: number; collected: number } | null>(null);
  const [detailInfo, setDetailInfo] = useState<{ done: number; total: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState<{ logId: string } | null>(null);

  const startedAt = useRef<number | null>(null);

  // Detik berjalan.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      if (startedAt.current) setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [running]);

  const reset = () => {
    setError(null);
    setStage("login");
    setNote("");
    setListInfo(null);
    setDetailInfo(null);
    setElapsed(0);
    setFinished(null);
    startedAt.current = null;
  };

  const run = async () => {
    reset();
    setRunning(true);
    startedAt.current = Date.now();

    try {
      const response = await fetch("/api/scraper/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      // Sesi habis, atau galat sebelum streaming dimulai.
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? "Terjadi kesalahan pada server. Silakan coba lagi.");
        setRunning(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let logId: string | null = null;
      let failed = false;

      // Baca NDJSON baris demi baris selagi proses masih berjalan.
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
          if (!line) continue;

          let event: ProgressEvent;
          try {
            event = JSON.parse(line) as ProgressEvent;
          } catch {
            continue;
          }

          if (event.type === "progress") {
            setStage(event.stage);
            setNote(event.message);
            if (event.stage === "list") {
              setListInfo({ page: event.page, collected: event.collected });
            } else if (event.stage === "detail") {
              setDetailInfo({ done: event.done, total: event.total });
            }
          } else if (event.type === "done") {
            logId = event.logId;
            setStage("selesai");
            setNote("");
            setFinished({ logId: event.logId });
          } else if (event.type === "error") {
            failed = true;
            setError(event.message);
          }
        }
      }

      if (!logId && !failed) {
        setError("Proses terhenti sebelum selesai. Silakan coba lagi.");
      }
    } catch {
      setError("Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.");
    } finally {
      setRunning(false);
    }
  };

  // Berhasil: tampilkan centang sebentar, lalu buka halaman riwayat.
  useEffect(() => {
    if (!finished) return;
    const id = finished.logId;
    const timer = setTimeout(() => {
      setOpen(false);
      router.push(`/history/${id}`);
      router.refresh();
    }, 700);
    return () => clearTimeout(timer);
  }, [finished, router]);

  // Persentase dihitung dari kemajuan nyata dan tidak pernah mundur.
  // Tahap "list" memakai jumlah halaman yang sudah dibaca (situs sumber tidak
  // menampilkan total pesanan, jadi kurvanya melandai mendekati 35%).
  let percent = 0;
  if (stage === "login") percent = 3;
  else if (stage === "list") {
    const pages = listInfo?.page ?? 0;
    percent = 5 + 30 * (1 - Math.exp(-pages / 8));
  } else if (stage === "detail") {
    percent = detailInfo && detailInfo.total > 0 ? 40 + (detailInfo.done / detailInfo.total) * 55 : 40;
  } else if (stage === "save") percent = 96;
  else if (stage === "selesai") percent = 100;

  const peak = useRef(0);
  if (percent > peak.current) peak.current = percent;
  const shownPercent = Math.round(peak.current);

  const currentIndex = ORDER[stage];
  const stepState = (index: number): "done" | "active" | "wait" => {
    if (stage === "selesai") return "done";
    if (index < currentIndex) return "done";
    if (index === currentIndex) return "active";
    return "wait";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Jangan biarkan dialog ditutup saat proses masih berjalan.
        if (!next && running) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
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

        {!running && !finished ? (
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
        ) : null}

        {running || finished ? (
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[12.5px] font-medium text-foreground">
                  {stage === "selesai" ? "Selesai" : "Sedang berjalan…"}
                </span>
                <span className="tabular-nums text-[12px] text-muted-foreground">
                  {shownPercent}% · {elapsed} detik
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500 ease-out",
                    stage === "selesai" ? "bg-emerald-500" : "bg-primary",
                  )}
                  style={{ width: `${Math.max(3, shownPercent)}%` }}
                />
              </div>
            </div>

            <ol className="space-y-1.5">
              {STEPS.map((step, index) => {
                const state = stepState(index);
                const counter =
                  step.key === "list" && state !== "wait" && listInfo && listInfo.collected > 0
                    ? `${listInfo.collected.toLocaleString("id-ID")} pesanan · ${listInfo.page} hlm`
                    : step.key === "detail" && state !== "wait" && detailInfo
                      ? `${detailInfo.done}/${detailInfo.total}`
                      : null;

                return (
                  <li key={step.key} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full",
                        state === "done" && "bg-emerald-500 text-white",
                        state === "active" && "bg-primary/10 text-primary",
                        state === "wait" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {state === "done" ? (
                        <Check className="size-2.5" strokeWidth={3.5} />
                      ) : state === "active" ? (
                        <Loader2 className="size-2.5 animate-spin" strokeWidth={3} />
                      ) : (
                        <span className="size-1 rounded-full bg-current" />
                      )}
                    </span>
                    <span
                      className={cn(
                        "text-[12.5px] leading-none",
                        state === "wait" ? "text-muted-foreground" : "text-foreground",
                        state === "active" && "font-medium",
                      )}
                    >
                      {step.label}
                    </span>
                    {counter ? (
                      <span className="ml-auto text-[11.5px] tabular-nums text-muted-foreground">{counter}</span>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {note && stage !== "selesai" ? (
              <p className="truncate text-[11.5px] text-muted-foreground">{note}</p>
            ) : null}

            {finished ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800">
                Data berhasil diambil. Membuka riwayat…
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>
            {finished ? "Tutup" : "Batal"}
          </Button>
          <Button onClick={run} disabled={running || !date}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {running ? "Mengambil data…" : "Mulai"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
