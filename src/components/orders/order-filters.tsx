"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Option = { value: string; label: string };

export function OrderFilters({
  branches,
  basePath,
  lockDate,
  extraStatusOptions = [],
}: {
  branches: Option[];
  basePath: string;
  lockDate?: string;
  extraStatusOptions?: Option[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const submit = (formData: FormData) => {
    const next = new URLSearchParams();
    if (lockDate) next.set("date", lockDate);
    for (const key of ["q", "branch", "status", "sort"]) {
      const value = String(formData.get(key) ?? "").trim();
      if (value) next.set(key, value);
    }
    next.delete("page");
    startTransition(() => router.push(`${basePath}?${next.toString()}`));
  };

  const reset = () => {
    const next = new URLSearchParams();
    if (lockDate) next.set("date", lockDate);
    startTransition(() => router.push(`${basePath}?${next.toString()}`));
  };

  const hasFilter = ["q", "branch", "status"].some((key) => params.get(key));

  return (
    <form
      action={(formData) => submit(formData)}
      className="flex flex-col gap-2 rounded-xl bg-card p-2 shadow-[var(--shadow-card)] sm:flex-row sm:items-center"
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground/70" />
        <Input
          name="q"
          defaultValue={params.get("q") ?? ""}
          placeholder="Cari nomor pesanan atau nama pelanggan…"
          className="h-8 pl-8"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          name="branch"
          defaultValue={params.get("branch") ?? ""}
          className="h-8 w-full rounded-md bg-card px-2 text-[13px] text-foreground shadow-[0_0_0_1px_var(--input)] transition-shadow focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--ring)] focus-visible:ring-2 focus-visible:ring-ring/20 sm:w-40"
          aria-label="Filter cabang"
        >
          <option value="">Semua cabang</option>
          {branches.map((branch) => (
            <option key={branch.value} value={branch.value}>
              {branch.label}
            </option>
          ))}
        </select>

        <select
          name="status"
          defaultValue={params.get("status") ?? ""}
          className="h-8 w-full rounded-md bg-card px-2 text-[13px] text-foreground shadow-[0_0_0_1px_var(--input)] transition-shadow focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--ring)] focus-visible:ring-2 focus-visible:ring-ring/20 sm:w-40"
          aria-label="Filter status"
        >
          <option value="">Semua status</option>
          <option value="BELUM_SELESAI">Belum selesai</option>
          <option value="SELESAI">Selesai</option>
          <option value="DIBATALKAN">Dibatalkan</option>
          <option value="TERLAMBAT">Terlambat</option>
          {extraStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          name="sort"
          defaultValue={params.get("sort") ?? ""}
          className="h-8 w-full rounded-md bg-card px-2 text-[13px] text-foreground shadow-[0_0_0_1px_var(--input)] transition-shadow focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--ring)] focus-visible:ring-2 focus-visible:ring-ring/20 sm:w-40"
          aria-label="Urutkan"
        >
          <option value="">Terbaru</option>
          <option value="order_asc">Tanggal masuk (lama)</option>
          <option value="deadline_asc">Tenggat terdekat</option>
          <option value="deadline_desc">Tenggat terjauh</option>
          <option value="customer_asc">Nama pelanggan (A-Z)</option>
        </select>

        <Button type="submit" size="sm" variant="secondary" disabled={pending} className="h-8 px-3">
          {pending ? "Memuat…" : "Terapkan"}
        </Button>

        {hasFilter ? (
          <Button type="button" size="sm" variant="ghost" onClick={reset} className="h-8 px-2" aria-label="Reset filter">
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
    </form>
  );
}
