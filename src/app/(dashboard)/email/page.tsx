import { redirect } from "next/navigation";
import { readMailGroups } from "@/lib/email/accounts";
import { PageHeader, EmptyState } from "@/components/shell/page-header";

export const metadata = { title: "Email" };
export const dynamic = "force-dynamic";

/**
 * Pintu masuk /email.
 *
 * Sidebar selalu menunjuk ke cabang tertentu (/email/pusat, /email/bsd, ...),
 * jadi alamat ini hanya mengarahkan ke cabang pertama. Kalau belum ada akun
 * sama sekali, tampilkan petunjuk konfigurasi.
 */
export default function EmailIndexPage() {
  const grup = readMailGroups();
  const pertama = grup[0];

  if (!pertama) {
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

  redirect(`/email/${pertama.slug}`);
}
