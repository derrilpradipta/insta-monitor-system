import { buildOperationalSnapshot } from "@/lib/analytics";
import { PageHeader, StatCard } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiPanel } from "@/components/ai/ai-panel";
import { TrendChart } from "@/components/ai/trend-chart";
import { AlertTriangle, Clock, Package, Timer } from "lucide-react";
import { monthLabelId } from "@/lib/time";

export const metadata = { title: "Analisis AI" };
export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  const snapshot = await buildOperationalSnapshot();
  const aiConfigured = Boolean(process.env.AI_BASE_URL && process.env.AI_MODEL);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analisis Operasional"
        description="Ringkasan berbasis data aktual dari database monitoring. AI hanya menganalisis, tidak mengubah data."
      />

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Pesanan masuk kemarin"
          value={snapshot.yesterdayIncoming.toLocaleString("id-ID")}
          hint={`${snapshot.yesterdayDone} selesai · ${snapshot.yesterdayPending} belum`}
          icon={<Package className="size-4" />}
        />
        <StatCard
          label="Tenggat besok"
          value={snapshot.deadlineTomorrow.toLocaleString("id-ID")}
          tone="warning"
          hint="Belum selesai"
          icon={<Clock className="size-4" />}
        />
        <StatCard
          label="Terlambat"
          value={snapshot.overdue.toLocaleString("id-ID")}
          tone="danger"
          hint="Lewat tenggat & belum selesai"
          icon={<AlertTriangle className="size-4" />}
        />
        <StatCard
          label="Tidak diperbarui >3 hari"
          value={snapshot.staleOrders.toLocaleString("id-ID")}
          tone="info"
          hint={`Total tersimpan: ${snapshot.totalOrdersStored.toLocaleString("id-ID")}`}
          icon={<Timer className="size-4" />}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tren bulanan</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart data={snapshot.monthlyTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performa per cabang (kemarin)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.branches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Data cabang belum tersedia.</p>
            ) : (
              snapshot.branches.map((branch) => {
                const total = branch.incomingYesterday || 1;
                const donePercent = Math.round((branch.done / total) * 100);
                return (
                  <div key={branch.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{branch.name}</span>
                      <span className="text-muted-foreground">
                        {branch.incomingYesterday} masuk · {branch.done} selesai
                        {branch.overdue ? ` · ${branch.overdue} terlambat` : ""}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(100, donePercent)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}

            {snapshot.topLateProducts.length ? (
              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Produk paling sering terlambat
                </p>
                <ul className="space-y-1 text-sm">
                  {snapshot.topLateProducts.map((item) => (
                    <li key={item.product} className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-muted-foreground" title={item.product}>
                        {item.product}
                      </span>
                      <span className="shrink-0 font-medium text-red-600">{item.lateCount}×</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <AiPanel configured={aiConfigured} model={process.env.AI_MODEL ?? null} />

      <p className="text-xs text-muted-foreground">
        Data terakhir disusun {new Date(snapshot.generatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB
        · {monthLabelId(new Date().getMonth() + 1, new Date().getFullYear())}
      </p>
    </div>
  );
}
