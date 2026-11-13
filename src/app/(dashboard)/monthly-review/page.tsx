import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState, StatStrip } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { monthLabelId, formatDateTimeId, wibParts } from "@/lib/time";
import { REVIEW_STATUS_LABEL } from "@/lib/labels";
import { ChevronRight } from "lucide-react";
import { RunReviewButton } from "@/components/monthly/run-review-button";

export const metadata = { title: "Pemeriksaan Bulanan" };
export const dynamic = "force-dynamic";

export default async function MonthlyReviewPage() {
  const now = wibParts();
  const [reviews, currentCount] = await Promise.all([
    prisma.monthlyReview.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: { _count: { select: { items: true } } },
    }),
    prisma.order.count({
      where: {
        orderDate: {
          gte: new Date(Date.UTC(now.year, now.month - 1, 1)),
          lt: new Date(Date.UTC(now.year, now.month, 1)),
        },
      },
    }),
  ]);

  // Ringkasan mengikuti review bulan berjalan saja (bukan akumulasi semua bulan).
  const currentReview = reviews.find((r) => r.month === now.month && r.year === now.year);
  const totalChecked = currentReview?.totalChecked ?? 0;
  const totalPending = currentReview?.totalPending ?? 0;
  const reviewTotal = currentReview ? currentReview._count.items || currentReview.totalOrders : 0;
  // Pesanan yang masuk setelah pemeriksaan terakhir dijalankan belum tercakup.
  const notCovered = Math.max(0, currentCount - reviewTotal);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pemeriksaan Bulanan"
        description="Ambil ulang seluruh pesanan satu bulan, lalu konfirmasi manual untuk pesanan yang belum selesai."
      >
        <RunReviewButton year={now.year} month={now.month} />
      </PageHeader>

      <StatStrip
        items={[
          {
            label: "Pesanan bulan ini",
            value: currentCount,
            hint: monthLabelId(now.month, now.year),
          },
          {
            label: "Sudah diperiksa",
            value: totalChecked,
            tone: "success",
            hint: reviewTotal ? `${Math.round((totalChecked / reviewTotal) * 100)}% dari daftar` : "Belum ada pemeriksaan",
          },
          {
            label: "Belum diperiksa",
            value: totalPending,
            tone: "warning",
            hint: `Dari ${reviewTotal.toLocaleString("id-ID")} pesanan di daftar`,
          },
          {
            label: "Di luar daftar",
            value: notCovered,
            tone: "info",
            hint: notCovered ? "Masuk setelah pemeriksaan terakhir" : "Semua pesanan sudah tercakup",
          },
        ]}
      />

      {reviews.length === 0 ? (
        <EmptyState
          title="Belum ada pemeriksaan bulanan"
          description="Jalankan pemeriksaan untuk bulan ini. Sistem akan mengambil ulang seluruh pesanan berdasarkan tanggal masuk, lalu menyusun daftar per cabang."
        />
      ) : (
        <div className="grid gap-3">
          {reviews.map((review) => {
            const total = review._count.items || review.totalOrders;
            const checked = review.totalChecked;
            const percent = total ? Math.round((checked / total) * 100) : 0;
            return (
              <Card key={review.id} className="transition-colors hover:border-primary/40">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{monthLabelId(review.month, review.year)}</p>
                      <Badge
                        className={
                          review.status === "COMPLETED"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                            : review.status === "FAILED"
                              ? "bg-red-50 text-red-700 ring-red-600/20"
                              : "bg-blue-50 text-blue-700 ring-blue-600/20"
                        }
                      >
                        {review.status === "COMPLETED" ? "Selesai" : review.status === "FAILED" ? "Gagal" : "Berjalan"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTimeId(review.finishedAt ?? review.startedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {total} pesanan dalam daftar · {checked} dikonfirmasi · {review.totalPending} menunggu
                      {review.errorMessage ? ` · ${review.errorMessage.slice(0, 80)}` : ""}
                    </p>
                    <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                    </div>
                  </div>

                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <Link href={`/monthly-review/${review.id}`}>
                      Buka daftar <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Status checklist: {Object.values(REVIEW_STATUS_LABEL).join(" · ")}. Checklist hanya mengubah database
        monitoring, tidak mengirim perubahan ke website internal.
      </p>
    </div>
  );
}
