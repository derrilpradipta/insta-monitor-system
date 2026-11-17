"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ImportResult = {
  ok?: boolean;
  checked?: number;
  updated?: number;
  alreadyDone?: number;
  notesSaved?: number;
  notesCleared?: number;
  notFound?: string[];
  message?: string;
};

/**
 * Unggah balik file Excel yang sudah dicentang.
 * Kolom ceklis hanya ada di Excel — di web tidak ada checkbox sama sekali.
 * Kolom Keterangan ikut dibaca dan disimpan ke pesanan.
 */
export function ChecklistUploadButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const upload = () => {
    if (!file) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/import/deadline", { method: "POST", body });
      const data = (await response.json()) as ImportResult;
      if (!response.ok || !data.ok) {
        setError(data.message ?? "Gagal memproses file.");
        return;
      }
      setResult(data);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileUp className="size-4" />
        Unggah ceklis
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unggah ceklis dari Excel</DialogTitle>
          <DialogDescription>
            Unggah kembali file hasil <strong>Export Excel</strong> yang sudah dicentang pada kolom
            &quot;Ceklis&quot;. Pesanan yang dicentang akan ditandai <strong>selesai</strong> di web, dan isi kolom
            &quot;Keterangan&quot; ikut disimpan. Baris yang tidak dicentang tidak diubah statusnya.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Input asli disembunyikan: tombol bawaan browser berlabel Inggris
              ("Choose File") dan tidak bisa diterjemahkan, jadi pemicunya dibuat sendiri. */}
          <input
            ref={inputRef}
            id="ceklis-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
              setResult(null);
            }}
            className="sr-only"
          />

          <label
            htmlFor="ceklis-file"
            className="flex cursor-pointer items-center gap-2.5 rounded-md bg-card px-3 py-2.5 shadow-[0_0_0_1px_var(--input)] transition-shadow hover:shadow-[0_0_0_1px_var(--ring)]"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
              <FileUp className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">
                {file ? file.name : "Pilih file Excel (.xlsx)"}
              </span>
              <span className="block text-[11.5px] text-muted-foreground">
                {file ? `${(file.size / 1024).toFixed(0)} KB · klik untuk ganti` : "Belum ada file dipilih"}
              </span>
            </span>
          </label>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Hanya file <code className="rounded bg-secondary px-1 py-0.5">.xlsx</code> hasil export dari halaman ini
            yang dikenali. Maksimal 15 MB.
          </p>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>
          ) : null}

          {result ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-900">
              <p className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="size-4" />
                {result.message}
              </p>
              <p className="mt-1 text-[12px] text-emerald-800">
                Dicentang: {result.checked ?? 0} · Diubah: {result.updated ?? 0} · Sudah selesai:{" "}
                {result.alreadyDone ?? 0}
                {result.notesSaved ? ` · Keterangan: ${result.notesSaved}` : ""}
                {result.notesCleared ? ` · Dikosongkan: ${result.notesCleared}` : ""}
                {result.notFound?.length ? ` · Tidak ditemukan: ${result.notFound.length}` : ""}
              </p>
              {result.notFound?.length ? (
                <p className="mt-1 max-h-20 overflow-y-auto text-[11.5px] text-emerald-800/80">
                  {result.notFound.slice(0, 20).join(", ")}
                  {result.notFound.length > 20 ? `, +${result.notFound.length - 20} lagi` : ""}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {result ? "Tutup" : "Batal"}
          </Button>
          <Button onClick={upload} disabled={!file || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
            {pending ? "Memproses…" : "Terapkan ceklis"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
