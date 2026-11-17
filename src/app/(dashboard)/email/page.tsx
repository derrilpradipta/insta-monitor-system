import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/shell/page-header";
import { readParam, type SearchParams } from "@/lib/query";
import { formatDateTimeId } from "@/lib/time";
import { EmailList } from "@/components/email/email-list";
import { EmailSyncControls } from "@/components/email/email-sync-controls";
import { EmailEmptyCta } from "@/components/email/email-empty-cta";
import { AutoRefresh } from "@/components/email/auto-refresh";
import { cn } from "@/lib/utils";

export const metadata = { title: "Email" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type Filter = "belum" | "semua";

export default async function EmailPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filterRaw = readParam(params, "filter");
  const filter: Filter = filterRaw === "semua" ? "semua" : "belum";
  const page = Math.max(1, Number(readParam(params, "page")) || 1);

  const where = filter === "belum" ? { isRead: false } : {};

  const [total, unreadCount, emails, lastRun] = await Promise.all([
    prisma.emailMessage.count({ where }),
    prisma.emailMessage.count({ where: { isRead: false } }),
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
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, status: true, unreadFound: true, errorMessage: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      {/* Segarkan tampilan tiap jam; pengambilan data tetap tugas penjadwal server. */}
      <AutoRefresh intervalMs={60 * 60 * 1000} />

      <PageHeader
        title="Email Belum Dibaca"
        description={
          lastRun
            ? `Terakhir dicek ${formatDateTimeId(lastRun.startedAt)} · ${unreadCount} belum dibaca`
            : "Belum pernah dicek. Tekan Cek sekarang untuk mengambil email yang belum dibaca."
        }
      >
        {/* Sebelum pernah dicek, tombolnya cukup di keadaan kosong agar tidak ganda. */}
        {lastRun || emails.length > 0 ? <EmailSyncControls /> : null}
      </PageHeader>

      {lastRun?.status === "FAILED" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
          Pengecekan terakhir gagal. Pastikan kredensial email sudah diatur di server.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-card p-1 shadow-[0_0_0_1px_var(--input)] w-fit">
        {(
          [
            { key: "belum" as const, label: `Belum dibaca${unreadCount ? ` (${unreadCount})` : ""}` },
            { key: "semua" as const, label: "Semua" },
          ]
        ).map((tab) => (
          <a
            key={tab.key}
            href={tab.key === "belum" ? "/email" : "/email?filter=semua"}
            className={cn(
              "h-6 rounded px-2.5 text-[11.5px] font-medium leading-6 transition-colors",
              filter === tab.key
                ? "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(16_24_40/0.12)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </a>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
        {emails.length === 0 ? (
          lastRun ? (
            <EmptyState
              title={filter === "belum" ? "Tidak ada email belum dibaca" : "Belum ada email tersimpan"}
              description={
                filter === "belum"
                  ? "Semua email sudah dibaca di mailbox. Email baru akan muncul di sini pada pengecekan berikutnya."
                  : "Pengecekan sudah berjalan, tetapi belum ada email yang tersimpan."
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
              <a
                href={`/email?filter=${filter}&page=${page - 1}`}
                className="rounded-md px-2.5 py-1 shadow-[0_0_0_1px_var(--input)] hover:bg-muted"
              >
                Sebelumnya
              </a>
            ) : null}
            {page < totalPages ? (
              <a
                href={`/email?filter=${filter}&page=${page + 1}`}
                className="rounded-md px-2.5 py-1 shadow-[0_0_0_1px_var(--input)] hover:bg-muted"
              >
                Berikutnya
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
