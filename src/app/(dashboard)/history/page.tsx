import Link from "next/link";
import { prisma } from "@/lib/db";
import { readNumber, buildPageInfo, buildQuery, type SearchParams, readParam } from "@/lib/query";
import { PageHeader, EmptyState } from "@/components/shell/page-header";
import { Pagination } from "@/components/orders/pagination";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PROCESS_STATUS_LABEL, PROCESS_TYPE_LABEL, formatNumber, processStatusClass } from "@/lib/labels";
import { formatDateTimeId } from "@/lib/time";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Riwayat Pengambilan Data" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const page = readNumber(params, "page", 1);
  const type = readParam(params, "type") ?? "";

  const where = type ? { processType: type as never } : {};

  const [total, logs] = await Promise.all([
    prisma.scrapingLog.count({ where }),
    prisma.scrapingLog.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const info = buildPageInfo(total, page, PAGE_SIZE);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Riwayat Pengambilan Data"
        description="Catatan setiap proses pengambilan data, sinkronisasi status, dan pemeriksaan bulanan."
      >
        <div className="flex flex-wrap gap-1.5">
          {[
            { value: "", label: "Semua" },
            { value: "DAILY_SCRAPE", label: "Harian" },
            { value: "STATUS_SYNC", label: "Sinkronisasi" },
            { value: "MONTHLY_REVIEW", label: "Bulanan" },
          ].map((item) => (
            <Button
              key={item.value || "all"}
              asChild
              size="sm"
              variant={type === item.value ? "default" : "outline"}
            >
              <Link href={`/history${item.value ? `?type=${item.value}` : ""}`}>{item.label}</Link>
            </Button>
          ))}
        </div>
      </PageHeader>

      <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
        {logs.length === 0 ? (
          <EmptyState
            title="Belum ada riwayat"
            description="Riwayat akan muncul setelah proses pengambilan data pertama dijalankan."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[9%]">Proses</TableHead>
                  <TableHead className="w-[15%]">Jenis</TableHead>
                  <TableHead className="w-[13%]">Mulai</TableHead>
                  <TableHead className="w-[13%]">Selesai</TableHead>
                  <TableHead className="w-[8%] text-right">Ditemukan</TableHead>
                  <TableHead className="w-[7%] text-right">Baru</TableHead>
                  <TableHead className="w-[9%] text-right">Diperbarui</TableHead>
                  <TableHead className="w-[7%] text-right">Gagal</TableHead>
                  <TableHead className="w-[11%]">Status</TableHead>
                  <TableHead className="w-[8%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="overflow-hidden font-mono text-[11px] text-muted-foreground">
                      <span className="block truncate">{log.id.slice(-8)}</span>
                    </TableCell>
                    <TableCell className="overflow-hidden"><span className="block truncate text-[13px]">{PROCESS_TYPE_LABEL[log.processType]}</span></TableCell>
                    <TableCell className="overflow-hidden"><span className="block truncate text-[12.5px] text-muted-foreground">{formatDateTimeId(log.startedAt)}</span></TableCell>
                    <TableCell className="overflow-hidden"><span className="block truncate text-[12.5px] text-muted-foreground">{log.finishedAt ? formatDateTimeId(log.finishedAt) : "—"}</span></TableCell>
                    <TableCell className="text-right text-[12.5px] tabular-nums">{formatNumber(log.totalFound)}</TableCell>
                    <TableCell className="text-right text-[12.5px] tabular-nums">{formatNumber(log.totalCreated)}</TableCell>
                    <TableCell className="text-right text-[12.5px] tabular-nums">{formatNumber(log.totalUpdated)}</TableCell>
                    <TableCell className="text-right text-[12.5px] tabular-nums">{formatNumber(log.totalFailed)}</TableCell>
                    <TableCell>
                      <Badge className={processStatusClass(log.status)}>
                        {PROCESS_STATUS_LABEL[log.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/history/${log.id}`}>Detail</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={info.page}
              totalPages={info.totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              itemLabel="proses"
              makeHref={(nextPage) => `/history${buildQuery(params, { page: nextPage })}`}
            />
          </>
        )}
      </section>
    </div>
  );
}
