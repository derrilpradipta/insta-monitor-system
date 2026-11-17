import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runEmailSync, type EmailProgress } from "@/lib/email/sync";

export const maxDuration = 60;

/**
 * Ambil email yang belum dibaca dari mailbox, lalu simpan ke database.
 *
 * Dua cara memanggil:
 *  1. Penjadwal (cron-job.org / crontab VPS) — header
 *     `Authorization: Bearer <EMAIL_SYNC_SECRET>` atau `x-cron-secret`.
 *     Kalau EMAIL_SYNC_SECRET kosong, dipakai CRON_SECRET.
 *  2. Tombol "Cek sekarang" di halaman Email — cukup sesi login.
 *
 * Parameter:
 *  - `account=<alamat>` memilih satu mailbox; tanpa ini semua akun diperiksa.
 *  - `stream=1` membalas NDJSON berisi progres per tahap, dipakai tombol
 *    "Cek sekarang" supaya bilah progres mengikuti pekerjaan yang sebenarnya.
 *
 * Membaca email TIDAK menandainya sudah dibaca: hanya metadata yang diambil.
 */
async function authorize(request: Request): Promise<
  | { ok: true; pemicu: string | null }
  | { ok: false; response: Response }
> {
  const secret = process.env.EMAIL_SYNC_SECRET ?? process.env.CRON_SECRET ?? "";
  const headerSecret = request.headers.get("x-cron-secret");
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;

  if (secret && (headerSecret === secret || bearer === secret)) {
    return { ok: true, pemicu: "penjadwal" };
  }

  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 }),
    };
  }

  return { ok: true, pemicu: session.user.email };
}

function pesanUntuk(error: unknown): { message: string; status: number } {
  const pesan = error instanceof Error ? error.message : String(error);
  const belumDiatur = /Kredensial email belum diatur|belum dikonfigurasi/i.test(pesan);
  return {
    message: belumDiatur
      ? "Kredensial email belum diatur di server."
      : "Terjadi kesalahan pada server. Silakan coba lagi.",
    status: belumDiatur ? 503 : 500,
  };
}

async function handle(request: Request) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const account = (url.searchParams.get("account") ?? "").trim() || null;
  const stream = url.searchParams.get("stream") === "1";

  if (!stream) {
    try {
      const { results, errors } = await runEmailSync(auth.pemicu, account);

      if (results.length === 0 && errors.length > 0) {
        console.error("[email/sync] semua akun gagal:", errors);
        const { message, status } = pesanUntuk(new Error(errors[0]?.message ?? ""));
        return NextResponse.json({ ok: false, message, errors }, { status });
      }

      return NextResponse.json({ ok: true, results, errors });
    } catch (error) {
      console.error("[email/sync] gagal:", error);
      const { message, status } = pesanUntuk(error);
      return NextResponse.json({ ok: false, message }, { status });
    }
  }

  // Mode streaming: satu objek JSON per baris, dikirim sambil proses berjalan.
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          // Klien menutup koneksi; biarkan proses selesai agar data tetap
          // tersimpan dan tercatat di riwayat.
          closed = true;
        }
      };

      try {
        const onProgress = (info: EmailProgress) => send({ type: "progress", ...info });
        const { results, errors } = await runEmailSync(auth.pemicu, account, onProgress);

        if (results.length === 0 && errors.length > 0) {
          console.error("[email/sync] semua akun gagal:", errors);
          send({ type: "error", ok: false, ...pesanUntuk(new Error(errors[0]?.message ?? "")) });
          return;
        }

        send({ type: "done", ok: true, results, errors });
      } catch (error) {
        console.error("[email/sync] gagal:", error);
        send({ type: "error", ok: false, ...pesanUntuk(error) });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            // Sudah tertutup.
          }
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
