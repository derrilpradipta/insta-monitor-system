import { NextResponse } from "next/server";
import { getSession, getClientIp } from "@/lib/auth";
import { runDailyScrape } from "@/lib/sync";
import { isValidDateString, yesterdayWib } from "@/lib/time";
import { logActivity } from "@/lib/activity";

export const maxDuration = 300;

/** Jalankan pengambilan data harian secara manual (butuh login). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Sesi berakhir. Silakan login ulang." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { date?: string };
  const date = body.date && isValidDateString(body.date) ? body.date : yesterdayWib();

  try {
    const { logId, result } = await runDailyScrape(date, session.user.email);
    await logActivity({
      userId: session.user.id,
      action: "SCRAPE_MANUAL",
      entityType: "scraping_log",
      entityId: logId,
      description: `Pengambilan data manual untuk ${date}: ${result.created} baru, ${result.updated} diperbarui`,
      ipAddress: await getClientIp(),
    });
    return NextResponse.json({ ok: true, logId, result });
  } catch (error) {
    // Jangan bocorkan dump argumen Chromium ke pengguna. Ambil baris pertama saja.
    const raw = error instanceof Error ? error.message : "Pengambilan data gagal.";
    const firstLine = raw.split("\n")[0].slice(0, 200);
    const friendly = /spawn|ENOENT|Failed to launch/i.test(raw)
      ? "Browser untuk pengambilan data tidak bisa dijalankan di server ini. Jalankan pengambilan data dari PC/VPS."
      : firstLine;
    return NextResponse.json({ ok: false, message: friendly }, { status: 500 });
  }
}
