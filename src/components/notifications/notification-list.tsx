"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/review";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type: string;
  priority: string;
  isRead: boolean;
  relatedUrl: string | null;
  createdAt: string;
  createdAtLabel: string;
  priorityLabel: string;
  priorityClass: string;
};

export function NotificationList({
  notifications,
  unread,
}: {
  notifications: NotificationItem[];
  unread: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const markOne = (id: string) => {
    setBusyId(id);
    startTransition(async () => {
      await markNotificationRead(id);
      setBusyId(null);
      router.refresh();
    });
  };

  const markAll = () => {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {unread > 0 ? (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={markAll} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
            Tandai semua dibaca
          </Button>
        </div>
      ) : null}

      <ul className="space-y-2">
        {notifications.map((item) => (
          <li
            key={item.id}
            className={cn(
              "rounded-xl border bg-card p-4 shadow-sm transition-colors",
              item.isRead ? "border-border" : "border-primary/30 bg-blue-50/40",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {!item.isRead ? (
                    <span className="inline-flex size-2 shrink-0 rounded-full bg-primary" aria-label="Belum dibaca" />
                  ) : null}
                  <p className={cn("text-sm", item.isRead ? "font-medium" : "font-semibold")}>{item.title}</p>
                  <Badge className={item.priorityClass}>{item.priorityLabel}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{item.message}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">{item.createdAtLabel} WIB</p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {item.relatedUrl ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={item.relatedUrl}>
                      Buka <ExternalLink className="size-3.5" />
                    </Link>
                  </Button>
                ) : null}
                {!item.isRead ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => markOne(item.id)}
                    disabled={busyId === item.id}
                  >
                    {busyId === item.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    Tandai dibaca
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
