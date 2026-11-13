import Link from "next/link";
import type { Branch, MonitoringStatus, Order, SourceStatusCategory } from "@prisma/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonitoringBadge, SourceBadge } from "@/components/orders/status-badge";
import { diffDays, formatDateId, wibDateString } from "@/lib/time";

export type OrderRow = Order & {
  branch: Pick<Branch, "id" | "branchName">;
};

export function OrdersTable({
  orders,
  showOrderDate = true,
}: {
  orders: OrderRow[];
  showOrderDate?: boolean;
}) {
  const today = wibDateString();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[10%]">No. pesanan</TableHead>
          <TableHead className="w-[17%]">Pelanggan</TableHead>
          <TableHead className="w-[11%]">Cabang</TableHead>
          <TableHead className="w-[16%]">Produk</TableHead>
          {showOrderDate ? <TableHead className="w-[8%]">Masuk</TableHead> : null}
          <TableHead className="w-[9%]">Tenggat</TableHead>
          <TableHead className="w-[17%]">Status sumber</TableHead>
          <TableHead className="w-[12%]">Pemantauan</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const deadlineStr = order.deadlineDate ? order.deadlineDate.toISOString().slice(0, 10) : null;
          const lateDays =
            deadlineStr && order.monitoringStatus === "BELUM_SELESAI" ? diffDays(deadlineStr, today) : 0;

          return (
            <TableRow key={order.id}>
              <TableCell className="align-top">
                <span className="block truncate font-medium text-foreground" title={order.orderNumber}>
                  {order.orderNumber}
                </span>
                {order.sourceUrl ? (
                  <Link
                    href={order.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-[10.5px] text-slate-500 underline-offset-2 transition-colors hover:text-primary hover:underline group-hover:text-primary"
                  >
                    buka di sumber
                  </Link>
                ) : null}
              </TableCell>
              <TableCell className="align-top">
                <p className="truncate font-medium text-foreground" title={order.customerName}>
                  {order.customerName}
                </p>
                {order.customerPhone ? (
                  <p className="truncate text-[11px] text-muted-foreground">{order.customerPhone}</p>
                ) : null}
              </TableCell>
              <TableCell className="align-top">
                <p className="truncate text-sm text-muted-foreground" title={order.branch.branchName}>
                  {order.branch.branchName}
                </p>
              </TableCell>
              <TableCell className="align-top">
                <p className="truncate text-sm text-muted-foreground" title={order.productName}>
                  {order.productName}
                </p>
              </TableCell>
              {showOrderDate ? (
                <TableCell className="whitespace-nowrap align-top text-sm text-muted-foreground">
                  {formatDateId(order.orderDate)}
                </TableCell>
              ) : null}
              <TableCell className="align-top">
                <span
                  className={
                    lateDays > 0
                      ? "block whitespace-nowrap text-sm font-medium text-red-600"
                      : order.deadlineDate
                        ? "block whitespace-nowrap text-sm text-muted-foreground"
                        : "block whitespace-nowrap text-sm italic text-muted-foreground/70"
                  }
                >
                  {order.deadlineDate ? formatDateId(order.deadlineDate) : "Tanpa tenggat"}
                </span>
                {lateDays > 0 ? (
                  <span className="block text-[11px] text-red-500">telat {lateDays} hari</span>
                ) : null}
              </TableCell>
              <TableCell className="overflow-hidden align-top">
                <SourceBadge
                  category={order.sourceStatusCategory as SourceStatusCategory}
                  raw={order.sourceStatus}
                />
              </TableCell>
              <TableCell className="overflow-hidden align-top">
                <span
                  className="inline-flex"
                  title={
                    order.monitoringStatus === "SELESAI"
                      ? "Sudah selesai"
                      : order.monitoringStatus === "DIBATALKAN"
                        ? "Dibatalkan"
                        : lateDays > 0
                          ? `Belum selesai dan sudah lewat tenggat ${lateDays} hari`
                          : "Belum selesai, tenggat belum lewat"
                  }
                >
                  <MonitoringBadge
                    status={order.monitoringStatus as MonitoringStatus}
                    deadline={order.deadlineDate}
                  />
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
