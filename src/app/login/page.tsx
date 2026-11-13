import Image from "next/image";
import { redirect } from "next/navigation";
import { BarChart3, CalendarClock, PackageCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Masuk" };

const NOTICES: Record<string, string> = {
  expired: "Sesi Anda telah berakhir karena tidak ada aktivitas. Silakan masuk kembali.",
  logout: "Anda telah keluar dari aplikasi.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/deadline");

  const { reason } = await searchParams;
  const notice = reason ? NOTICES[reason] : undefined;

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-white/95 p-1">
            <Image src="/logo-instaprint.png" alt="Instaprint" width={32} height={18} className="h-auto w-8" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Instaprint</p>
            <p className="text-xs text-sidebar-muted">Digital Printing</p>
          </div>
        </div>

        <div className="max-w-md space-y-6">
          <h1 className="text-3xl font-semibold leading-tight text-white">
            Monitoring pesanan seluruh cabang dalam satu tampilan.
          </h1>
          <p className="text-sm leading-relaxed text-sidebar-muted">
            Data pesanan diambil otomatis dari website internal Instaprint setiap hari, lalu dipantau
            status dan tenggatnya di sini.
          </p>
          <ul className="space-y-3 text-sm">
            {[
              { icon: PackageCheck, text: "Rekap pesanan masuk kemarin per cabang" },
              { icon: CalendarClock, text: "Pantau tenggat pengerjaan & pesanan terlambat" },
              { icon: BarChart3, text: "Pemeriksaan bulanan dan analisis AI" },
            ].map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-sidebar-foreground">
                <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-accent">
                  <item.icon className="size-4 text-blue-300" />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-sidebar-muted">
          © {new Date().getFullYear()} Instaprint. Sistem internal.
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image src="/logo-instaprint.png" alt="Instaprint" width={44} height={25} className="h-auto w-11" />
            <span className="text-sm font-semibold">Instaprint</span>
          </div>

          <h2 className="text-xl font-semibold tracking-tight">Masuk ke Monitoring System</h2>
          <p className="mb-7 mt-1 text-sm text-muted-foreground">
            Gunakan akun internal Instaprint untuk melanjutkan.
          </p>

          <LoginForm notice={notice} />

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Butuh bantuan akses? Hubungi administrator sistem.
          </p>
        </div>
      </section>
    </main>
  );
}
