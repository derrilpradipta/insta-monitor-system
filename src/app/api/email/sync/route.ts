import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runEmailSync } from "@/lib/email/sync";

export const maxDuration = 60;

/**
 * Ambil email yang belum dibaca dari mailbox, lalu simpan ke database.
 *
 * Dua cara memanggil:
 *  1. Penjadwal (cron-job.org / crontab VPS) — pakai header
 *     `Authorization: Bearer <EMAIL_SYNC_SECRET>` atau `x-cron-secret`.
 *     Kalau EMAIL_SYNC_SECRET belum diisi, dipakai CRON_SECRET.
 *  2. Tombol "Cek sekarang" di halaman Email — cukup sesi login.
 *
 * Membaca email TIDAK menandainya sudah dibaca (imapflow memakai BODY.PEEK[]).
 */
async function handle(request: Request) {
  const secret = process.env.EMAIL_SYNC_SECRET ?? process.env.CRON_SECRET ?? "";
  const headerSecret = request.headers.get("x-cron-secret");
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;

  const lewatSecret = Boolean(secret) && (headerSecret === secret || bearer === secret);

  let pemicu: string | null = null;
  if (lewatSecret) {
    pemicu = "penjadwal";
  } else {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
    }
    pemicu = session.user.email;
  }

  try {
    const hasil = await runEmailSync(pemicu);
    return NextResponse.json({ ok: true, ...hasil });
  } catch (error) {
    // Detail teknis hanya ke log server; pengguna cukup lihat pesan umum.
    console.error("[email/sync] gagal:", error);

    const pesan = error instanceof Error ? error.message : "";
    const belumDiatur = /MAIL_IMAP_USER|MAIL_IMAP_PASSWORD|Kredensial email belum diatur/i.test(pesan);

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

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
