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

type Stage = "connect" | "fetch" | "save" | "reconcile" | "selesai" | "wait";

type ProgressEvent =
  | { type: "progress"; stage: "connect"; message: string; account: string }
  | { type: "progress"; stage: "fetch"; message: string; account: string; page: number; collected: number }
  | { type: "progress"; stage: "save"; message: string; account: string; done: number; total: number }
  | { type: "progress"; stage: "reconcile"; message: string; account: string; markedRead: number }
  | {
      type: "done";
      ok: true;
      results: {
        accountEmail: string;
        unreadFound: number;
        internalSkipped: number;
        created: number;
        updated: number;
        markedRead: number;
      }[];
    }
  | { type: "error"; ok: false; message: string };

const STAGE_TEXT: Record<"connect" | "fetch" | "save" | "reconcile", string> = {
  connect: "Menghubungi Gmail",
  fetch: "Mengambil email belum dibaca",
  save: "Menyimpan ke database",
  reconcile: "Menyelaraskan status dibaca",
};

type AkunState = {
  email: string;
  label: string;
  /** Cabang pemilik akun, dipakai untuk mengelompokkan daftar di dialog. */
  group: string;
  stage: Stage;
  note: string;
  fetch: { page: number; collected: number } | null;
  save: { done: number; total: number } | null;
  result: {
    unreadFound: number;
    internalSkipped: number;
    created: number;
    updated: number;
    markedRead: number;
  } | null;
};

/** Keadaan awal: semua akun menunggu. */
function kosong(accounts: { email: string; label: string; group: string }[]): AkunState[] {
  return accounts.map((a) => ({
    email: a.email,
    label: a.label,
    group: a.group,
    stage: "wait" as Stage,
    note: "",
    fetch: null,
    save: null,
    result: null,
  }));
}

/** Kemajuan satu akun pada skala 0–100. */
function persenAkun(a: AkunState): number {
  if (a.stage === "selesai") return 100;
  if (a.stage === "wait") return 0;
  if (a.stage === "connect") return 5;
  if (a.stage === "fetch") {
    const terkumpul = a.fetch?.collected ?? 0;
    return 8 + 52 * (1 - Math.exp(-terkumpul / 12));
  }
  if (a.stage === "save") {
    return a.save && a.save.total > 0 ? 62 + (a.save.done / a.save.total) * 30 : 62;
  }
  return 96;
}

/** Terapkan satu event progres ke akun yang bersangkutan. */
function tandaiProgress(prev: AkunState[], event: Extract<ProgressEvent, { type: "progress" }>): AkunState[] {
  return prev.map((a) => {
    if (a.email !== event.account) return a;
    return {
      ...a,
      stage: event.stage,
      note: event.message,
      fetch: event.stage === "fetch" ? { page: event.page, collected: event.collected } : a.fetch,
      save: event.stage === "save" ? { done: event.done, total: event.total } : a.save,
    };
  });
}

/**
 * Tombol pengecekan email dengan progres NYATA.
 *
 * SELALU memeriksa semua mailbox sekaligus dalam satu proses — tidak perlu
 * berpindah tab dulu. Karena server memprosesnya berurutan, dialog menampilkan
 * akun mana yang sedang dikerjakan beserta angkanya masing-masing.
 *
 * Angka di bilir progres berasal dari server: halaman Gmail yang benar-benar
 * sudah terbaca dan email yang benar-benar sudah tersimpan. Server mengirim
 * NDJSON per tahap (sama seperti tombol "Ambil data" pada pesanan), jadi tidak
 * ada persentase karangan.
 */
