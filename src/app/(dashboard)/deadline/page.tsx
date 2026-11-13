import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  dateOnlyToDb,
  formatDateId,
  monthLabelId,
  monthRangeWib,
  shiftDateString,
  tomorrowWib,
  todayWibSafe,
  isValidDateString,
  isValidMonthString,
} from "@/lib/time";
import { readParam, readNumber, buildPageInfo, buildQuery, type SearchParams } from "@/lib/query";
import { OrdersTable } from "@/components/orders/orders-table";
import { OrderFilters } from "@/components/orders/order-filters";
import { Pagination } from "@/components/orders/pagination";
import { DeadlineRangeNav, type DeadlineMode } from "@/components/orders/deadline-range-nav";
import { PageHeader, EmptyState } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { ChecklistUploadButton } from "@/components/orders/checklist-upload-button";

export const metadata = { title: "Deadline" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function DeadlinePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const today = todayWibSafe();
  const tomorrow = tomorrowWib();

  // ---- mode: satu tanggal / rentang / satu bulan ----
  const rawMode = readParam(params, "mode");
  const mode: DeadlineMode = rawMode === "rentang" || rawMode === "bulan" ? rawMode : "hari";

  const rawDate = readParam(params, "date");
  const date = rawDate && isValidDateString(rawDate) ? rawDate : today;

  const rawFrom = readParam(params, "dari");
  const rawTo = readParam(params, "sampai");
  const from = rawFrom && isValidDateString(rawFrom) ? rawFrom : today;
  const to = rawTo && isValidDateString(rawTo) ? rawTo : shiftDateString(from, 7);

  const rawMonth = readParam(params, "bulan");
  const month = rawMonth && isValidMonthString(rawMonth) ? rawMonth : today.slice(0, 7);
  const [monthYear, monthNumber] = month.split("-").map(Number) as [number, number];
  const monthBounds = monthRangeWib(monthYear, monthNumber);

  // Rentang efektif selalu [start, endExclusive)
  let start: Date;
  let endExclusive: Date;
  let rangeLabel: string;
  let rangeStartStr: string;
  let rangeEndStr: string;

  if (mode === "rentang") {
    const [a, b] = from <= to ? [from, to] : [to, from];
    start = dateOnlyToDb(a);
    endExclusive = dateOnlyToDb(b);
    endExclusive = new Date(endExclusive.getTime());
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    rangeStartStr = a;
    rangeEndStr = b;
    rangeLabel = a === b ? formatDateId(a) : `${formatDateId(a)} – ${formatDateId(b)}`;
  } else if (mode === "bulan") {
    start = monthBounds.start;
    endExclusive = monthBounds.end;
    rangeStartStr = monthBounds.start.toISOString().slice(0, 10);
    rangeEndStr = monthBounds.last;
    rangeLabel = monthLabelId(monthNumber, monthYear);
  } else {
    start = dateOnlyToDb(date);
    endExclusive = dateOnlyToDb(date);
    endExclusive = new Date(endExclusive.getTime());
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    rangeStartStr = date;
    rangeEndStr = date;
    rangeLabel = formatDateId(date);
  }

  const isSingleDay = mode === "hari";
  const q = (readParam(params, "q") ?? "").trim();
  const branchId = readParam(params, "branch") ?? "";
  const status = readParam(params, "status") ?? "";
  const sort = readParam(params, "sort") ?? "";
  const page = readNumber(params, "page", 1);

  // Mode khusus: semua pesanan yang belum punya tenggat di sumber.
  const isNoDeadline = status === "TANPA_TENGGAT";

  const deadlineScope: Prisma.OrderWhereInput = { deadlineDate: { gte: start, lt: endExclusive } };

  const sharedWhere: Prisma.OrderWhereInput = {
    ...(branchId ? { branchId } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" as const } },
            { customerName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const where: Prisma.OrderWhereInput = isNoDeadline
    ? { ...sharedWhere, deadlineDate: null }
    : {
        ...sharedWhere,
        ...deadlineScope,
        ...(status === "BELUM_SELESAI" || status === "SELESAI" || status === "DIBATALKAN"
          ? { monitoringStatus: status }
          : {}),
        ...(status === "TERLAMBAT" ? { monitoringStatus: "BELUM_SELESAI" } : {}),
      };

  const scopeWhere: Prisma.OrderWhereInput = isNoDeadline ? { deadlineDate: null } : deadlineScope;

  const orderBy: Prisma.OrderOrderByWithRelationInput[] =
    sort === "order_asc"
      ? [{ orderDate: "asc" }]
      : sort === "customer_asc"
        ? [{ customerName: "asc" }]
        : sort === "deadline_desc"
          ? [{ deadlineDate: "desc" }, { orderNumber: "asc" }]
          : [{ deadlineDate: "asc" }, { orderNumber: "asc" }];

  const [total, orders, branches, byBranch, noDeadlineCount] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: { branch: { select: { id: true, branchName: true } } },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { branchName: "asc" } }),
    prisma.order.groupBy({ by: ["branchId"], where: scopeWhere, _count: { _all: true } }),
    prisma.order.count({ where: { deadlineDate: null } }),
  ]);

  // Total pada lingkup tanggal terpilih
  const totalInScope = byBranch.reduce((acc, item) => acc + item._count._all, 0);
  const hasFilter = Boolean(branchId || q || status);
  const branchNames = new Map(branches.map((b) => [b.id, b.branchName]));
  const info = buildPageInfo(total, page, PAGE_SIZE);

  // Parameter export Excel mengikuti filter yang sedang aktif
  const exportQuery = new URLSearchParams();
  if (isNoDeadline) {
    exportQuery.set("status", "TANPA_TENGGAT");
  } else {
    exportQuery.set("dari", rangeStartStr);
    exportQuery.set("sampai", rangeEndStr);
    if (status) exportQuery.set("status", status);
  }
  if (branchId) exportQuery.set("branch", branchId);
  if (q) exportQuery.set("q", q);

  const description = isNoDeadline
    ? `Pesanan tanpa tenggat di sumber (${noDeadlineCount} pesanan, seluruh tanggal).`
    : mode === "bulan"
      ? `Pesanan dengan tenggat bulan ${rangeLabel}.`
      : isSingleDay
        ? `Pesanan dengan tenggat ${rangeLabel}${date === today ? " (hari ini)" : date === tomorrow ? " (besok)" : ""}.`
        : `Pesanan dengan tenggat ${rangeLabel}.`;

  // Angka besar harus jujur: bila ada filter aktif, tampilkan jumlah hasil filter,
  // bukan total lingkup tanggal — kalau tidak, "66" di atas tabel berisi 2 baris
  // terbaca seperti data yang salah.
  const totalLabel = hasFilter
    ? "Hasil filter"
    : isNoDeadline
      ? "Total tanpa tenggat"
      : mode === "bulan"
        ? "Total bulan ini"
        : isSingleDay
          ? "Total pada tanggal ini"
          : "Total pada rentang ini";

  const totalValue = hasFilter ? total : totalInScope;

  const totalHint = hasFilter
    ? `${total.toLocaleString("id-ID")} dari ${totalInScope.toLocaleString("id-ID")} pesanan${isNoDeadline ? "" : ` · ${rangeLabel}`}`
    : isNoDeadline
      ? "Seluruh tanggal masuk"
      : rangeLabel;

  return (
    <div className="space-y-4">
      <PageHeader title="Deadline" description={description}>
        {isNoDeadline ? (
          <Button asChild variant="outline">
            <Link href={`/deadline?date=${today}`}>Kembali ke tanggal</Link>
          </Button>
        ) : (
          <DeadlineRangeNav
            mode={mode}
            date={date}
            from={from}
            to={to}
            month={month}
            today={today}
            tomorrow={tomorrow}
          />
        )}
        <Button asChild variant="outline">
          <Link href="/deadline?status=TANPA_TENGGAT">
            Tanpa tenggat{noDeadlineCount ? ` (${noDeadlineCount})` : ""}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button asChild>
            <a href={`/api/export/deadline?${exportQuery.toString()}`}>
              <Download className="size-4" />
              Export Excel
            </a>
          </Button>
          <ChecklistUploadButton />
        </div>
      </PageHeader>

      {/* Satu angka besar: total pada lingkup terpilih */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-card px-5 py-4 shadow-[var(--shadow-card)]">
        <div>
          <p className="label-eyebrow">{totalLabel}</p>
          <p className="mt-1 text-[46px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-foreground">
            {totalValue.toLocaleString("id-ID")}
          </p>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">{totalHint}</p>
        </div>

        {byBranch.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Per cabang
            </span>
            {byBranch.map((item) => (
              <span
                key={item.branchId}
                className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-[12px]"
              >
                <span className="font-medium text-foreground">{branchNames.get(item.branchId) ?? "—"}</span>
                <span className="rounded bg-card px-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {item._count._all}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <OrderFilters
        basePath="/deadline"
        lockDate={isNoDeadline ? undefined : date}
        branches={branches.map((branch) => ({ value: branch.id, label: branch.branchName }))}
        statusOptions={[
          { value: "BELUM_SELESAI", label: "Belum selesai" },
          { value: "SELESAI", label: "Sudah selesai (dicentang)" },
          { value: "TANPA_TENGGAT", label: `Tanpa tenggat (${noDeadlineCount})` },
        ]}
      />

      <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
        {orders.length === 0 ? (
          <EmptyState
            title={isNoDeadline ? "Semua pesanan sudah punya tenggat" : "Tidak ada pesanan pada lingkup ini"}
            description={
              isNoDeadline
                ? "Tidak ada pesanan tanpa tenggat di database."
                : `Belum ada pesanan tersimpan dengan tenggat ${rangeLabel}. Pilih rentang lain atau jalankan pengambilan data.`
            }
            action={
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href={`/deadline?date=${today}`}>Kembali ke hari ini</Link>
              </Button>
            }
          />
        ) : (
          <>
            <OrdersTable orders={orders} showMonitoring={false} />
            <Pagination
              page={info.page}
              totalPages={info.totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              makeHref={(nextPage) => `/deadline${buildQuery(params, { page: nextPage })}`}
            />
          </>
        )}
      </section>
    </div>
  );
}
