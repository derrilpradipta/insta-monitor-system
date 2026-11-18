import Link from "next/link";
import { Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/shell/page-header";
import { readParam, type SearchParams } from "@/lib/query";
import { formatDateTimeId } from "@/lib/time";
import { EmailList } from "@/components/email/email-list";
import { EmailSyncControls } from "@/components/email/email-sync-controls";
import { EmailEmptyCta } from "@/components/email/email-empty-cta";
import { AutoRefresh } from "@/components/email/auto-refresh";
import { readMailAccounts } from "@/lib/email/accounts";
import { cn } from "@/lib/utils";

export const metadata = { title: "Email" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function EmailPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const akunTersedia = readMailAccounts();

  // Akun aktif dipilih lewat ?akun=<email>; default akun pertama.
  const akunDiminta = readParam(params, "akun");
  const akunAktif = akunTersedia.find((a) => a.email === akunDiminta) ?? akunTersedia[0] ?? null;

  const filterRaw = readParam(params, "filter");
  const filterSemua = filterRaw === "semua";
  const page = Math.max(1, Number(readParam(params, "page")) || 1);

  if (!akunAktif) {
    return (
      <div className="space-y-5">
        <PageHeader title="Email Belum Dibaca" description="Belum ada akun email yang dikonfigurasi." />
        <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
          <EmptyState
            title="Belum ada akun email"
            description="Isi MAIL_ACCOUNT_1_EMAIL dan MAIL_ACCOUNT_1_CONNECTED_ACCOUNT_ID di environment server."
          />
        </section>
      </div>
    );
  }

  const where = {
    accountEmail: akunAktif.email,
    ...(filterSemua ? {} : { isRead: false }),
  };

  const [total, unreadAktif, emails, lastRun, unreadPerAkun] = await Promise.all([
    prisma.emailMessage.count({ where }),
    prisma.emailMessage.count({ where: { accountEmail: akunAktif.email, isRead: false } }),
    prisma.emailMessage.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        fromName: true,
        fromAddress: true,
        subject: true,
        snippet: true,
        receivedAt: true,
        hasAttachments: true,
        isRead: true,
      },
    }),
    prisma.emailSyncRun.findFirst({
      where: { accountEmail: akunAktif.email },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, status: true, unreadFound: true },
    }),
    prisma.emailMessage.groupBy({
      by: ["accountEmail"],
      where: { isRead: false },
      _count: { _all: true },
    }),
  ]);

  const jumlahBelumDibaca = new Map(unreadPerAkun.map((r) => [r.accountEmail, r._count._all]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const akunDefault = akunTersedia[0]?.email;
  const hrefAkun = (email: string) => {
    const q = new URLSearchParams();
    if (email !== akunDefault) q.set("akun", email);
    if (filterSemua) q.set("filter", "semua");
    const s = q.toString();
    return s ? `/email?${s}` : "/email";
  };

  const hrefFilter = (semua: boolean) => {
    const q = new URLSearchParams();
    if (akunAktif.email !== akunDefault) q.set("akun", akunAktif.email);
    if (semua) q.set("filter", "semua");
    const s = q.toString();
    return s ? `/email?${s}` : "/email";
  };

  const hrefHalaman = (n: number) => {
    const base = hrefFilter(filterSemua);
    return `${base}${base.includes("?") ? "&" : "?"}page=${n}`;
  };

  // Laporan Excel selalu memuat SEMUA akun dalam satu file, mengikuti tab
  // belum-dibaca / semua yang sedang aktif.
  const hrefExport = `/api/export/email${filterSemua ? "?filter=semua" : ""}`;

  const hrefRiwayat = `/email/riwayat${
    akunAktif.email !== akunDefault ? `?akun=${encodeURIComponent(akunAktif.email)}` : ""
  }`;

  return (
    <div className="space-y-5">
      {/* Segarkan tampilan tiap jam; pengambilan data tetap tugas penjadwal server. */}
      <AutoRefresh intervalMs={60 * 60 * 1000} />

      <PageHeader
        title="Email Belum Dibaca"
        description={
          lastRun
            ? `${akunAktif.label} · terakhir dicek ${formatDateTimeId(lastRun.startedAt)} · ${unreadAktif} belum dibaca`
            : `${akunAktif.label} · belum pernah dicek`
        }
      >
        <div className="flex items-center gap-2">
          <a
            href={hrefExport}
            title="Unduh laporan Excel berisi semua akun dalam satu file"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium shadow-[0_0_0_1px_var(--input)] transition-colors hover:bg-muted"
          >
            <Download className="size-4" />
            Excel
          </a>
          {/* Satu tombol untuk semua mailbox: tidak perlu pindah tab dulu. */}
          <EmailSyncControls
            accounts={akunTersedia.map((a) => ({ email: a.email, label: a.label }))}
          />
        </div>
      </PageHeader>

      {lastRun?.status === "FAILED" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
          Pengecekan terakhir untuk akun ini gagal. Periksa koneksi Gmail-nya di dashboard Composio.
        </p>
      ) : null}

      {/* Tab akun: satu tab per mailbox */}
      <div className="flex w-fit flex-wrap items-center gap-1.5 rounded-md bg-card p-1 shadow-[0_0_0_1px_var(--input)]">
        {akunTersedia.map((akun) => {
          const aktif = akun.email === akunAktif.email;
          const jumlah = jumlahBelumDibaca.get(akun.email) ?? 0;
          return (
            <Link
              key={akun.email}
              href={hrefAkun(akun.email)}
              aria-current={aktif ? "page" : undefined}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded px-2.5 text-[12px] font-medium transition-colors",
                aktif
                  ? "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(16_24_40/0.12)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {akun.label}
              {jumlah > 0 ? (
                <span
                  className={cn(
                    "rounded px-1 text-[10.5px] tabular-nums",
                    aktif ? "bg-white/20" : "bg-muted text-muted-foreground",
                  )}
                >
                  {jumlah}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {/* Filter dibaca/belum */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { semua: false, label: `Belum dibaca${unreadAktif ? ` (${unreadAktif})` : ""}` },
            { semua: true, label: "Semua" },
          ].map((tab) => (
            <Link
              key={String(tab.semua)}
              href={hrefFilter(tab.semua)}
              className={cn(
                "h-6 rounded px-2.5 text-[11.5px] font-medium leading-6 transition-colors",
                filterSemua === tab.semua
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <Link
          href={hrefRiwayat}
          className="text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Riwayat pengecekan email →
        </Link>
      </div>

      <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
        {emails.length === 0 ? (
          lastRun ? (
            <EmptyState
              title={filterSemua ? "Belum ada email tersimpan" : "Tidak ada email belum dibaca"}
              description={
                filterSemua
                  ? "Pengecekan sudah berjalan, tetapi belum ada email yang tersimpan untuk akun ini."
                  : "Semua email sudah dibaca di Gmail. Email baru akan muncul di sini pada pengecekan berikutnya."
              }
            />
          ) : (
            <EmptyState
              title="Belum ada data email"
              description="Tekan Cek sekarang untuk mengambil email yang belum dibaca. Membaca di sini tidak menandai email sebagai sudah dibaca."
              action={<EmailEmptyCta />}
            />
          )
        ) : (
          <EmailList emails={emails.map((e) => ({ ...e, receivedAt: e.receivedAt.toISOString() }))} />
        )}
      </section>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
          <span>
            Halaman {page} dari {totalPages} · {total} email
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={hrefHalaman(page - 1)} className="rounded-md px-2.5 py-1 shadow-[0_0_0_1px_var(--input)] hover:bg-muted">
                Sebelumnya
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={hrefHalaman(page + 1)} className="rounded-md px-2.5 py-1 shadow-[0_0_0_1px_var(--input)] hover:bg-muted">
                Berikutnya
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
