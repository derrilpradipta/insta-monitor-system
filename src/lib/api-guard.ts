import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/auth";
import type { Role } from "@prisma/client";

/**
 * Penjaga rute API: wajib login, dan opsional wajib salah satu peran.
 *
 * Dipakai rute yang mengubah data (scraping, impor ceklis, pemeriksaan
 * bulanan), supaya STAFF tidak bisa memicu pekerjaan berat atau menimpa
 * status pesanan. Rute yang hanya membaca (export) cukup mewajibkan login.
 *
 * Mengembalikan `Response` bila ditolak, atau `SessionPayload` bila lolos.
 */
export async function guardApi(roles?: Role[]): Promise<SessionPayload | Response> {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Sesi berakhir. Silakan login ulang." },
      { status: 401 },
    );
  }

  if (roles && roles.length > 0 && !roles.includes(session.user.role)) {
    return NextResponse.json(
      { ok: false, message: "Anda tidak punya izin untuk tindakan ini." },
      { status: 403 },
    );
  }

  return session;
}

/** True bila hasil guardApi adalah penolakan (bukan sesi). */
export function ditolak(hasil: SessionPayload | Response): hasil is Response {
  return hasil instanceof Response;
}
