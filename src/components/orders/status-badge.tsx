import { MonitoringStatus, SourceStatusCategory } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MONITORING_LABEL, SOURCE_CATEGORY_LABEL, monitoringBadgeClass, shortSourceStatus, sourceBadgeClass } from "@/lib/labels";

export function MonitoringBadge({
  status,
  deadline,
  className,
}: {
  status: MonitoringStatus;
  deadline?: Date | null;
  className?: string;
}) {
  return (
    <Badge className={cn("whitespace-nowrap", monitoringBadgeClass(status, deadline), className)}>
      {MONITORING_LABEL[status]}
    </Badge>
  );
}

export function SourceBadge({
  category,
  raw,
  className,
}: {
  category: SourceStatusCategory;
  raw?: string | null;
  className?: string;
}) {
  const rawLabel = raw && raw.trim() ? raw.trim() : SOURCE_CATEGORY_LABEL[category];
  const label = shortSourceStatus(raw) ?? SOURCE_CATEGORY_LABEL[category];
  return (
    <Badge
      className={cn("max-w-full whitespace-nowrap", sourceBadgeClass(category), className)}
      title={rawLabel}
    >
      {label}
    </Badge>
  );
}

export function OverdueBadge({ days }: { days: number }) {
  if (days <= 0) return null;
  return (
    <Badge className="whitespace-nowrap bg-red-50 text-red-700 ring-red-600/20">
      Terlambat {days} hari
    </Badge>
  );
}
