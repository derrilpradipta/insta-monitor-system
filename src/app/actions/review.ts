"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export type ActionResult = { ok: boolean; message: string };

/** Tandai satu notifikasi sudah dibaca. */
export async function markNotificationRead(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sesi berakhir." };

  await prisma.notification.updateMany({
    where: { id, userId: session.user.id },
    data: { isRead: true },
  });
  revalidatePath("/notifications");
  return { ok: true, message: "Notifikasi ditandai dibaca." };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sesi berakhir." };

  const result = await prisma.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  });
  revalidatePath("/notifications");
  return { ok: true, message: `${result.count} notifikasi ditandai dibaca.` };
}

/**
 * Checklist pemeriksaan bulanan (khusus pimpinan/admin).
 * Hanya mengubah database monitoring, tidak menyentuh website internal.
 */
export async function toggleReviewItem(input: {
  itemId: string;
  checked: boolean;
  notes?: string;
}): Promise<ActionResult> {
  const session = await requireRole(["ADMIN", "PIMPINAN"]);

  const item = await prisma.reviewItem.findUnique({
    where: { id: input.itemId },
    include: { order: { select: { orderNumber: true } } },
  });
  if (!item) return { ok: false, message: "Item pemeriksaan tidak ditemukan." };

  await prisma.reviewItem.update({
    where: { id: item.id },
    data: {
      reviewStatus: input.checked ? "DONE" : "PENDING",
      checkedBy: input.checked ? session.user.id : null,
      checkedAt: input.checked ? new Date() : null,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });

  if (input.checked) {
    // Konfirmasi manual pimpinan: status pemantauan menjadi selesai,
    // status sumber TIDAK diubah.
    await prisma.order.update({
      where: { id: item.orderId },
      data: {
        monitoringStatus: "SELESAI",
        monitoringStatusSource: "MANUAL",
        monitoringStatusChangedAt: new Date(),
        manualConfirmed: true,
        manualConfirmedBy: session.user.id,
        manualConfirmedAt: new Date(),
      },
    });
    await logActivity({
      userId: session.user.id,
      action: "REVIEW_CONFIRMED",
      entityType: "order",
      entityId: item.orderId,
      description: `Pemeriksaan manual pesanan ${item.order.orderNumber} dikonfirmasi selesai`,
    });
  }

  await refreshReviewCounters(item.monthlyReviewId);
  revalidatePath(`/monthly-review/${item.monthlyReviewId}`);
  return { ok: true, message: input.checked ? "Pesanan dikonfirmasi selesai." : "Konfirmasi dibatalkan." };
}

/** Pilih/batalkan semua item pada satu cabang dalam satu pemeriksaan. */
export async function bulkToggleReviewItems(input: {
  reviewId: string;
  branchId?: string;
  checked: boolean;
}): Promise<ActionResult> {
  const session = await requireRole(["ADMIN", "PIMPINAN"]);

  const items = await prisma.reviewItem.findMany({
    where: {
      monthlyReviewId: input.reviewId,
      ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(input.checked ? { reviewStatus: "PENDING" } : { reviewStatus: "DONE" }),
    },
    select: { id: true, orderId: true },
  });

  if (items.length === 0) return { ok: true, message: "Tidak ada item yang perlu diubah." };

  await prisma.$transaction([
    prisma.reviewItem.updateMany({
      where: { id: { in: items.map((i) => i.id) } },
      data: {
        reviewStatus: input.checked ? "DONE" : "PENDING",
        checkedBy: input.checked ? session.user.id : null,
        checkedAt: input.checked ? new Date() : null,
      },
    }),
    prisma.order.updateMany({
      where: { id: { in: items.map((i) => i.orderId) } },
      data: input.checked
        ? {
            monitoringStatus: "SELESAI",
            monitoringStatusSource: "MANUAL",
            monitoringStatusChangedAt: new Date(),
            manualConfirmed: true,
            manualConfirmedBy: session.user.id,
            manualConfirmedAt: new Date(),
          }
        : {
            monitoringStatus: "BELUM_SELESAI",
            monitoringStatusSource: "MANUAL",
            monitoringStatusChangedAt: new Date(),
            manualConfirmed: false,
            manualConfirmedBy: null,
            manualConfirmedAt: null,
          },
    }),
  ]);

  await logActivity({
    userId: session.user.id,
    action: input.checked ? "REVIEW_BULK_CONFIRM" : "REVIEW_BULK_RESET",
    entityType: "monthly_review",
    entityId: input.reviewId,
    description: `${items.length} pesanan ${input.checked ? "dikonfirmasi selesai" : "dibatalkan konfirmasinya"}${
      input.branchId ? ` pada cabang ${input.branchId}` : ""
    }`,
  });

  await refreshReviewCounters(input.reviewId);
  revalidatePath(`/monthly-review/${input.reviewId}`);
  return {
    ok: true,
    message: `${items.length} pesanan ${input.checked ? "dikonfirmasi selesai" : "dibatalkan konfirmasinya"}.`,
  };
}

async function refreshReviewCounters(reviewId: string) {
  const [total, done] = await Promise.all([
    prisma.reviewItem.count({ where: { monthlyReviewId: reviewId } }),
    prisma.reviewItem.count({ where: { monthlyReviewId: reviewId, reviewStatus: "DONE" } }),
  ]);
  await prisma.monthlyReview.update({
    where: { id: reviewId },
    data: { totalOrders: total, totalChecked: done, totalPending: total - done },
  });
}
