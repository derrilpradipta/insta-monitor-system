import { NextResponse } from "next/server";
import { guardApi, ditolak } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { kirimLaporanDeadline, penerimaLaporan } from "@/lib/email/deadline-report";
import { isValidDateString, todayWibSafe } from "@/lib/time";

export const maxDuration = 300;

/** Secret penjadwal: sama seperti sync email (CRON_SECRET atau DEADLINE_REPORT_SECRET). */
function tokenDiterima(): string[] {
  const daftar = [process.env.DEADLINE_REPORT_SECRET, process.env.CRON_SECRET];
  return daftar.filter((v): v is string => Boolean(v && v.length > 0));
}

async function authorize(request: Request): Promise<
  { ok: true; pemicu: string } | { ok: false; response: Response }
> {
  const headerSecret = request.headers.get("x-cron-secret");
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;

  const kandidat = [headerSecret, bearer].filter((v): v is string => Boolean(v));
  const sah = tokenDiterima();
  if (sah.length > 0 && kandidat.some((v) => sah.includes(v))) {
    return { ok: true, pemicu: "penjadwal" };
  }

  const sesi = await guardApi(["ADMIN", "PIMPINAN"]);
  if (ditolak(sesi)) return { ok: false, response: sesi };

  return { ok: true, pemicu: sesi.user.email };
}

/**
 * Kirim laporan deadline hari itu lewat email.
 *
 * Dipanggil oleh:
 *  - penjadwal pagi (Vercel Schedules / cron internal) dengan secret
 *  - tombol "Kirim sekarang" di halaman Deadline oleh ADMIN/PIMPINAN
 *
 * `?tanggal=YYYY-MM-DD` untuk mengirim tanggal tertentu (uji coba).
 */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const tanggalParam = url.searchParams.get("tanggal");
  const tanggal = tanggalParam && isValidDateString(tanggalParam) ? tanggalParam : todayWibSafe();
  // Penjadwal tidak boleh mengirim ulang; tombol di halaman memang boleh
  // (pengguna menekannya dengan sadar untuk mengirim ulang).
  const paksa = auth.pemicu !== "penjadwal";

  if (penerimaLaporan().length === 0) {
    return NextResponse.json(
      { ok: false, message: "Alamat tujuan laporan belum diatur di server." },
      { status: 503 },
    );
  }

  try {
    const hasil = await kirimLaporanDeadline({ tanggal, triggeredBy: auth.pemicu, paksa });
    return NextResponse.json({ ok: true, ...hasil });
  } catch (error) {
    // Detail teknis hanya ke log; pengguna melihat kalimat umum.
    console.error("[deadline-report] gagal:", error);
    return NextResponse.json(
      { ok: false, message: "Laporan gagal dikirim. Silakan coba lagi." },
      { status: 500 },
    );
  }
}

/**
 * Riwayat pengiriman terakhir, untuk memastikan penjadwal benar-benar jalan.
 *
 * Dibaca dari `scraping_logs` dengan jenis DEADLINE_REPORT — sama seperti yang
 * tampil di halaman Riwayat Pengambilan, jadi tidak ada dua sumber kebenaran.
 */
export async function GET(request: Request) {
  const sesi = await guardApi(["ADMIN", "PIMPINAN"]);
  if (ditolak(sesi)) return sesi;

  const url = new URL(request.url);
  const batas = Math.min(Number(url.searchParams.get("batas") ?? "20") || 20, 100);

  const baris = await prisma.scrapingLog.findMany({
    where: { processType: "DEADLINE_REPORT" },
    orderBy: { startedAt: "desc" },
    take: batas,
    select: {
      id: true,
      status: true,
      targetDate: true,
      totalFound: true,
      errorMessage: true,
      triggeredBy: true,
      startedAt: true,
      finishedAt: true,
      detail: true,
    },
  });

  const riwayat = baris.map((b) => {
    const d = (b.detail ?? {}) as Record<string, unknown>;
    return {
      id: b.id,
      reportDate: String(d.reportDate ?? b.targetDate?.toISOString().slice(0, 10) ?? ""),
      fromEmail: String(d.fromEmail ?? ""),
      toEmails: String(d.toEmails ?? ""),
      status: b.status,
      orderCount: b.totalFound,
      fileName: String(d.fileName ?? ""),
      errorMessage: b.errorMessage,
      triggeredBy: b.triggeredBy,
      startedAt: b.startedAt,
      finishedAt: b.finishedAt,
    };
  });

  return NextResponse.json({ ok: true, riwayat });
}
