import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buatExcelDeadline } from "@/lib/deadline-excel";
import { isValidDateString, todayWibSafe } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Export daftar pesanan pada rentang tenggat ke file .xlsx.
 * Dipakai halaman Deadline untuk dibagikan ke tim produksi.
 *
 * Query: dari, sampai (YYYY-MM-DD), branch, status, q
 *
 * Pembuatan file ada di `@/lib/deadline-excel` supaya file yang diunduh lewat
 * tombol ini IDENTIK dengan yang dikirim lewat email otomatis pagi hari.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Sesi berakhir. Silakan login ulang." }, { status: 401 });
  }

  const url = new URL(request.url);
  const today = todayWibSafe();
  const fromParam = url.searchParams.get("dari");
  const toParam = url.searchParams.get("sampai");

  const dari = fromParam && isValidDateString(fromParam) ? fromParam : today;
  const sampai = toParam && isValidDateString(toParam) ? toParam : dari;

  const { buffer, fileName } = await buatExcelDeadline({
    dari,
    sampai,
    branchId: url.searchParams.get("branch") ?? "",
    status: url.searchParams.get("status") ?? "",
    q: url.searchParams.get("q") ?? "",
  });

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
