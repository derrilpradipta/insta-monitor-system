import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PROCESS_STATUS_LABEL, PROCESS_TYPE_LABEL, formatNumber, processStatusClass } from "@/lib/labels";
import { formatDateTimeId } from "@/lib/time";
import { RetryButton } from "@/components/history/retry-button";

export const dynamic = "force-dynamic";

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const log = await prisma.scrapingLog.findUnique({ where: { id } });
  if (!log) notFound();

  const detail = (log.detail ?? {}) as Record<string, unknown>;
  const outlets = Array.isArray(detail.outlets) ? (detail.outlets as string[]) : [];
  const errors = Array.isArray(detail.errors) ? (detail.errors as string[]) : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Proses ${PROCESS_TYPE_LABEL[log.processType]}`}
        description={`ID proses ${log.id}`}
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/history">
            <ArrowLeft className="size-4" /> Kembali
          </Link>
        </Button>
        {log.status === "FAILED" || log.status === "PARTIAL" ? (
          <RetryButton logId={log.id} processType={log.processType} targetDate={log.targetDate?.toISOString().slice(0, 10)} />
        ) : null}
      </PageHeader>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={processStatusClass(log.status)}>{PROCESS_STATUS_LABEL[log.status]}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Data ditemukan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{formatNumber(log.totalFound)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Baru / diperbarui</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(log.totalCreated)} / {formatNumber(log.totalUpdated)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Gagal</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-semibold tabular-nums ${log.totalFailed ? "text-red-600" : ""}`}>
              {formatNumber(log.totalFailed)}
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Rincian proses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Jenis proses" value={PROCESS_TYPE_LABEL[log.processType]} />
          <Row label="Mulai" value={formatDateTimeId(log.startedAt)} />
          <Row label="Selesai" value={log.finishedAt ? formatDateTimeId(log.finishedAt) : "Belum selesai"} />
          <Row label="Tanggal target" value={log.targetDate?.toISOString().slice(0, 10) ?? "—"} />
          <Row label="Dipicu oleh" value={log.triggeredBy ?? "sistem"} />
          <Row label="Dilewati" value={formatNumber(log.totalSkipped)} />
          <Row label="Cabang diproses" value={outlets.length ? outlets.join(", ") : "—"} />
          {log.retryOfId ? <Row label="Percobaan ulang dari" value={log.retryOfId} /> : null}
        </CardContent>
      </Card>

      {log.errorMessage ? (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-700">Keterangan kesalahan</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-xs text-red-800 scrollbar-thin">
              {log.errorMessage}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {errors.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Kesalahan per pesanan</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
