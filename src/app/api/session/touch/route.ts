import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { hashToken, getSession, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Dipanggil berkala oleh klien saat pengguna aktif, agar waktu aktivitas
 * terakhir di server ikut diperbarui (sesi 30 menit idle).
 */
export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });

  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  await prisma.userSession.update({
    where: { sessionTokenHash: hashToken(token) },
    data: {
      lastActivityAt: new Date(),
      expiresAt: new Date(Date.now() + Number(process.env.SESSION_IDLE_MINUTES ?? 30) * 60 * 1000),
    },
  });

  return NextResponse.json({ ok: true });
}
