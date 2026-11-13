import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Role, User } from "@prisma/client";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "ipms_session";
const SESSION_IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES ?? 30);
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const TOUCH_INTERVAL_MS = 60 * 1000;

export type SessionUser = Pick<
  User,
  "id" | "name" | "email" | "role" | "lastLoginAt" | "createdAt"
>;

export type SessionPayload = {
  sessionId: string;
  user: SessionUser;
  lastActivityAt: Date;
  expiresAt: Date;
};

export type AuthFailure = {
  ok: false;
  code: "INVALID_CREDENTIALS" | "INACTIVE" | "LOCKED" | "RATE_LIMITED";
  message: string;
  lockedUntil?: Date;
};

export type AuthSuccess = { ok: true; user: SessionUser };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Ambil IP klien dari header proxy (Vercel/nginx) atau fallback. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function getUserAgent(): Promise<string> {
  const h = await headers();
  return h.get("user-agent")?.slice(0, 255) ?? "unknown";
}

/**
 * Login dengan email ATAU username. Username dianggap sama dengan bagian
 * sebelum '@' pada email.
 */
export async function authenticate(
  identifier: string,
  password: string,
): Promise<AuthSuccess | AuthFailure> {
  const id = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: id },
        { email: { startsWith: `${id}@` } },
      ],
    },
  });

  // Tetap jalankan bcrypt pada hash dummy agar waktu respons serupa
  // ketika akun tidak ditemukan (mencegah user enumeration).
  if (!user) {
    await bcrypt.compare(password, "$2a$12$C6UzMDM.H6dfI/f/IKcEe.0C9W1l5a.1e9b5kJz2bV8YQm8o6r6Wq");
    return { ok: false, code: "INVALID_CREDENTIALS", message: "Email/username atau password salah." };
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return {
      ok: false,
      code: "LOCKED",
      message: `Akun terkunci sementara. Coba lagi setelah ${LOCK_MINUTES} menit.`,
      lockedUntil: user.lockedUntil,
    };
  }

  if (!user.isActive) {
    return { ok: false, code: "INACTIVE", message: "Akun tidak aktif. Hubungi administrator." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    const shouldLock = failed >= MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: shouldLock ? 0 : failed,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
      },
    });
    if (shouldLock) {
      return {
        ok: false,
        code: "LOCKED",
        message: `Terlalu banyak percobaan gagal. Akun dikunci ${LOCK_MINUTES} menit.`,
        lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
      };
    }
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: `Email/username atau password salah. Sisa percobaan: ${MAX_FAILED_LOGINS - failed}.`,
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  return {
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      lastLoginAt: new Date(),
      createdAt: user.createdAt,
    },
  };
}

/**
 * Buat sesi baru. Session fixation protection: token selalu baru, dan sesi
 * lain milik perangkat yang sama tidak dipakai ulang.
 */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_IDLE_MINUTES * 60 * 1000);

  await prisma.userSession.create({
    data: {
      userId,
      sessionTokenHash: hashToken(token),
      lastActivityAt: new Date(now),
      expiresAt,
      ipAddress: await getClientIp(),
      userAgent: await getUserAgent(),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_IDLE_MINUTES * 60,
  });

  return token;
}

/** Baca sesi dari cookie dan validasi ke database (server-side). */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.userSession.findUnique({
    where: { sessionTokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.revokedAt || !session.user.isActive) return null;

  const now = Date.now();
  const idleDeadline = session.lastActivityAt.getTime() + SESSION_IDLE_MINUTES * 60 * 1000;
  if (now > session.expiresAt.getTime() || now > idleDeadline) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  // Perbarui waktu aktivitas (throttled agar tidak menulis di setiap request).
  if (now - session.lastActivityAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: {
        lastActivityAt: new Date(now),
        expiresAt: new Date(now + SESSION_IDLE_MINUTES * 60 * 1000),
      },
    });
  }

  return {
    sessionId: session.id,
    lastActivityAt: new Date(now),
    expiresAt: new Date(now + SESSION_IDLE_MINUTES * 60 * 1000),
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
      lastLoginAt: session.user.lastLoginAt,
      createdAt: session.user.createdAt,
    },
  };
}

/** Wajib login. Redirect ke halaman login jika sesi tidak valid. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login?reason=expired");
  return session;
}

/** Wajib memiliki salah satu peran. */
export async function requireRole(roles: Role[]): Promise<SessionPayload> {
  const session = await requireSession();
  if (!roles.includes(session.user.role)) redirect("/orders?denied=1");
  return session;
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.userSession.updateMany({
      where: { sessionTokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Cabut semua sesi lain milik user (dipakai setelah ganti password). */
export async function revokeOtherSessions(userId: string, keepSessionId?: string): Promise<number> {
  const result = await prisma.userSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(keepSessionId ? { id: { not: keepSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export function isTokenMatch(a: string, b: string): boolean {
  return safeEqual(a, b);
}

export function sessionIdleMinutes(): number {
  return SESSION_IDLE_MINUTES;
}
