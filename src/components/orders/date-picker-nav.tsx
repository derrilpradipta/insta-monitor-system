"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

type Preset = { label: string; value: string };

/**
 * Pemilih tanggal dengan pintasan (Hari ini / Kemarin / Besok) dalam satu grup
 * kontrol, supaya header tidak penuh tombol terpisah.
 *
 * Ikon kalender di dalam input adalah indikator native browser — itu satu-satunya
 * elemen yang dijamin membuka kalender saat diklik. Jangan disembunyikan dengan
 * `[&::-webkit-calendar-picker-indicator]:hidden`, karena kolom teks input tanggal
 * tidak bisa diklik untuk membuka kalender (hanya segmen hari/bulan/tahun yang
 * bisa dipilih) sehingga kontrolnya terasa "tidak bisa dipencet".
 */
export function DatePickerNav({
  basePath,
  paramName = "date",
  defaultValue,
  min,
  max,
  label = "Tanggal",
  presets = [],
}: {
  basePath: string;
  paramName?: string;
  defaultValue: string;
  min?: string;
  max?: string;
  label?: string;
  presets?: Preset[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const go = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(paramName, value);
    else next.delete(paramName);
    next.delete("page");
    startTransition(() => router.push(`${basePath}?${next.toString()}`));
  };

  return (
    <div
      className={cn(
        "flex items-center overflow-hidden rounded-md bg-card shadow-[0_0_0_1px_var(--input)]",
        pending && "opacity-70",
      )}
    >
      <label className="sr-only" htmlFor={`date-${paramName}`}>
        {label}
      </label>
      <input
        id={`date-${paramName}`}
        type="date"
        value={defaultValue}
        min={min}
        max={max}
        disabled={pending}
        onChange={(event) => go(event.target.value)}
        className="h-8 w-[9.5rem] cursor-pointer bg-transparent pl-2.5 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-calendar-picker-indicator]:ml-1 [&::-webkit-calendar-picker-indicator]:size-4 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
      />
      {presets.length ? (
        <div className="flex items-center gap-0.5 border-l border-border px-0.5">
          {presets.map((preset) => {
            const active = preset.value === defaultValue;
            return (
              <button
                key={preset.label}
                type="button"
                disabled={pending}
                onClick={() => go(preset.value)}
                className={cn(
                  "h-6 rounded px-2 text-[11.5px] font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(16_24_40/0.12)]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
