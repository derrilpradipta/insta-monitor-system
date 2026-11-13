import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateOnlyToDb, formatDateId, tomorrowWib, todayWibSafe, isValidDateString } from "@/lib/time";
import { readParam, readNumber, buildPageInfo, buildQuery, type SearchParams } from "@/lib/query";
import { OrdersTable } from "@/components/orders/orders-table";
import { OrderFilters } from "@/components/orders/order-filters";
import { Pagination } from "@/components/orders/pagination";
import { DatePickerNav } from "@/components/orders/date-picker-nav";
import { PageHeader, StatStrip, EmptyState } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Deadline" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function DeadlinePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const today = todayWibSafe();
  const defaultDate = today;
  const requested = readParam(params, "date");
  const date = isValidDateString(requested) ? requested : defaultDate;

  const q = (readParam(params, "q") ?? "").trim();
  const branchId = readParam(params, "branch") ?? "";
  const status = readParam(params, "status") ?? "";
  const sort = readParam(params, "sort") ?? "";
  const page = readNumber(params, "page", 1);

  const deadlineFilter = dateOnlyToDb(date);
  // Mode khusus: tampilkan semua pesanan yang belum punya tenggat di sumber.
  const isNoDeadline = status === "TANPA_TENGGAT";

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
        deadlineDate: status === "TERLAMBAT" ? { lt: dateOnlyToDb(today) } : deadlineFilter,
        ...(status === "BELUM_SELESAI" || status === "SELESAI" || status === "DIBATALKAN"
          ? { monitoringStatus: status }
          : {}),
        ...(status === "TERLAMBAT" ? { monitoringStatus: "BELUM_SELESAI" } : {}),
      };

  // Ringkasan mengikuti lingkup tanggal (atau lingkup "tanpa tenggat").
  const scopeWhere: Prisma.OrderWhereInput = isNoDeadline
    ? { deadlineDate: null }
    : { deadlineDate: deadlineFilter };

  const orderBy: Prisma.OrderOrderByWithRelationInput[] =
    sort === "order_asc"
      ? [{ orderDate: "asc" }]
      : sort === "customer_asc"
        ? [{ customerName: "asc" }]
        : sort === "deadline_desc"
          ? [{ deadlineDate: "desc" }, { orderNumber: "asc" }]
          : [{ orderDate: "desc" }, { orderNumber: "asc" }];

  const [total, orders, branches, summary, byBranch] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: { branch: { select: { id: true, branchName: true } } },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { branchName: "asc" } }),
    prisma.order.groupBy({
      by: ["monitoringStatus"],
      where: scopeWhere,
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["branchId"],
      where: scopeWhere,
      _count: { _all: true },
    }),
  ]);

  // Pesanan terlambat: tenggat sebelum tanggal terpilih dan belum selesai.
  const overdue = await prisma.order.count({
    where: {
      monitoringStatus: "BELUM_SELESAI",
      deadlineDate: { lt: deadlineFilter },
    },
  });

  // Jumlah pesanan tanpa tenggat (di seluruh database) untuk pintasan filter.
  const noDeadlineCount = await prisma.order.count({ where: { deadlineDate: null } });

  const branchNames = new Map(branches.map((b) => [b.id, b.branchName]));
  const totalForDate = summary.reduce((acc, item) => acc + item._count._all, 0);
  const done = summary.find((s) => s.monitoringStatus === "SELESAI")?._count._all ?? 0;
  const cancelled = summary.find((s) => s.monitoringStatus === "DIBATALKAN")?._count._all ?? 0;
  const pending = totalForDate - done - cancelled;
  const info = buildPageInfo(total, page, PAGE_SIZE);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Deadline"
        description={
          isNoDeadline
            ? `Pesanan tanpa tenggat di sumber (${noDeadlineCount} pesanan, seluruh tanggal).`
            : `Pesanan dengan tenggat ${formatDateId(date)}${date === today ? " (hari ini)" : date === tomorrowWib() ? " (besok)" : ""}.`
        }
      >
        {isNoDeadline ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/deadline?date=${today}`}>Kembali ke tanggal</Link>
          </Button>
        ) : (
          <DatePickerNav
            basePath="/deadline"
            defaultValue={date}
            label="Tanggal tenggat"
            presets={[
              { label: "Hari ini", value: today },
              { label: "Besok", value: tomorrowWib() },
            ]}
          />
        )}
        <Button asChild variant={isNoDeadline ? "default" : "outline"} size="sm">
          <Link href="/deadline?status=TANPA_TENGGAT">
            Tanpa tenggat{noDeadlineCount ? ` (${noDeadlineCount})` : ""}
          </Link>
        </Button>
      </PageHeader>

      <StatStrip
        items={[
          {
            label: isNoDeadline ? "Total tanpa tenggat" : "Total pada tanggal ini",
            value: totalForDate,
            hint: isNoDeadline ? "Seluruh tanggal masuk" : formatDateId(date),
          },
          {
            label: "Selesai",
            value: done,
            tone: "success",
            hint: totalForDate ? `${Math.round((done / totalForDate) * 100)}% dari total` : "Belum ada yang selesai",
          },
          {
            label: "Belum selesai",
            value: pending,
            tone: "warning",
            hint: cancelled ? `${cancelled} dibatalkan` : "Menunggu pengerjaan",
          },
          {
            label: "Terlambat (total)",
            value: overdue,
            tone: "danger",
            hint: "Lewat tenggat & belum selesai",
          },
        ]}
      />

      {byBranch.length ? (
        <section className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Per cabang
          </span>
          {byBranch.map((item) => (
            <span
              key={item.branchId}
              className="inline-flex items-center gap-1.5 rounded-md bg-card px-2.5 py-1 text-[12px] shadow-[var(--shadow-border)]"
            >
              <span className="font-medium text-foreground">{branchNames.get(item.branchId) ?? "—"}</span>
              <span className="rounded bg-secondary px-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {item._count._all}
              </span>
            </span>
          ))}
        </section>
      ) : null}

      <OrderFilters
        basePath="/deadline"
        lockDate={date}
        branches={branches.map((branch) => ({ value: branch.id, label: branch.branchName }))}
        extraStatusOptions={[{ value: "TANPA_TENGGAT", label: `Tanpa tenggat (${noDeadlineCount})` }]}
      />

      <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
        {orders.length === 0 ? (
          <EmptyState
            title={isNoDeadline ? "Semua pesanan sudah punya tenggat" : "Tidak ada pesanan dengan tenggat ini"}
            description={
              isNoDeadline
                ? "Tidak ada pesanan tanpa tenggat di database."
                : `Belum ada pesanan tersimpan yang tenggatnya ${formatDateId(date)}. Pilih tanggal lain atau jalankan pengambilan data.`
            }
            action={
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href={`/deadline?date=${today}`}>Kembali ke hari ini</Link>
              </Button>
            }
          />
        ) : (
          <>
            <OrdersTable orders={orders} />
            <Pagination
              page={info.page}
              totalPages={info.totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              makeHref={(nextPage) =>
                `/deadline${buildQuery(params, isNoDeadline ? { page: nextPage } : { page: nextPage, date })}`
              }
            />
          </>
        )}
      </section>
    </div>
  );
}
