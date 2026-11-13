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
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Pengambilan data gagal." },
      { status: 500 },
    );
  }
}
