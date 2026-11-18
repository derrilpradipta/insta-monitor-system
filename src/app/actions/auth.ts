"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import {
  checkPasswordStrength,
  authenticate,
  createSession,
  destroyCurrentSession,
  getSession,
  hashPassword,
  verifyPassword,
  revokeOtherSessions,
  getClientIp,
} from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export type LoginState = { error?: string };

// Pembatasan percobaan login per IP: hanya KEGAGALAN yang dihitung,
// dan hitungan direset setelah login berhasil.
const ipAttempts = new Map<string, { count: number; resetAt: number }>();
const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_MAX_ATTEMPTS = 20;

function isIpBlocked(ip: string): boolean {
  const entry = ipAttempts.get(ip);
  if (!entry) return false;
  return entry.resetAt > Date.now() && entry.count >= IP_MAX_ATTEMPTS;
}

function recordFailure(ip: string) {
  const now = Date.now();
  const entry = ipAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function clearFailures(ip: string) {
  ipAttempts.delete(ip);
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    return { error: "Email/username dan password wajib diisi." };
  }

  const ip = await getClientIp();
  if (isIpBlocked(ip)) {
    return { error: "Terlalu banyak percobaan login dari perangkat ini. Coba lagi beberapa menit lagi." };
  }

  const result = await authenticate(identifier, password);

  if (!result.ok) {
    recordFailure(ip);
    await logActivity({
      action: "LOGIN_FAILED",
      entityType: "user",
      description: `Percobaan login gagal untuk "${identifier}" (${result.code})`,
      ipAddress: ip,
    });
    return { error: result.message };
  }

  // Session fixation: sesi lama (jika ada) dicabut, token baru selalu dibuat.
  clearFailures(ip);
  await destroyCurrentSession();
  await createSession(result.user.id);

  await logActivity({
    userId: result.user.id,
    action: "LOGIN",
    entityType: "user",
    entityId: result.user.id,
    description: `Login berhasil sebagai ${result.user.role}`,
    ipAddress: ip,
  });

  redirect("/deadline");
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await logActivity({
      userId: session.user.id,
      action: "LOGOUT",
      entityType: "user",
      entityId: session.user.id,
      description: "Keluar dari aplikasi",
    });
  }
  await destroyCurrentSession();
  redirect("/login?reason=logout");
}

export type PasswordState = { error?: string; success?: string };

export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const session = await getSession();
  if (!session) return { error: "Sesi berakhir. Silakan login ulang." };

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!current || !next || !confirm) return { error: "Semua kolom wajib diisi." };
  const kuat = checkPasswordStrength(next, { email: session.user.email, name: session.user.name });
  if (!kuat.ok) return { error: kuat.message };
  if (next !== confirm) return { error: "Konfirmasi password tidak sama." };
  if (next === current) return { error: "Password baru harus berbeda dari password lama." };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "Pengguna tidak ditemukan." };

  const valid = await verifyPassword(current, user.passwordHash);
  if (!valid) return { error: "Password lama salah. Perubahan ditolak." };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next) },
  });

  // Cabut sesi lain setelah password berubah.
  const revoked = await revokeOtherSessions(user.id, session.sessionId);

  await logActivity({
    userId: user.id,
    action: "PASSWORD_CHANGED",
    entityType: "user",
    entityId: user.id,
    description: `Password diubah; ${revoked} sesi lain dicabut`,
    ipAddress: await getClientIp(),
  });

  revalidatePath("/profile");
  return { success: `Password berhasil diubah. ${revoked > 0 ? `${revoked} sesi lain telah dikeluarkan.` : ""}`.trim() };
}

export async function touchSessionAction(): Promise<{ ok: boolean }> {
  const h = await headers();
  void h;
  const session = await getSession();
  return { ok: Boolean(session) };
}
