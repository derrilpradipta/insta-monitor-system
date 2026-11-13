import { prisma } from "@/lib/db";
import { dateOnlyToDb, diffDays, wibDateString, yesterdayWib } from "@/lib/time";

export type OperationalSnapshot = {
  generatedAt: string;
  today: string;
  totalOrdersStored: number;
  yesterdayIncoming: number;
  yesterdayDone: number;
  yesterdayPending: number;
  deadlineTomorrow: number;
  overdue: number;
  staleOrders: number;
  branches: {
    name: string;
    incomingYesterday: number;
    done: number;
    pending: number;
    overdue: number;
    avgSpeedDays: number | null;
  }[];
  monthlyTrend: { month: string; total: number; done: number; overdue: number }[];
  topLateProducts: { product: string; lateCount: number }[];
};

/** Susun ringkasan operasional dari database (angka nyata, bukan estimasi). */
export async function buildOperationalSnapshot(): Promise<OperationalSnapshot> {
  const today = wibDateString();
  const yesterday = yesterdayWib();
  const yesterdayDate = dateOnlyToDb(yesterday);
  const tomorrow = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

  const [
    totalOrdersStored,
    yesterdayOrders,
    deadlineTomorrowCount,
    overdueCount,
    staleCount,
    branches,
    monthlyTrend,
    lateProducts,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.findMany({
      where: { orderDate: yesterdayDate },
      select: {
        monitoringStatus: true,
        branchId: true,
        deadlineDate: true,
        lastScrapedAt: true,
      },
    }),
    prisma.order.count({
      where: { deadlineDate: dateOnlyToDb(tomorrow), monitoringStatus: "BELUM_SELESAI" },
    }),
    prisma.order.count({ where: { monitoringStatus: "BELUM_SELESAI", deadlineDate: { lt: dateOnlyToDb(today) } } }),
    prisma.order.count({
      where: { monitoringStatus: "BELUM_SELESAI", lastScrapedAt: { lt: new Date(Date.now() - 3 * 86400_000) } },
    }),
    prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, branchName: true },
      orderBy: { branchName: "asc" },
    }),
    prisma.$queryRaw<{ month: string; total: bigint; done: bigint; overdue: bigint }[]>`
      SELECT to_char(order_date, 'YYYY-MM') AS month,
             COUNT(*)::bigint AS total,
             COUNT(*) FILTER (WHERE monitoring_status = 'SELESAI')::bigint AS done,
             COUNT(*) FILTER (WHERE monitoring_status = 'BELUM_SELESAI' AND deadline_date < CURRENT_DATE)::bigint AS overdue
      FROM orders
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 6
    `,
    prisma.$queryRaw<{ product_name: string; late_count: bigint }[]>`
      SELECT product_name, COUNT(*)::bigint AS late_count
      FROM orders
      WHERE monitoring_status = 'BELUM_SELESAI'
        AND deadline_date < CURRENT_DATE
        AND product_name NOT IN ('-', 'Download', 'Setujui Tolak')
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 5
    `,
  ]);

  const branchStats = branches.map((branch) => {
    const orders = yesterdayOrders.filter((order) => order.branchId === branch.id);
    const done = orders.filter((order) => order.monitoringStatus === "SELESAI").length;
    const pending = orders.filter((order) => order.monitoringStatus === "BELUM_SELESAI").length;
    const overdue = orders.filter(
      (order) =>
        order.monitoringStatus === "BELUM_SELESAI" &&
        order.deadlineDate &&
        order.deadlineDate.toISOString().slice(0, 10) < today,
    ).length;
    return {
      name: branch.branchName,
      incomingYesterday: orders.length,
      done,
      pending,
      overdue,
      avgSpeedDays: null as number | null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    today,
    totalOrdersStored,
    yesterdayIncoming: yesterdayOrders.length,
    yesterdayDone: yesterdayOrders.filter((o) => o.monitoringStatus === "SELESAI").length,
    yesterdayPending: yesterdayOrders.filter((o) => o.monitoringStatus === "BELUM_SELESAI").length,
    deadlineTomorrow: deadlineTomorrowCount,
    overdue: overdueCount,
    staleOrders: staleCount,
    branches: branchStats,
    monthlyTrend: monthlyTrend
      .map((row) => ({
        month: row.month,
        total: Number(row.total),
        done: Number(row.done),
        overdue: Number(row.overdue),
      }))
      .reverse(),
    topLateProducts: lateProducts.map((row) => ({
      product: row.product_name.slice(0, 80),
      lateCount: Number(row.late_count),
    })),
  };
}

/** Selisih hari untuk pesanan (dipakai di komponen server lain). */
export { diffDays };
