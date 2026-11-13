import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { PageHeader, StatCard } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { monthLabelId, formatDateTimeId } from "@/lib/time";
import { ReviewChecklist, type ReviewItemRow } from "@/components/monthly/review-checklist";
import { Pagination } from "@/components/orders/pagination";
import { readParam, readNumber, buildPageInfo, type SearchParams } from "@/lib/query";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

export default async function MonthlyReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireSession();

  const review = await prisma.monthlyReview.findUnique({ where: { id } });
  if (!review) notFound();

  const canCheck = session.user.role === "ADMIN" || session.user.role === "PIMPINAN";

  // Ringkasan per cabang (dipakai sebagai tab).
  const branchCounts = await prisma.reviewItem.groupBy({
    by: ["branchId"],
    where: { monthlyReviewId: id },
    _count: { _all: true },
  });
  const branches = await prisma.branch.findMany({
    where: { id: { in: branchCounts.map((b) => b.branchId) } },
    select: { id: true, branchName: true },
  });
  const branchName = new Map(branches.map((b) => [b.id, b.branchName]));

  const doneCounts = await prisma.reviewItem.groupBy({
    by: ["branchId"],
    where: { monthlyReviewId: id, reviewStatus: "DONE" },
    _count: { _all: true },
  });
  const doneByBranch = new Map(doneCounts.map((row) => [row.branchId, row._count._all]));

  const branchTabs = branchCounts
    .map((row) => ({
      id: row.branchId,
      name: branchName.get(row.branchId) ?? "Tanpa cabang",
      total: row._count._all,
      done: doneByBranch.get(row.branchId) ?? 0,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const selectedBranch = readParam(query, "branch") || branchTabs[0]?.id || "";
  const statusFilter = readParam(query, "status") || "PENDING";
  const page = readNumber(query, "page", 1);

  const itemWhere = {
    monthlyReviewId: id,
    ...(selectedBranch ? { branchId: selectedBranch } : {}),
    ...(statusFilter === "DONE"
      ? { reviewStatus: "DONE" as const }
      : statusFilter === "ALL"
        ? {}
        : { reviewStatus: "PENDING" as const }),
  };

  const [total, items, totalAll, totalDone] = await Promise.all([
    prisma.reviewItem.count({ where: itemWhere }),
    prisma.reviewItem.findMany({
      where: itemWhere,
      include: {
        order: {
          select: {
            orderNumber: true,
            customerName: true,
            productName: true,
            orderDate: true,
            deadlineDate: true,
            sourceStatus: true,
            sourceStatusCategory: true,
            monitoringStatus: true,
          },
        },
      },
      orderBy: [{ order: { orderNumber: "asc" } }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.reviewItem.count({ where: { monthlyReviewId: id } }),
    prisma.reviewItem.count({ where: { monthlyReviewId: id, reviewStatus: "DONE" } }),
  ]);

  const info = buildPageInfo(total, page, PAGE_SIZE);

  const rows: ReviewItemRow[] = items.map((item) => ({
    id: item.id,
    orderNumber: item.order.orderNumber,
    customerName: item.order.customerName,
    productName: item.order.productName,
    orderDate: item.order.orderDate.toISOString(),
    deadlineDate: item.order.deadlineDate?.toISOString() ?? null,
    sourceStatus: item.order.sourceStatus,
    sourceCategory: item.order.sourceStatusCategory,
    monitoringStatus: item.order.monitoringStatus,
    reviewStatus: item.reviewStatus,
    checkedAt: item.checkedAt?.toISOString() ?? null,
  }));

  const activeTab = branchTabs.find((tab) => tab.id === selectedBranch);
  const makeHref = (overrides: Record<string, string | number>) => {
    const next = new URLSearchParams();
    next.set("branch", selectedBranch);
    next.set("status", statusFilter);
    for (const [key, value] of Object.entries(overrides)) next.set(key, String(value));
    return `/monthly-review/${id}?${next.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Pemeriksaan ${monthLabelId(review.month, review.year)}`}
        description={`Dimulai ${formatDateTimeId(review.startedAt)} · ${totalAll} pesanan dalam daftar`}
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/monthly-review">
            <ArrowLeft className="size-4" /> Kembali
          </Link>
        </Button>
      </PageHeader>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total pesanan" value={totalAll.toLocaleString("id-ID")} />
        <StatCard label="Sudah diperiksa" value={totalDone.toLocaleString("id-ID")} tone="success" />
        <StatCard
          label="Belum diperiksa"
          value={(totalAll - totalDone).toLocaleString("id-ID")}
          tone="warning"
        />
      </section>

      {branchTabs.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {branchTabs.map((tab) => (
            <Link
              key={tab.id}
              href={`/monthly-review/${id}?branch=${tab.id}&status=${statusFilter}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                tab.id === selectedBranch
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-secondary",
              )}
            >
              {tab.name}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  tab.id === selectedBranch ? "bg-white/20" : "bg-secondary",
                )}
              >
                {tab.done}/{tab.total}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { value: "PENDING", label: "Belum diperiksa" },
          { value: "DONE", label: "Sudah diperiksa" },
          { value: "ALL", label: "Semua" },
        ].map((option) => (
          <Button
            key={option.value}
            asChild
            size="sm"
            variant={statusFilter === option.value ? "default" : "outline"}
          >
            <Link href={`/monthly-review/${id}?branch=${selectedBranch}&status=${option.value}`}>
              {option.label}
            </Link>
          </Button>
        ))}
        {activeTab ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {activeTab.name}: {activeTab.done} dari {activeTab.total} sudah diperiksa
          </span>
        ) : null}
      </div>

      {canCheck ? (
        <ReviewChecklist
          reviewId={review.id}
          branchId={selectedBranch}
          canCheck
          rows={rows}
          emptyLabel={
            statusFilter === "PENDING"
              ? "Semua pesanan pada cabang ini sudah diperiksa."
              : "Tidak ada pesanan pada filter ini."
          }
        />
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Checklist hanya dapat diubah oleh pimpinan atau administrator.
        </p>
      )}

      {total > 0 ? (
        <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
          <Pagination
            page={info.page}
            totalPages={info.totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            makeHref={(nextPage) => makeHref({ page: nextPage })}
          />
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Checklist hanya mengubah database monitoring. Status di website internal Instaprint tidak diubah.
      </p>
    </div>
  );
}
