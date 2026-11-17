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
import { cn } from "@/lib/utils";

type Stage = "connect" | "fetch" | "save" | "reconcile" | "selesai";

type ProgressEvent =
  | { type: "progress"; stage: "connect"; message: string; account: string }
  | { type: "progress"; stage: "fetch"; message: string; account: string; page: number; collected: number }
  | { type: "progress"; stage: "save"; message: string; account: string; done: number; total: number }
  | { type: "progress"; stage: "reconcile"; message: string; account: string; markedRead: number }
  | {
      type: "done";
      ok: true;
      results: { accountEmail: string; unreadFound: number; created: number; updated: number; markedRead: number }[];
    }
  | { type: "error"; ok: false; message: string };

const STEPS: { key: Exclude<Stage, "selesai">; label: string }[] = [
  { key: "connect", label: "Menghubungi Gmail" },
  { key: "fetch", label: "Mengambil email belum dibaca" },
  { key: "save", label: "Menyimpan ke database" },
  { key: "reconcile", label: "Menyelaraskan status dibaca" },
];

const ORDER: Record<Stage, number> = { connect: 0, fetch: 1, save: 2, reconcile: 3, selesai: 4 };

/**
 * Tombol pengecekan email dengan progres NYATA.
 *
 * Angka di bilah progres berasal dari server: halaman Gmail yang benar-benar
 * sudah terbaca dan email yang benar-benar sudah tersimpan. Server mengirim
 * NDJSON per tahap (sama seperti tombol "Ambil data" pada pesanan), jadi tidak
 * ada persentase karangan.
 */
export function EmailSyncControls({ account, label }: { account: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stage, setStage] = useState<Stage>("connect");
  const [note, setNote] = useState("");
  const [fetchInfo, setFetchInfo] = useState<{ page: number; collected: number } | null>(null);
  const [saveInfo, setSaveInfo] = useState<{ done: number; total: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);

  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      if (startedAt.current) setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [running]);

  const reset = () => {
    setError(null);
    setStage("connect");
    setNote("");
    setFetchInfo(null);
    setSaveInfo(null);
    setElapsed(0);
    setSummary(null);
    startedAt.current = null;
  };

  const run = async () => {
    reset();
    setRunning(true);
    startedAt.current = Date.now();

    try {
      const response = await fetch(
        `/api/email/sync?account=${encodeURIComponent(account)}&stream=1`,
        { method: "POST" },
      );

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? "Terjadi kesalahan pada server. Silakan coba lagi.");
        setRunning(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let selesai = false;
      let gagal = false;

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
            if (event.stage === "fetch") setFetchInfo({ page: event.page, collected: event.collected });
            if (event.stage === "save") setSaveInfo({ done: event.done, total: event.total });
          } else if (event.type === "done") {
            selesai = true;
            setStage("selesai");
            setNote("");

            const r = event.results[0];
            if (r) {
              const bagian = [`${r.unreadFound} belum dibaca`];
              if (r.created) bagian.push(`${r.created} baru`);
              if (r.markedRead) bagian.push(`${r.markedRead} sudah dibaca, dikeluarkan`);
              bagian.push(`total tersimpan ${r.unreadFound}`);
              setSummary(bagian.join(" · "));
            }
          } else if (event.type === "error") {
            gagal = true;
            setError(event.message);
          }
        }
      }

      if (!selesai && !gagal) {
        setError("Proses terhenti sebelum selesai. Silakan coba lagi.");
      } else if (selesai) {
        router.refresh();
      }
    } catch {
      setError("Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.");
    } finally {
      setRunning(false);
    }
  };

  // Persentase dari kemajuan nyata; tidak pernah mundur.
  let percent = 0;
  if (stage === "connect") percent = 4;
  else if (stage === "fetch") {
    // Jumlah email belum dibaca tidak diketahui sebelum selesai, jadi kurvanya
    // melandai: makin banyak terkumpul, makin dekat ke 60%.
    const collected = fetchInfo?.collected ?? 0;
    percent = 8 + 52 * (1 - Math.exp(-collected / 12));
  } else if (stage === "save") {
    percent = saveInfo && saveInfo.total > 0 ? 62 + (saveInfo.done / saveInfo.total) * 30 : 62;
  } else if (stage === "reconcile") percent = 96;
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
        if (!next && running) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button size="sm" onClick={() => setOpen(true)}>
        <RefreshCw className="size-4" /> Cek sekarang
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cek email belum dibaca</DialogTitle>
          <DialogDescription>
            Mengambil email yang belum dibaca dari <span className="font-medium text-foreground">{label}</span> lewat
            Gmail API. Membaca di sini <span className="font-medium text-foreground">tidak</span> menandai email sebagai
            sudah dibaca di Gmail.
          </DialogDescription>
        </DialogHeader>

        {running || stage === "selesai" || summary ? (
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
                  step.key === "fetch" && state !== "wait" && fetchInfo && fetchInfo.collected > 0
                    ? `${fetchInfo.collected} email · ${fetchInfo.page} hlm`
                    : step.key === "save" && state !== "wait" && saveInfo
                      ? `${saveInfo.done}/${saveInfo.total}`
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

            {summary ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800">
                {summary}
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>
            Tutup
          </Button>
          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {running ? "Mengecek…" : "Mulai cek"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
