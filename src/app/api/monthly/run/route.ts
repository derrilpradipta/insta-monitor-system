import { NextResponse } from "next/server";
import { guardApi, ditolak } from "@/lib/api-guard";
import { runMonthlyReview } from "@/lib/sync";
import { logActivity } from "@/lib/activity";

export const maxDuration = 300;  // batas maksimum Vercel Hobby; Docker/VPS bisa naikkan sendiri

/** Jalankan pemeriksaan bulanan (butuh login). */
export async function POST(request: Request) {
  const session = await guardApi(["ADMIN", "PIMPINAN"]);
  if (ditolak(session)) return session;

  const body = (await request.json().catch(() => ({}))) as { year?: number; month?: number };
  const now = new Date(Date.now() + 7 * 3600_000);
  const year = Number(body.year) || now.getUTCFullYear();
  const month = Number(body.month) || now.getUTCMonth() + 1;

  if (month < 1 || month > 12) {
    return NextResponse.json({ ok: false, message: "Bulan tidak valid." }, { status: 400 });
  }

  // Pemeriksaan bulanan butuh 685–1352 detik (terukur), sementara batas fungsi
  // Vercel Hobby 300 detik. Menjalankannya di sini hanya akan terpotong di
  // tengah jalan, jadi ditolak lebih awal dengan pesan yang jelas.
  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Pemeriksaan bulanan tidak bisa dijalankan di Vercel (butuh lebih dari 5 menit). Jalankan dari PC/VPS yang menyala 24 jam.",
      },
      { status: 503 },
    );
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
    console.error("[monthly/run] gagal:", error);
    return NextResponse.json(
      { ok: false, message: "Terjadi kesalahan pada server. Silakan coba lagi." },
      { status: 500 },
    );
  }
}
