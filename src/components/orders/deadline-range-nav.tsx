"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type DeadlineMode = "hari" | "rentang" | "bulan";

/**
 * Filter tenggat: satu tanggal, rentang tanggal, atau satu bulan penuh.
 * Semua nilai disimpan di URL agar bisa dibagikan/di-bookmark.
 *
 * Khusus mode Rentang, tanggal "dari" dan "sampai" ditahan sebagai draft dan
 * baru diterapkan saat tombol Terapkan ditekan. Tanpa ini, memilih tanggal
 * pertama langsung memuat ulang halaman sehingga hasil setengah jadi muncul
 * sebelum tanggal kedua sempat dipilih.
 */
export function DeadlineRangeNav({
  mode,
  date,
  from,
  to,
  month,
  today,
  tomorrow,
}: {
  mode: DeadlineMode;
  date: string;
  from: string;
  to: string;
  month: string;
  today: string;
  tomorrow: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Draft rentang: dipakai hanya di mode "rentang", baru diterapkan saat
  // tombol Terapkan ditekan.
  const [draft, setDraft] = useState({ from, to, appliedFrom: from, appliedTo: to });

  // Selaraskan draft ketika nilai dari URL berubah (setelah Terapkan, ganti
  // mode, atau tombol kembali di browser). Dilakukan saat render, bukan di
  // dalam effect, supaya tidak memicu render berantai.
  if (draft.appliedFrom !== from || draft.appliedTo !== to) {
    setDraft({ from, to, appliedFrom: from, appliedTo: to });
  }

  const go = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    q.delete("page");
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") q.delete(key);
      else q.set(key, value);
    }
    startTransition(() => router.push(`/deadline?${q.toString()}`));
  };

  const rangeDirty = draft.from !== from || draft.to !== to;

  const applyRange = () => {
    if (!draft.from || !draft.to) return;
    go({ mode: "rentang", dari: draft.from, sampai: draft.to });
  };

  const modeButton = (value: DeadlineMode, label: string) => (
    <button
      key={value}
      type="button"
      disabled={pending}
      onClick={() => go({ mode: value })}
      className={cn(
        "h-6 rounded px-2 text-[11.5px] font-medium transition-colors",
        mode === value
          ? "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(16_24_40/0.12)]"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      aria-pressed={mode === value}
    >
      {label}
    </button>
  );

  const inputClass =
    "h-8 min-w-0 cursor-pointer bg-transparent px-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-calendar-picker-indicator]:ml-1 [&::-webkit-calendar-picker-indicator]:size-4 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-md bg-card p-1 shadow-[0_0_0_1px_var(--input)]",
          pending && "opacity-70",
        )}
      >
        <div className="flex items-center gap-0.5">
          {modeButton("hari", "Tanggal")}
          {modeButton("rentang", "Rentang")}
          {modeButton("bulan", "Bulan")}
        </div>

        <span className="h-5 w-px bg-border" aria-hidden />

        {mode === "hari" ? (
          <input
            type="date"
            value={date}
            onChange={(event) => go({ date: event.target.value })}
            disabled={pending}
            aria-label="Tanggal tenggat"
            className={cn("w-[9.5rem]", inputClass)}
          />
        ) : null}

      {mode === "rentang" ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <input
            type="date"
            value={draft.from}
            onChange={(event) => setDraft((prev) => ({ ...prev, from: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyRange();
            }}
            disabled={pending}
            aria-label="Tenggat dari tanggal"
            className={cn("w-[8.5rem] sm:w-[9.5rem]", inputClass)}
          />
          <span className="text-[12px] text-muted-foreground">s/d</span>
          <input
            type="date"
            value={draft.to}
            min={draft.from}
            onChange={(event) => setDraft((prev) => ({ ...prev, to: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyRange();
            }}
            disabled={pending}
            aria-label="Tenggat sampai tanggal"
            className={cn("w-[8.5rem] sm:w-[9.5rem]", inputClass)}
          />

        </div>
      ) : null}

      {mode === "bulan" ? (
        <input
          type="month"
          value={month}
          onChange={(event) => go({ bulan: event.target.value })}
          disabled={pending}
          aria-label="Bulan tenggat"
          className={cn("w-[10.5rem]", inputClass)}
        />
      ) : null}

      {mode === "hari" ? (
        <div className="flex items-center gap-0.5 border-l border-border pl-1.5">
          <button
            type="button"
            disabled={pending}
            onClick={() => go({ date: today, mode: "hari" })}
            className={cn(
              "h-6 rounded px-2 text-[11.5px] font-medium transition-colors",
              date === today
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Hari ini
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => go({ date: tomorrow, mode: "hari" })}
            className={cn(
              "h-6 rounded px-2 text-[11.5px] font-medium transition-colors",
              date === tomorrow
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Besok
          </button>
        </div>
      ) : null}
      </div>

      {/* Tombol aksi: hanya di mode Rentang, berdiri sendiri di luar kotak putih */}
      {mode === "rentang" ? (
        <button
          type="button"
          onClick={applyRange}
          disabled={pending || !draft.from || !draft.to}
          aria-label="Terapkan rentang tanggal"
          title={
            rangeDirty
              ? "Tampilkan pesanan pada rentang tanggal ini"
              : "Rentang ini sedang ditampilkan"
          }
          className={cn(
            "flex h-10 shrink-0 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-semibold transition-colors",
            rangeDirty
              ? "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(16_24_40/0.18)] hover:brightness-110"
              : "bg-card text-muted-foreground shadow-[0_0_0_1px_var(--input)] hover:bg-muted hover:text-foreground",
          )}
        >
          <Check className="size-4" strokeWidth={2.75} />
          {pending ? "Memuat…" : "Terapkan"}
        </button>
      ) : null}
    </div>
  );
}
