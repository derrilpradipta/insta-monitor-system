import { NextResponse } from "next/server";
import { guardApi, ditolak } from "@/lib/api-guard";
import { runReplySync } from "@/lib/email/reply-sync";

// Plafon Vercel Hobby + Fluid = 300 detik. Empat mailbox butuh ~25 detik
// setelah dijalankan paralel, tapi beri ruang untuk jendela 90 hari.
export const maxDuration = 300;

/**
 * Hitung ulang statistik waktu balas dari Gmail.
 *
 * Hanya ADMIN dan PIMPINAN yang boleh memicu — ini pekerjaan berat (membaca
 * dua folder untuk setiap mailbox) dan hasilnya dipakai untuk menilai kinerja
 * tim, jadi jangan biarkan peran baca-saja memicu beban itu.
 *
 * `?hari=` membatasi jendela pengambilan (7 / 30 / 90). Bawaannya 30.
 */
export async function POST(request: Request) {
  const tolak = guardApi(["ADMIN", "PIMPINAN"]);
  const sesi = await tolak;
  if (ditolak(sesi)) return sesi;

  const url = new URL(request.url);
  const mentah = Number(url.searchParams.get("hari") ?? "30");
  const hari = mentah === 7 || mentah === 90 ? mentah : 30;

  try {
    const { results, errors } = await runReplySync(null, hari);

    if (results.length === 0 && errors.length > 0) {
      console.error("[email/waktu-balas] semua akun gagal:", errors);
      return NextResponse.json(
        { ok: false, message: "Terjadi kesalahan pada server. Silakan coba lagi." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, results, errors });
  } catch (error) {
    // Detail teknis hanya ke log server; pengguna melihat kalimat umum.
    console.error("[email/waktu-balas] gagal:", error);
    const pesan = error instanceof Error ? error.message : String(error);
    const belumDiatur = /Kredensial email belum diatur|belum dikonfigurasi/i.test(pesan);
    return NextResponse.json(
      {
        ok: false,
        message: belumDiatur
          ? "Kredensial email belum diatur di server."
          : "Terjadi kesalahan pada server. Silakan coba lagi.",
      },
      { status: belumDiatur ? 503 : 500 },
    );
  }
}
