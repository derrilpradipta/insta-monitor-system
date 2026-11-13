import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runMonthlyReview } from "@/lib/sync";
import { logActivity } from "@/lib/activity";

export const maxDuration = 900;

/** Jalankan pemeriksaan bulanan (butuh login). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Sesi berakhir." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { year?: number; month?: number };
  const now = new Date(Date.now() + 7 * 3600_000);
  const year = Number(body.year) || now.getUTCFullYear();
  const month = Number(body.month) || now.getUTCMonth() + 1;

  if (month < 1 || month > 12) {
    return NextResponse.json({ ok: false, message: "Bulan tidak valid." }, { status: 400 });
  }

  try {
    const result = await runMonthlyReview({ year, month, createdBy: session.user.id });
    await logActivity({
      userId: session.user.id,
      action: "MONTHLY_REVIEW_RUN",
      entityType: "monthly_review",
      entityId: result.reviewId,
      description: `Pemeriksaan bulanan ${month}/${year}: ${result.totalOrders} pesanan`,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Pemeriksaan gagal." },
      { status: 500 },
    );
  }
}
