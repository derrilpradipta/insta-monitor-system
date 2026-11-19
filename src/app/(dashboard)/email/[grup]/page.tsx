import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmailGroupView } from "@/components/email/email-group-view";
import { findMailGroup, readMailGroups } from "@/lib/email/accounts";
import { readParam, type SearchParams } from "@/lib/query";

export const dynamic = "force-dynamic";

/**
 * Halaman Email per cabang, mis. /email/pusat atau /email/bsd.
 *
 * Semua cabang memakai komponen yang sama (EmailGroupView), jadi perilakunya
 * identik: tab per alamat, filter, tombol cek, dan laporan Excel per cabang.
 */
export async function generateMetadata({ params }: { params: Promise<{ grup: string }> }) {
  const { grup } = await params;
  const g = findMailGroup(grup);
  return { title: g ? `Email — ${g.name}` : "Email" };
}

export default async function EmailGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ grup: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ grup }, sp] = await Promise.all([params, searchParams]);

  const group = findMailGroup(grup);
  // Slug tidak dikenal: tampilkan daftar cabang yang tersedia, bukan rute
  // kosong. redirect() tidak bisa dipakai di sini karena Next.js sudah
  // mengirim status 200 begitu skeleton streaming tampil.
  if (!group) {
    const tersedia = readMailGroups();
    return (
      <div className="space-y-5">
        <PageHeader
          title="Cabang tidak ditemukan"
          description={`Tidak ada cabang dengan alamat "${grup}". Pilih salah satu di bawah.`}
        />
        <section className="overflow-hidden rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap gap-2">
            {tersedia.map((g) => (
              <Link
                key={g.slug}
                href={`/email/${g.slug}`}
                className="rounded-md px-3 py-1.5 text-[12.5px] shadow-[0_0_0_1px_var(--input)] hover:bg-muted"
              >
                {g.name}
              </Link>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const filterSemua = readParam(sp, "filter") === "semua";
  const page = Math.max(1, Number(readParam(sp, "page")) || 1);

  return (
    <EmailGroupView
      group={group}
      akunDiminta={readParam(sp, "akun") ?? ""}
      filterSemua={filterSemua}
      page={page}
    />
  );
}
