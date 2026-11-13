"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2, RotateCcw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonitoringBadge, SourceBadge } from "@/components/orders/status-badge";
import { formatDateId } from "@/lib/time";
import { bulkToggleReviewItems, toggleReviewItem } from "@/app/actions/review";
import { cn } from "@/lib/utils";
import type { MonitoringStatus, SourceStatusCategory } from "@prisma/client";

export type ReviewItemRow = {
  id: string;
  orderNumber: string;
  customerName: string;
  productName: string;
  orderDate: string;
  deadlineDate: string | null;
  sourceStatus: string;
  sourceCategory: string;
  monitoringStatus: string;
  reviewStatus: string;
  checkedAt: string | null;
};

export function ReviewChecklist({
  reviewId,
  branchId,
  canCheck,
  rows,
  emptyLabel,
}: {
  reviewId: string;
  branchId: string;
  canCheck: boolean;
  rows: ReviewItemRow[];
  emptyLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const isChecked = (row: ReviewItemRow) => optimistic[row.id] ?? row.reviewStatus === "DONE";

  const toggle = (row: ReviewItemRow) => {
    const next = !isChecked(row);
    setOptimistic((prev) => ({ ...prev, [row.id]: next }));
    setBusyId(row.id);
    startTransition(async () => {
      const result = await toggleReviewItem({ itemId: row.id, checked: next });
      setBusyId(null);
      if (!result.ok) {
        setMessage(result.message);
        setOptimistic((prev) => ({ ...prev, [row.id]: !next }));
        return;
      }
      setMessage(null);
      router.refresh();
    });
  };

  const bulk = (checked: boolean) => {
    startTransition(async () => {
      const result = await bulkToggleReviewItems({ reviewId, branchId, checked });
      setMessage(result.message);
      setOptimistic({});
      router.refresh();
    });
  };

  return (
    <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Menampilkan <span className="font-semibold text-foreground">{rows.length}</span> pesanan
          {message ? <span className="ml-2 text-xs">· {message}</span> : null}
        </p>
        <div className="flex items-center gap-1.5">
          {pending ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Menyimpan…
            </span>
          ) : null}
          {canCheck ? (
            <>
              <Button size="sm" variant="outline" disabled={pending || rows.length === 0} onClick={() => bulk(true)}>
                <CheckCheck className="size-3.5" /> Pilih semua di halaman ini
              </Button>
              <Button size="sm" variant="ghost" disabled={pending || rows.length === 0} onClick={() => bulk(false)}>
                <RotateCcw className="size-3.5" /> Batal pilih
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {canCheck ? <TableHead className="w-[4%]" /> : null}
              <TableHead className="w-[12%]">No. pesanan</TableHead>
              <TableHead className="w-[20%]">Pelanggan</TableHead>
              <TableHead className="w-[22%]">Produk</TableHead>
              <TableHead className="w-[9%]">Masuk</TableHead>
              <TableHead className="w-[9%]">Tenggat</TableHead>
              <TableHead className="w-[12%]">Status sumber</TableHead>
              <TableHead className="w-[12%]">Pemantauan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const checked = isChecked(row);
              return (
                <TableRow key={row.id} className={cn(checked && "bg-emerald-50/40")}>
                  {canCheck ? (
                    <TableCell>
                      <Checkbox
                        checked={checked}
                        disabled={pending && busyId === row.id}
                        onCheckedChange={() => toggle(row)}
                        aria-label={`Konfirmasi ${row.orderNumber}`}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="font-medium">{row.orderNumber}</TableCell>
                  <TableCell>
                    <p className="truncate" title={row.customerName}>
                      {row.customerName}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="truncate text-sm text-muted-foreground" title={row.productName}>
                      {row.productName}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDateId(row.orderDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDateId(row.deadlineDate)}
                  </TableCell>
                  <TableCell>
                    <SourceBadge category={row.sourceCategory as SourceStatusCategory} raw={row.sourceStatus} />
                  </TableCell>
                  <TableCell>
                    <MonitoringBadge
                      status={row.monitoringStatus as MonitoringStatus}
                      deadline={row.deadlineDate ? new Date(row.deadlineDate) : null}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
