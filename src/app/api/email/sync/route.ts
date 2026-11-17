import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runEmailSync, type EmailProgress } from "@/lib/email/sync";

export const maxDuration = 60;

/**
 * Terima dua kemungkinan secret sekaligus:
 *  - EMAIL_SYNC_SECRET, dipakai penjadwal eksternal (cron-job.org / crontab)
 *  - CRON_SECRET, nilai yang otomatis dikirim Vercel untuk path schedule
 * Kalau keduanya diisi, dua-duanya berlaku.
 */
function tokenDiterima(): string[] {
  const daftar = [process.env.EMAIL_SYNC_SECRET, process.env.CRON_SECRET];
  return daftar.filter((v): v is string => Boolean(v && v.length > 0));
}

async function authorize(request: Request): Promise<
  | { ok: true; pemicu: string | null }
  | { ok: false; response: Response }
> {
  const headerSecret = request.headers.get("x-cron-secret");
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;

  const kandidat = [headerSecret, bearer].filter((v): v is string => Boolean(v));
  const sah = tokenDiterima();
  if (sah.length > 0 && kandidat.some((v) => sah.includes(v))) {
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

/**
 * Ambil email yang belum dibaca dari mailbox, lalu simpan ke database.
 *
 * Tiga cara memanggil:
 *  1. Vercel Schedule — Vercel mengirim `Authorization: Bearer <CRON_SECRET>`.
 *  2. Penjadwal eksternal (cron-job.org / crontab) — `x-cron-secret` atau
 *     `Authorization: Bearer <EMAIL_SYNC_SECRET>`.
 *  3. Tombol "Cek sekarang" di halaman Email — cukup sesi login.
 *
 * Parameter:
 *  - `account=<alamat>` memilih satu mailbox; tanpa ini semua akun diperiksa.
 *  - `stream=1` membalas NDJSON berisi progres per tahap, dipakai tombol
 *    "Cek sekarang" supaya bilah progres mengikuti pekerjaan yang sebenarnya.
 *
 * Aman dipanggil berkali-kali: email dikunci dengan (akun, Message-ID).
 * Membaca email TIDAK menandainya sudah dibaca: hanya metadata yang diambil.
 */
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
