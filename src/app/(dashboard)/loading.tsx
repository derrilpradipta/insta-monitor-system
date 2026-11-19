/**
 * Skeleton yang muncul seketika saat pindah halaman.
 *
 * Next.js memakai file ini sebagai Suspense boundary: kerangka tampil langsung
 * begitu tautan diklik, jadi pengguna melihat perubahan layar tanpa menunggu
 * query database selesai.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      {/* Header: judul + deskripsi + tombol */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-64 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      {/* Kartu ringkasan */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="h-3 w-20 animate-pulse rounded bg-muted/70" />
            <div className="mt-2.5 h-7 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Tabel */}
      <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
        <div className="border-b border-border bg-muted/40 px-4 py-2.5">
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
              <div className="h-3.5 flex-1 animate-pulse rounded bg-muted/70" />
              <div className="h-3.5 w-24 animate-pulse rounded bg-muted/70" />
              <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>

      <p className="sr-only">Memuat halaman…</p>
    </div>
  );
}
