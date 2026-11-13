"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

export type DeadlineMode = "hari" | "rentang" | "bulan";

/**
 * Filter tenggat: satu tanggal, rentang tanggal, atau satu bulan penuh.
 * Semua nilai disimpan di URL agar bisa dibagikan/di-bookmark.
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

  const go = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    q.delete("page");
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") q.delete(key);
      else q.set(key, value);
    }
    startTransition(() => router.push(`/deadline?${q.toString()}`));
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
    "h-8 cursor-pointer bg-transparent px-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-calendar-picker-indicator]:ml-1 [&::-webkit-calendar-picker-indicator]:size-4 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100";

  return (
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
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={from}
            onChange={(event) => go({ dari: event.target.value })}
            disabled={pending}
            aria-label="Tenggat dari tanggal"
            className={cn("w-[9.5rem]", inputClass)}
          />
          <span className="text-[12px] text-muted-foreground">s/d</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => go({ sampai: event.target.value })}
            disabled={pending}
            aria-label="Tenggat sampai tanggal"
            className={cn("w-[9.5rem]", inputClass)}
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
  );
}
