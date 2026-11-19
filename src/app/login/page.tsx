import Image from "next/image";
import { redirect } from "next/navigation";
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
    <main className="flex min-h-screen items-start justify-center bg-[#f2f3f4] px-3 py-6 sm:items-center sm:p-6 lg:p-8">
      <div className="w-full max-w-[1000px] rounded-[24px] bg-card p-2.5 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_32px_64px_-44px_rgb(16_24_40/0.4)] sm:rounded-[28px] sm:p-3.5">
        <div className="grid gap-0 lg:min-h-[636px] lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-2">
          <section className="flex flex-col justify-center px-2.5 py-5 sm:px-6 sm:py-7 lg:px-9 lg:py-8">
            <div className="flex items-center gap-2.5">
              <Image
                src="/logo-instaprint.png"
                alt="Instaprint"
                width={212}
                height={120}
                priority
                className="h-8 w-auto"
              />
              <span className="h-6 w-px shrink-0 bg-border" aria-hidden />
              <span className="text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.13em] text-muted-foreground">
                Monitoring
                <br />
                System
              </span>
            </div>

            <h1 className="mt-10 text-[24px] font-semibold leading-[1.2] tracking-[-0.022em] sm:text-[27px]">
              Selamat datang kembali
            </h1>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              Masuk untuk memantau pesanan, tenggat, dan status produksi seluruh cabang.
            </p>

            <div className="mt-7 space-y-3">
              <LoginForm notice={notice} />
            </div>

            <p className="mt-6 text-[11px] leading-[1.7] text-muted-foreground">
              Sesi berakhir otomatis setelah 30 menit tanpa aktivitas. Butuh bantuan? Hubungi
              administrator sistem.
            </p>
          </section>

          <aside className="relative hidden overflow-hidden rounded-[32px] lg:block">
            {/* Masker sudut cekung membungkus foto + lapisan gelap, supaya area
                yang terpotong tetap putih bersih seperti kartunya. */}
            <div className="scoop-corners absolute inset-0">
              <Image
                src="/login-hero.jpg"
                alt=""
                aria-hidden
                fill
                priority
                sizes="(min-width: 1000px) 620px, 62vw"
                className="object-cover"
              />
              <div
                className="absolute inset-0 bg-[linear-gradient(180deg,rgb(6_10_20/0.76)_0%,rgb(6_10_20/0.34)_32%,rgb(6_10_20/0.12)_58%,rgb(6_10_20/0.62)_100%)]"
                aria-hidden
              />
            </div>

            <div className="relative flex h-full flex-col justify-between px-8 py-8 xl:px-10">
              <p className="mx-auto max-w-[19rem] text-balance pt-3 text-center text-[14px] font-semibold leading-[1.55] text-white">
                Pantau setiap pesanan, tenggat, dan status produksi dalam satu tampilan.
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/75">
                Instaprint · Sistem Internal
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
