import {
  NotificationPriority,
  NotificationType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { tomorrowWib, wibDateString, dateOnlyToDb } from "@/lib/time";

export type NotificationInput = {
  userId?: string | null;
  title: string;
  message: string;
  type: NotificationType;
  priority?: NotificationPriority;
  relatedUrl?: string | null;
  dedupeKey?: string | null;
};

const ADMIN_ROLES = ["ADMIN", "PIMPINAN"] as const;

/**
 * Kirim notifikasi ke seluruh administrator/pimpinan.
 * dedupeKey membuat notifikasi yang sama tidak dibuat berulang
 * (misal cron berjalan dua kali dalam satu hari).
 */
export async function notifyAdmins(input: Omit<NotificationInput, "userId">): Promise<number> {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: [...ADMIN_ROLES] } },
    select: { id: true },
  });

  if (users.length === 0) return 0;

  const rows: Prisma.NotificationCreateManyInput[] = users.map((user) => ({
    userId: user.id,
    title: input.title,
    message: input.message,
    type: input.type,
    priority: input.priority ?? "NORMAL",
    relatedUrl: input.relatedUrl ?? null,
    dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${user.id}` : null,
  }));

  const result = await prisma.notification.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

export async function notifyUser(input: NotificationInput & { userId: string }): Promise<void> {
  await prisma.notification.upsert({
    where: { dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${input.userId}` : `__no_dedupe_${Date.now()}` },
    create: {
      userId: input.userId,
      title: input.title,
      message: input.message,
      type: input.type,
      priority: input.priority ?? "NORMAL",
      relatedUrl: input.relatedUrl ?? null,
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${input.userId}` : null,
    },
    update: {},
  }).catch(async () => {
    // dedupeKey null tidak bisa di-upsert; fallback ke create.
    await prisma.notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type,
        priority: input.priority ?? "NORMAL",
        relatedUrl: input.relatedUrl ?? null,
      },
    });
  });
}

/** Notifikasi pesanan yang tenggatnya besok (sekali per hari per pesanan). */
export async function notifyDeadlineTomorrow(): Promise<number> {
  const tomorrow = tomorrowWib();
  const orders = await prisma.order.findMany({
    where: {
      deadlineDate: dateOnlyToDb(tomorrow),
      monitoringStatus: "BELUM_SELESAI",
    },
    select: { id: true, orderNumber: true, customerName: true, branch: { select: { branchName: true } } },
    take: 200,
  });

  let sent = 0;
  for (const order of orders) {
    sent += await notifyAdmins({
      title: "Tenggat besok",
      message: `${order.orderNumber} — ${order.customerName} (${order.branch.branchName}) harus selesai besok, ${tomorrow}.`,
      type: "DEADLINE_TOMORROW",
      priority: "HIGH",
      relatedUrl: `/deadline?date=${tomorrow}&q=${encodeURIComponent(order.orderNumber)}`,
      dedupeKey: `deadline-tomorrow:${order.id}:${tomorrow}`,
    });
  }
  return sent;
}

/** Notifikasi pesanan yang sudah melewati tenggat dan belum selesai. */
export async function notifyOverdue(): Promise<number> {
  const today = wibDateString();
  const orders = await prisma.order.findMany({
    where: {
      deadlineDate: { lt: dateOnlyToDb(today) },
      monitoringStatus: "BELUM_SELESAI",
    },
    select: { id: true, orderNumber: true, customerName: true, deadlineDate: true, branch: { select: { branchName: true } } },
    take: 200,
  });

  let sent = 0;
  for (const order of orders) {
    const deadline = order.deadlineDate?.toISOString().slice(0, 10) ?? "-";
    sent += await notifyAdmins({
      title: "Pesanan terlambat",
      message: `${order.orderNumber} — ${order.customerName} (${order.branch.branchName}) melewati tenggat ${deadline}.`,
      type: "ORDER_OVERDUE",
      priority: "URGENT",
      relatedUrl: `/deadline?date=${deadline}&q=${encodeURIComponent(order.orderNumber)}`,
      dedupeKey: `overdue:${order.id}:${today}`,
    });
  }
  return sent;
}

/** Notifikasi pesanan yang lama tidak diperbarui dari sumber (> 3 hari). */
export async function notifyStaleOrders(): Promise<number> {
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: {
      monitoringStatus: "BELUM_SELESAI",
      lastScrapedAt: { lt: cutoff },
    },
    select: { id: true, orderNumber: true, lastScrapedAt: true },
    take: 50,
  });

  if (orders.length === 0) return 0;

  const today = wibDateString();
  return notifyAdmins({
    title: "Pesanan lama tidak diperbarui",
    message: `${orders.length} pesanan belum diperbarui dari website sumber lebih dari 3 hari. Contoh: ${orders
      .slice(0, 3)
      .map((o) => o.orderNumber)
      .join(", ")}.`,
    type: "STALE_ORDER",
    priority: "NORMAL",
    relatedUrl: "/deadline?status=BELUM_SELESAI",
    dedupeKey: `stale-orders:${today}`,
  });
}
