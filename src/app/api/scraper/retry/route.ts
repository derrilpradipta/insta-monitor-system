import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { runDailyScrape, runMonthlyReview, syncActiveOrderStatuses } from "@/lib/sync";
import { logActivity } from "@/lib/activity";

export const maxDuration = 600;

/** Jalankan ulang proses yang gagal. Aman dijalankan ulang (upsert). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Sesi berakhir." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { logId?: string };
  if (!body.logId) {
    return NextResponse.json({ ok: false, message: "logId wajib diisi." }, { status: 400 });
  }

  const log = await prisma.scrapingLog.findUnique({ where: { id: body.logId } });
  if (!log) {
    return NextResponse.json({ ok: false, message: "Proses tidak ditemukan." }, { status: 404 });
  }
  if (log.status === "RUNNING") {
    return NextResponse.json({ ok: false, message: "Proses masih berjalan." }, { status: 409 });
  }

  try {
    let newLogId = log.id;

    if (log.processType === "DAILY_SCRAPE") {
      const date = log.targetDate?.toISOString().slice(0, 10);
      if (!date) {
        return NextResponse.json({ ok: false, message: "Tanggal target tidak tersedia." }, { status: 400 });
      }
      const result = await runDailyScrape(date, session.user.email);
      newLogId = result.logId;
    } else if (log.processType === "STATUS_SYNC") {
      const result = await syncActiveOrderStatuses(session.user.email);
      newLogId = result.logId;
    } else {
      const detail = (log.detail ?? {}) as { startDate?: string };
      const date = detail.startDate ?? log.targetDate?.toISOString().slice(0, 10) ?? "";
      const [year, month] = date.split("-").map(Number);
      if (!year || !month) {
        return NextResponse.json({ ok: false, message: "Periode proses tidak diketahui." }, { status: 400 });
      }
      const result = await runMonthlyReview({ year, month, createdBy: session.user.id });
      newLogId = result.logId;
    }

    await logActivity({
      userId: session.user.id,
      action: "SCRAPE_RETRY",
      entityType: "scraping_log",
      entityId: newLogId,
      description: `Menjalankan ulang proses ${log.processType} (sebelumnya ${log.id})`,
    });

    return NextResponse.json({ ok: true, logId: newLogId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Gagal menjalankan ulang." },
      { status: 500 },
    );
  }
}
