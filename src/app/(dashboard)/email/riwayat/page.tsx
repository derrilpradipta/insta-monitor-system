import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/shell/page-header";
import { readParam, type SearchParams } from "@/lib/query";
import { formatDateTimeId } from "@/lib/time";
import { readMailAccounts } from "@/lib/email/accounts";
import { cn } from "@/lib/utils";

export const metadata = { title: "Riwayat Email" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  SUCCESS: { text: "Berhasil", className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  PARTIAL: { text: "Sebagian", className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  FAILED: { text: "Gagal", className: "bg-red-50 text-red-700 ring-1 ring-red-200" },
  RUNNING: { text: "Berjalan", className: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" },
};

/**
 * Riwayat pengecekan email.
 *
 * Sengaja halaman sendiri (bukan di /history) supaya tidak tercampur dengan
 * riwayat pengambilan data pesanan — dua hal berbeda dengan jadwal berbeda.
 */
export default async function EmailHistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const akunTersedia = readMailAccounts();
  const akunDiminta = readParam(params, "akun");
  const akunAktif = akunTersedia.find((a) => a.email === akunDiminta) ?? akunTersedia[0] ?? null;
  const page = Math.max(1, Number(readParam(params, "page")) || 1);

  if (!akunAktif) {
    return (
      <div className="space-y-5">
        <PageHeader title="Riwayat Pengecekan Email" description="Belum ada akun email yang dikonfigurasi." />
        <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
          <EmptyState title="Belum ada akun email" description="Isi konfigurasi akun email di environment server." />
        </section>
      </div>
    );
  }

  const [total, runs] = await Promise.all([
    prisma.emailSyncRun.count({ where: { accountEmail: akunAktif.email } }),
    prisma.emailSyncRun.findMany({
      where: { accountEmail: akunAktif.email },
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        unreadFound: true,
        created: true,
        updated: true,
        markedRead: true,
        errorMessage: true,
        triggeredBy: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hrefAkun = (email: string) =>
    email === akunTersedia[0]?.email ? "/email/riwayat" : `/email/riwayat?akun=${encodeURIComponent(email)}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Riwayat Pengecekan Email"
        description="Catatan setiap pengambilan email belum dibaca. Terpisah dari riwayat pengambilan data pesanan."
      >
        <Link
          href="/email"
          className="rounded-md px-3 py-1.5 text-[12.5px] shadow-[0_0_0_1px_var(--input)] hover:bg-muted"
        >
          ← Kembali ke Email
        </Link>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-card p-1 shadow-[0_0_0_1px_var(--input)] w-fit">
        {akunTersedia.map((akun) => (
          <Link
            key={akun.email}
            href={hrefAkun(akun.email)}
            className={cn(
              "h-7 rounded px-2.5 text-[12px] font-medium leading-7 transition-colors",
              akun.email === akunAktif.email
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {akun.label}
          </Link>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
        {runs.length === 0 ? (
          <EmptyState
            title="Belum ada riwayat"
            description="Riwayat akan terisi otomatis setiap kali pengecekan email berjalan."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Mulai</th>
                  <th className="px-4 py-2 font-medium">Selesai</th>
                  <th className="px-4 py-2 text-right font-medium">Ditemukan</th>
                  <th className="px-4 py-2 text-right font-medium">Baru</th>
                  <th className="px-4 py-2 text-right font-medium">Diperbarui</th>
                  <th className="px-4 py-2 text-right font-medium">Ditandai dibaca</th>
                  <th className="px-4 py-2 font-medium">Pemicu</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((r) => {
                  const label = STATUS_LABEL[r.status] ?? {
                    text: r.status,
                    className: "bg-muted text-muted-foreground",
                  };
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                        {formatDateTimeId(r.startedAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted-foreground">
                        {r.finishedAt ? formatDateTimeId(r.finishedAt) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.unreadFound}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.created}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.updated}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.markedRead}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.triggeredBy ?? "—"}</td>
                      <td className="px-4 py-2">
                        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", label.className)}>
                          {label.text}
                        </span>
                        {r.errorMessage ? (
                          <span className="ml-1.5 text-[11px] text-red-600" title={r.errorMessage}>
                            ada galat
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
          <span>
            Halaman {page} dari {totalPages} · {total} catatan
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`${hrefAkun(akunAktif.email)}${hrefAkun(akunAktif.email).includes("?") ? "&" : "?"}page=${page - 1}`}
                className="rounded-md px-2.5 py-1 shadow-[0_0_0_1px_var(--input)] hover:bg-muted"
              >
                Sebelumnya
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={`${hrefAkun(akunAktif.email)}${hrefAkun(akunAktif.email).includes("?") ? "&" : "?"}page=${page + 1}`}
                className="rounded-md px-2.5 py-1 shadow-[0_0_0_1px_var(--input)] hover:bg-muted"
              >
                Berikutnya
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