export function EmailSyncControls({ accounts }: { accounts: { email: string; label: string; group: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [akun, setAkun] = useState<AkunState[]>(() => kosong(accounts));
  const [elapsed, setElapsed] = useState(0);

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
    setAkun(kosong(accounts));
    setElapsed(0);
    startedAt.current = null;
  };

  const run = async () => {
    reset();
    setRunning(true);
    startedAt.current = Date.now();

    try {
      // Tanpa ?account → server memeriksa SEMUA mailbox secara berurutan.
      const response = await fetch("/api/email/sync?stream=1", { method: "POST" });

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
            setAkun((prev) => tandaiProgress(prev, event));
          } else if (event.type === "done") {
            selesai = true;
            setAkun((prev) =>
              prev.map((a) => {
                const hasil = event.results.find((r) => r.accountEmail === a.email);
                return {
                  ...a,
                  stage: "selesai" as Stage,
                  note: "",
                  result: hasil
                    ? {
                        unreadFound: hasil.unreadFound,
                        internalSkipped: hasil.internalSkipped,
                        created: hasil.created,
                        updated: hasil.updated,
                        markedRead: hasil.markedRead,
                      }
                    : a.result,
                };
              }),
            );

            // Akun yang tidak muncul di hasil berarti gagal diproses.
            const gagalAkun = accounts.filter((a) => !event.results.some((r) => r.accountEmail === a.email));
            if (gagalAkun.length > 0) {
              setError(`${gagalAkun.map((a) => a.label).join(", ")} gagal diperiksa. Coba lagi nanti.`);
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

  // Persentase keseluruhan: rata-rata kemajuan tiap akun. Rata-rata membuat
  // bilahnya bergerak mulus saat berpindah dari akun pertama ke berikutnya.
  const percent = akun.length === 0 ? 0 : akun.reduce((n, a) => n + persenAkun(a), 0) / akun.length;
  const peak = useRef(0);
  if (percent > peak.current) peak.current = percent;
  const shownPercent = Math.round(peak.current);

  const semuaSelesai = akun.length > 0 && akun.every((a) => a.stage === "selesai");
  const aktif = akun.find((a) => a.stage !== "selesai" && a.stage !== "wait");

  // Kelompokkan per cabang: satu proses memeriksa SEMUA mailbox, jadi daftar
  // harus memperlihatkan cabang mana yang sedang dikerjakan.
  const perCabang: { group: string; akun: AkunState[] }[] = [];
  for (const a of akun) {
    const ada = perCabang.find((g) => g.group === a.group);
    if (ada) ada.akun.push(a);
    else perCabang.push({ group: a.group, akun: [a] });
  }

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
            Memeriksa <span className="font-medium text-foreground">{accounts.length} mailbox</span> dari seluruh cabang
            sekaligus dalam satu proses, berurutan. Membaca di sini{" "}
            <span className="font-medium text-foreground">tidak</span> menandai email sebagai sudah dibaca di Gmail.
          </DialogDescription>
        </DialogHeader>

        {akun.length > 0 ? (
          <div className="space-y-3">
            {running || semuaSelesai || elapsed > 0 ? (
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[12.5px] font-medium text-foreground">
                    {semuaSelesai ? "Selesai" : "Sedang berjalan…"}
                  </span>
                  <span className="tabular-nums text-[12px] text-muted-foreground">
                    {shownPercent}% · {elapsed} detik
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-500 ease-out",
                      semuaSelesai ? "bg-emerald-500" : "bg-primary",
                    )}
                    style={{ width: `${Math.max(3, shownPercent)}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">Akan diperiksa:</p>
            )}

            <ol className="space-y-3.5">
              {perCabang.map((g, gi) => {
                const selesaiCabang = g.akun.every((a) => a.stage === "selesai");
                const jalanCabang = g.akun.some((a) => a.stage !== "selesai" && a.stage !== "wait");
                return (
                  <li
                    key={g.group}
                    className={gi === 0 ? "" : "border-t border-border pt-3.5"}
                  >
                    {/* Indentasi 24px = lebar titik (16px) + jarak (8px), supaya
                        label cabang sejajar dengan nama mailbox di bawahnya. */}
                    <div className="mb-1.5 flex items-center gap-1.5 pl-6">
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground">
                        {g.group}
                      </span>
                      <span className="text-[10.5px] tabular-nums text-muted-foreground">
                        · {g.akun.length}
                      </span>
                      {selesaiCabang ? (
                        <Check className="size-3 text-emerald-600" strokeWidth={3} />
                      ) : jalanCabang ? (
                        <Loader2 className="size-3 animate-spin text-primary" strokeWidth={3} />
                      ) : null}
                    </div>

                    <ul className="space-y-2">
                      {g.akun.map((a) => {
                        const sedangAktif = a.stage !== "selesai" && a.stage !== "wait";
                        const counter =
                          a.stage === "fetch" && a.fetch
                            ? `${a.fetch.collected} email · ${a.fetch.page} hlm`
                            : a.stage === "save" && a.save
                              ? `${a.save.done}/${a.save.total}`
                              : null;

                        const detail = a.result
                          ? `${a.result.unreadFound} belum dibaca` +
                            (a.result.created ? ` · ${a.result.created} baru` : "") +
                            (a.result.markedRead ? ` · ${a.result.markedRead} dikeluarkan` : "") +
                            (a.result.internalSkipped ? ` · ${a.result.internalSkipped} operan file` : "")
                          : a.stage === "wait"
                            ? a.email
                            : a.stage === "selesai"
                              ? "selesai"
                              : STAGE_TEXT[a.stage];

                        return (
                          <li key={a.email} className="flex items-start gap-2">
                            <span
                              className={cn(
                                "mt-px flex size-4 shrink-0 items-center justify-center rounded-full",
                                a.stage === "selesai" && "bg-emerald-500 text-white",
                                sedangAktif && "bg-primary/10 text-primary",
                                a.stage === "wait" && "bg-muted text-muted-foreground",
                              )}
                            >
                              {a.stage === "selesai" ? (
                                <Check className="size-2.5" strokeWidth={3.5} />
                              ) : sedangAktif ? (
                                <Loader2 className="size-2.5 animate-spin" strokeWidth={3} />
                              ) : (
                                <span className="size-1.5 rounded-full bg-current" />
                              )}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span
                                  className={cn(
                                    "truncate text-[12.5px] leading-tight",
                                    a.stage === "wait" ? "text-muted-foreground" : "text-foreground",
                                    sedangAktif && "font-medium",
                                  )}
                                >
                                  {a.label}
                                </span>
                                {counter ? (
                                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                    {counter}
                                  </span>
                                ) : null}
                              </div>
                              <p className="truncate text-[11px] leading-tight text-muted-foreground/90">{detail}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ol>

            {aktif && aktif.note && !semuaSelesai ? (
              <p className="truncate text-[11.5px] text-muted-foreground">{aktif.note}</p>
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
            {running ? "Mengecek…" : semuaSelesai ? "Cek ulang" : "Mulai cek"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
