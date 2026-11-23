import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { hashToken, requireSession } from "@/lib/auth";
import { formatNumber } from "@/lib/labels";

export type SearchParams = Record<string, string | string[] | undefined>;

export function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function readNumber(params: SearchParams, key: string, fallback: number): number {
  const raw = readParam(params, key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export type PageInfo = { page: number; pageSize: number; total: number; totalPages: number };

export function buildPageInfo(total: number, page: number, pageSize: number): PageInfo {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { page: Math.min(page, totalPages), pageSize, total, totalPages };
}

export function buildQuery(base: SearchParams, overrides: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.append(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    params.delete(key);
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Jumlah notifikasi belum dibaca milik pengguna aktif. */
export async function getUnreadCount(): Promise<number> {
  const cookieStore = await cookies();
  const token = cookieStore.get("ipms_session")?.value;
  if (!token) return 0;
  const session = await prisma.userSession.findUnique({
    where: { sessionTokenHash: hashToken(token) },
    select: { userId: true },
  });
  if (!session) return 0;
  return prisma.notification.count({ where: { userId: session.userId, isRead: false } });
}

/** Ringkasan untuk header: nama pengguna + jumlah notifikasi. */
export async function getShellData() {
  const session = await requireSession();
  const unread = await prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  });
  return { session, unread };
}

export { formatNumber };

/**
 * Jumlah email belum dibaca per CABANG (bukan per alamat).
 *
 * Sidebar menampilkan satu angka di menu Email dan satu angka per cabang, jadi
 * yang dibutuhkan adalah total per grup. Dihitung sekali per request.
 */
export async function getEmailUnreadByGroup(): Promise<{ slug: string; name: string; unread: number }[]> {
  const { readMailGroups } = await import("@/lib/email/accounts");
  const groups = readMailGroups();
  if (groups.length === 0) return [];

  const semuaEmail = groups.flatMap((g) => g.accounts.map((a) => a.email));
  const rows = await prisma.emailMessage.groupBy({
    by: ["accountEmail"],
    where: { isRead: false, isInternal: false, accountEmail: { in: semuaEmail } },
    _count: { _all: true },
  });

  const perEmail = new Map(rows.map((r) => [r.accountEmail, r._count._all]));

  return groups.map((g) => ({
    slug: g.slug,
    name: g.name,
    unread: g.accounts.reduce((n, a) => n + (perEmail.get(a.email) ?? 0), 0),
  }));
}
