import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateOnlyToDb, yesterdayWib, todayWibSafe, isValidDateString } from "@/lib/time";
import { readParam, readNumber, buildPageInfo, buildQuery, type SearchParams } from "@/lib/query";
import { OrdersTable } from "@/components/orders/orders-table";
import { OrderFilters } from "@/components/orders/order-filters";
import { Pagination } from "@/components/orders/pagination";
import { DatePickerNav } from "@/components/orders/date-picker-nav";
import { PageHeader, StatStrip, EmptyState } from "@/components/shell/page-header";
import { formatDateId } from "@/lib/time";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RunScrapeButton } from "@/components/orders/run-scrape-button";

export const metadata = { title: "Orderan" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const yesterday = yesterdayWib();
  const today = todayWibSafe();
  const requested = readParam(params, "date");
  const date = isValidDateString(requested) ? requested : yesterday;
  const isYesterday = date === yesterday;
  const isToday = date === today;

  const q = (readParam(params, "q") ?? "").trim();
  const branchId = readParam(params, "branch") ?? "";
  const status = readParam(params, "status") ?? "";
  const sort = readParam(params, "sort") ?? "";
  const page = readNumber(params, "page", 1);

  const where: Prisma.OrderWhereInput = {
    orderDate: dateOnlyToDb(date),
    ...(branchId ? { branchId } : {}),
    ...(status === "BELUM_SELESAI" || status === "SELESAI" || status === "DIBATALKAN"
      ? { monitoringStatus: status }
      : {}),
    ...(status === "TERLAMBAT"
      ? { monitoringStatus: "BELUM_SELESAI", deadlineDate: { lt: dateOnlyToDb(today) } }
      : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" as const } },
            { customerName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.OrderOrderByWithRelationInput[] =
    sort === "order_asc"
      ? [{ orderDate: "asc" }, { orderNumber: "asc" }]
      : sort === "deadline_asc"
        ? [{ deadlineDate: "asc" }, { orderNumber: "asc" }]
        : sort === "deadline_desc"
          ? [{ deadlineDate: "desc" }, { orderNumber: "asc" }]
          : sort === "customer_asc"
            ? [{ customerName: "asc" }]
            : [{ orderDate: "desc" }, { sourceOrderId: "desc" }];

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
      where: { orderDate: dateOnlyToDb(date) },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["branchId"],
      where: { orderDate: dateOnlyToDb(date) },
      _count: { _all: true },
    }),
  ]);

  const branchNames = new Map(branches.map((b) => [b.id, b.branchName]));
  const totalForDate = summary.reduce((acc, item) => acc + item._count._all, 0);
  const done = summary.find((s) => s.monitoringStatus === "SELESAI")?._count._all ?? 0;
  const cancelled = summary.find((s) => s.monitoringStatus === "DIBATALKAN")?._count._all ?? 0;
  const pending = totalForDate - done - cancelled;

  const info = buildPageInfo(total, page, PAGE_SIZE);
  const dateLabel = `${formatDateId(date)}${isYesterday ? " (kemarin)" : isToday ? " (hari ini)" : ""}`;

  return (
    <div className="space-y-4">
      <PageHeader title="Orderan" description={`Pesanan dengan tanggal masuk ${dateLabel} · WIB.`}>
        <DatePickerNav
          basePath="/orders"
          defaultValue={date}
          label="Tanggal masuk"
          presets={[
            { label: "Kemarin", value: yesterday },
            { label: "Hari ini", value: today },
          ]}
        />
        <RunScrapeButton defaultDate={date} />
        <Button asChild variant="ghost" size="sm">
          <Link href={`/history?date=${date}`}>Riwayat pengambilan</Link>
        </Button>
      </PageHeader>

      <StatStrip
        items={[
          {
            label: "Total pesanan",
            value: totalForDate,
            hint: formatDateId(date),
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
            label: "Cabang aktif",
            value: byBranch.length,
            tone: "info",
            hint: byBranch
              .slice(0, 3)
              .map((b) => `${branchNames.get(b.branchId) ?? "-"} (${b._count._all})`)
              .join(" · "),
          },
        ]}
      />

      <OrderFilters
        basePath="/orders"
        lockDate={date}
        branches={branches.map((branch) => ({ value: branch.id, label: branch.branchName }))}
      />

      <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
        {orders.length === 0 ? (
          <EmptyState
            title="Belum ada pesanan untuk tanggal ini"
            description={
              totalForDate === 0
                ? `Data pesanan masuk ${formatDateId(date)} belum tersedia. Jalankan pengambilan data atau periksa riwayat proses.`
                : "Tidak ada pesanan yang cocok dengan filter yang dipilih."
            }
            action={
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/history">Lihat riwayat pengambilan</Link>
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
              makeHref={(nextPage) => `/orders${buildQuery(params, { page: nextPage })}`}
            />
          </>
        )}
      </section>
    </div>
  );
}
