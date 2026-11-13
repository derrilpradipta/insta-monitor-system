import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { BellOff } from "lucide-react";
import { PRIORITY_LABEL, priorityClass } from "@/lib/labels";
import { formatDateTimeId } from "@/lib/time";
import { NotificationList } from "@/components/notifications/notification-list";

export const metadata = { title: "Notifikasi" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireSession();
  const { filter } = await searchParams;
  const onlyUnread = filter === "unread";

  const [notifications, unread, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id, ...(onlyUnread ? { isRead: false } : {}) },
      orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.notification.count({ where: { userId: session.user.id, isRead: false } }),
    prisma.notification.count({ where: { userId: session.user.id } }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pusat Notifikasi"
        description={`${unread} belum dibaca dari ${total} notifikasi.`}
      >
        <div className="flex gap-1.5">
          <Button asChild size="sm" variant={onlyUnread ? "outline" : "default"}>
            <Link href="/notifications">Semua</Link>
          </Button>
          <Button asChild size="sm" variant={onlyUnread ? "default" : "outline"}>
            <Link href="/notifications?filter=unread">Belum dibaca</Link>
          </Button>
        </div>
      </PageHeader>

      {notifications.length === 0 ? (
        <EmptyState
          title={onlyUnread ? "Semua notifikasi sudah dibaca" : "Belum ada notifikasi"}
          description="Notifikasi pengambilan data, tenggat, dan pemeriksaan bulanan akan muncul di sini."
          action={
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/deadline">
                <BellOff className="size-4" /> Kembali ke orderan
              </Link>
            </Button>
          }
        />
      ) : (
        <NotificationList
          notifications={notifications.map((item) => ({
            id: item.id,
            title: item.title,
            message: item.message,
            type: item.type,
            priority: item.priority,
            isRead: item.isRead,
            relatedUrl: item.relatedUrl,
            createdAt: item.createdAt.toISOString(),
            createdAtLabel: formatDateTimeId(item.createdAt),
            priorityLabel: PRIORITY_LABEL[item.priority],
            priorityClass: priorityClass(item.priority),
          }))}
          unread={unread}
        />
      )}
    </div>
  );
}
