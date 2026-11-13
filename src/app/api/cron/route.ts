import { NextResponse } from "next/server";
import { runDailyScrape } from "@/lib/sync";
import { notifyDeadlineTomorrow, notifyOverdue, notifyStaleOrders } from "@/lib/notifications";
import { isValidDateString, wibDateString } from "@/lib/time";
import { prisma } from "@/lib/db";

export const maxDuration = 300;  // batas maksimum Vercel Hobby; Docker/VPS bisa naikkan sendiri

/**
 * Endpoint cron (dipanggil crontab VPS atau scheduler internal).
 * Auth: header `x-cron-secret` harus sama dengan CRON_SECRET.
 *
 * Contoh crontab (WIB = Asia/Jakarta):
 *   30 23 * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron?job=daily
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const url = new URL(request.url);
  const job = url.searchParams.get("job") ?? "daily";
  const dateParam = url.searchParams.get("date");
  const today = wibDateString();

  try {
    if (job === "daily") {
      const target = dateParam && isValidDateString(dateParam) ? dateParam : undefined;
      const result = await runDailyScrape(target, "cron");
      const reminders = await Promise.all([notifyDeadlineTomorrow(), notifyOverdue(), notifyStaleOrders()]);
      return NextResponse.json({ ok: true, job, logId: result.logId, result: result.result, notifications: reminders });
    }

    if (job === "reminders") {
      const sent = await Promise.all([notifyDeadlineTomorrow(), notifyOverdue(), notifyStaleOrders()]);
      return NextResponse.json({ ok: true, job, notifications: sent });
    }

    if (job === "cleanup") {
      // Hapus sesi kedaluwarsa > 7 hari dan notifikasi terbaca > 90 hari.
      const sessions = await prisma.userSession.deleteMany({
        where: { expiresAt: { lt: new Date(Date.now() - 7 * 86400_000) } },
      });
      const notifications = await prisma.notification.deleteMany({
        where: { isRead: true, createdAt: { lt: new Date(Date.now() - 90 * 86400_000) } },
      });
      return NextResponse.json({
        ok: true,
        job,
        deletedSessions: sessions.count,
        deletedNotifications: notifications.count,
        today,
      });
    }

    return NextResponse.json({ ok: false, message: `Job "${job}" tidak dikenal.` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Job gagal." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
