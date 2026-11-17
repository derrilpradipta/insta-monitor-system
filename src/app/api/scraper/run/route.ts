import { NextResponse } from "next/server";
import { getSession, getClientIp } from "@/lib/auth";
import { runDailyScrape } from "@/lib/sync";
import { isValidDateString, yesterdayWib } from "@/lib/time";
import { logActivity } from "@/lib/activity";

export const maxDuration = 300;

/**
 * Jalankan pengambilan data harian secara manual (butuh login).
 *
 * Balasannya berupa NDJSON (satu objek JSON per baris) yang dikirim sambil
 * proses berjalan, bukan satu respons di akhir. Dengan begitu bilah progres di
 * browser mengikuti pekerjaan yang benar-benar sedang terjadi:
 *
 *   {"type":"progress","stage":"login"}
 *   {"type":"progress","stage":"list","page":2,"rows":50,"total":120}
 *   {"type":"progress","stage":"detail","done":45,"total":120}
 *   {"type":"progress","stage":"save"}
 *   {"type":"done","logId":"...","result":{...}}
 *   {"type":"error","message":"..."}
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Sesi berakhir. Silakan login ulang." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { date?: string };
  const date = body.date && isValidDateString(body.date) ? body.date : yesterdayWib();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          // Klien sudah menutup koneksi; hentikan penulisan tapi biarkan proses
          // scraping selesai supaya data tetap tersimpan dan tercatat di log.
          closed = true;
        }
      };

      try {
        const { logId, result } = await runDailyScrape(date, session.user.email, (progress) => {
          send({ type: "progress", ...progress });
        });

        await logActivity({
          userId: session.user.id,
          action: "SCRAPE_MANUAL",
          entityType: "scraping_log",
          entityId: logId,
          description: `Pengambilan data manual untuk ${date}: ${result.created} baru, ${result.updated} diperbarui`,
          ipAddress: await getClientIp(),
        });

        send({ type: "done", ok: true, logId, result });
      } catch (error) {
        // Detail teknis hanya masuk log server; pengguna cukup melihat pesan umum.
        console.error("[scraper/run] gagal:", error);
        send({ type: "error", ok: false, message: "Terjadi kesalahan pada server. Silakan coba lagi." });
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

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
