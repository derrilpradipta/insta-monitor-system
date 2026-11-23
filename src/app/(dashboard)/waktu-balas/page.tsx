import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader, StatStrip, EmptyState } from "@/components/shell/page-header";
import { getSession } from "@/lib/auth";
import { readMailAccounts } from "@/lib/email/accounts";
import { formatDateTimeId } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  ambilLaporan,
  formatMenit,
  type Rentang,
} from "@/lib/email/reply-report";
import { JAM_KERJA_RINGKAS } from "@/lib/email/replies";
import { WaktuBalasControls } from "@/components/email/waktu-balas-controls";

export const metadata = { title: "Waktu Balas Email" };
export const dynamic = "force-dynamic";

/** Peta alamat email → nama cabang, memakai konfigurasi yang sama dengan /email. */
function petaCabang(): (email: string) => string {
  const akun = readMailAccounts();
  const peta = new Map(akun.map((a) => [a.email.toLowerCase(), a.group]));
  return (email) => peta.get(email.toLowerCase()) ?? email;
}

export default async function WaktuBalasPage({
  searchParams,
}: {
  searchParams: Promise<{ hari?: string }>;
}) {
  const session = await getSession();
  const sp = await searchParams;
  const hari: Rentang = sp.hari === "7" ? 7 : sp.hari === "90" ? 90 : 30;

  const adaAkun = readMailAccounts().length > 0;
  if (!adaAkun) {
    return (
      <div className="space-y-5">
        <PageHeader title="Waktu Balas Email" description="Belum ada akun email yang dikonfigurasi." />
        <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
          <EmptyState
            title="Belum ada akun email"
            description="Isi MAIL_ACCOUNT_1_EMAIL dan MAIL_ACCOUNT_1_CONNECTED_ACCOUNT_ID di environment server."
          />
        </section>
      </div>
    );
  }

  const laporan = await ambilLaporan(hari, petaCabang());
  const { keseluruhan: k, perCabang, perJam, terakhirDiperbarui } = laporan;

  const belumAdaData = k.total === 0;

  // Skala grafik per jam: jam dengan email terbanyak jadi acuan lebar bar.
  const maksJam = Math.max(...perJam.map((j) => j.jumlah), 1);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Waktu Balas Email"
        description={
          terakhirDiperbarui
            ? `Data diperbarui ${formatDateTimeId(terakhirDiperbarui)} · ${hari} hari terakhir`
            : `Belum pernah diambil · ${hari} hari terakhir`
        }
      >
        <div className="flex items-center gap-2">
          <a
            href={`/api/export/waktu-balas?hari=${hari}`}
            title="Unduh laporan Excel"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium shadow-[0_0_0_1px_var(--input)] transition-colors hover:bg-muted"
          >
            <Download className="size-4" />
            Excel
          </a>
          <WaktuBalasControls
            hari={hari}
            bolehUbah={session?.user.role === "ADMIN" || session?.user.role === "PIMPINAN"}
          />
        </div>
      </PageHeader>

      {/* Pemilih rentang */}
      <div className="flex flex-wrap items-center gap-1.5">
        {([7, 30, 90] as const).map((r) => (
          <Link
            key={r}
            href={`/waktu-balas?hari=${r}`}
            aria-current={hari === r ? "page" : undefined}
            className={cn(
              "h-7 rounded-md px-3 text-[12px] font-medium leading-7 transition-colors",
              hari === r
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground shadow-[0_0_0_1px_var(--input)] hover:bg-muted hover:text-foreground",
            )}
          >
            {r} hari
          </Link>
        ))}
        {laporan.jumlahOtomatis > 0 ? (
          <span className="ml-auto text-[11.5px] text-muted-foreground">
            {laporan.jumlahOtomatis} email otomatis & operan file dikecualikan
          </span>
        ) : null}
      </div>

      {/* Dasar perhitungan "jam kerja" — tanpa ini angka rata-rata terasa
          tidak masuk akal bagi yang membacanya. */}
      <p className="-mt-2 text-[11.5px] text-muted-foreground">
        Jam kerja: {JAM_KERJA_RINGKAS} WIB
      </p>

      {belumAdaData ? (
        <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
          <EmptyState
            title="Belum ada data untuk dihitung"
            description="Tekan Ambil data untuk membaca kotak masuk dan pesan terkirim dari Gmail. Proses ini hanya membaca metadata, tidak mengubah status email."
            action={
              <WaktuBalasControls
                hari={hari}
                bolehUbah={session?.user.role === "ADMIN" || session?.user.role === "PIMPINAN"}
                hanyaTombol
              />
            }
          />
        </section>
      ) : (
        <>
          <StatStrip
            items={[
              {
                label: "Kecepatan balas",
                value: formatMenit(k.medianKerjaMenit),
                hint: `separuh dibalas < ${formatMenit(k.medianKerjaMenit)}`,
                tone: "info",
              },
              {
                label: "Dibalas ≤ 1 jam",
                value: `${k.dibalas === 0 ? 0 : Math.round((k.dalam1Jam / k.dibalas) * 100)}%`,
                hint: `${k.dalam1Jam} dari ${k.dibalas} percakapan`,
              },
              {
                label: "Dibalas ≤ 4 jam",
                value: `${k.dibalas === 0 ? 0 : Math.round((k.dalam4Jam / k.dibalas) * 100)}%`,
                hint: `${k.dalam4Jam} dari ${k.dibalas} percakapan`,
              },
              {
                label: "Sudah dibalas",
                value: k.dibalas,
                hint: `dari ${k.total} percakapan`,
              },
            ]}
          />

          {/* Rincian angka pendukung — dipisah supaya kartu utama tetap ringkas
              dan boss tidak dibebani istilah statistik. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-card px-4 py-2.5 text-[11.5px] text-muted-foreground shadow-[var(--shadow-card)]">
            <span>
              Rata-rata tertarik kejadian ekstrem:{" "}
              <span className="font-medium text-foreground">{formatMenit(k.rataKerjaMenit)}</span> (
              {formatMenit(k.rataMenit)} kalender)
            </span>
            <span>
              Total <span className="font-medium text-foreground">{k.total}</span> percakapan
            </span>
          </div>

          {/* Per cabang */}
          <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
            <div className="border-b border-border px-4 py-2.5">
              <h2 className="text-[12.5px] font-semibold text-foreground">Per cabang</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left">
                    <Th className="pl-4">Cabang</Th>
                    <Th className="hidden text-right sm:table-cell">Percakapan</Th>
                    <Th className="text-right">Dibalas</Th>
                    <Th className="text-right">Kecepatan</Th>
                    <Th className="hidden pr-4 text-right sm:table-cell">≤ 4 jam</Th>
                  </tr>
                </thead>
                <tbody>
                  {perCabang.map((c) => {
                    const r = c.ringkasan;
                    return (
                      <tr key={c.group} className="border-t border-border">
                        <td className="py-2 pl-4 pr-2 font-medium text-foreground">{c.group}</td>
                        <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">{r.total}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {r.persenDibalas}%
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatMenit(r.medianKerjaMenit)}</td>
                        <td className="hidden py-2 pl-2 pr-4 text-right tabular-nums text-muted-foreground sm:table-cell">
                          {r.dibalas === 0 ? "—" : `${Math.round((r.dalam4Jam / r.dibalas) * 100)}%`}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Baris total: pembaca bisa langsung mencocokkan dengan kartu
                      ringkasan tanpa menjumlahkan sendiri. */}
                  <tr className="border-t border-border bg-muted/40 font-semibold">
                    <td className="py-2 pl-4 pr-2 text-foreground">Total</td>
                    <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">{k.total}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{k.persenDibalas}%</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatMenit(k.medianKerjaMenit)}</td>
                    <td className="hidden py-2 pl-2 pr-4 text-right tabular-nums sm:table-cell">
                      {k.dibalas === 0 ? "—" : `${Math.round((k.dalam4Jam / k.dibalas) * 100)}%`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Pola per jam masuk */}
          {perJam.length > 0 ? (
            <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
              <div className="border-b border-border px-4 py-2.5">
                <h2 className="text-[12.5px] font-semibold text-foreground">Pola per jam masuk</h2>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  Volume email masuk dan kecepatan balasnya, WIB
                </p>
                <div className="mt-1.5 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                  <span className="w-9 shrink-0" />
                  <span className="flex-1">Volume</span>
                  <span className="w-16 shrink-0 text-right">Masuk</span>
                  <span className="w-16 shrink-0 text-right">Kecepatan</span>
                </div>
              </div>
              <div className="space-y-1.5 px-4 py-3">
                {perJam.map((j) => (
                  <div key={j.jam} className="flex items-center gap-2.5">
                    <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {String(j.jam).padStart(2, "0")}.00
                    </span>
                    <div className="h-4 flex-1 overflow-hidden rounded-sm bg-muted">
                      <div
                        className="h-full rounded-sm bg-primary/70"
                        style={{ width: `${Math.max(4, (j.jumlah / maksJam) * 100)}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {j.jumlah} email
                    </span>
                    <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-foreground">
                      {formatMenit(j.medianMenit)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "label-eyebrow px-2 py-2 font-semibold text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}
