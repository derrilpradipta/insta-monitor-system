import { ProcessStatus, ProcessType, type Branch, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  InstaprintClient,
  parseCustomer,
  parseSourceDate,
  parseSourceDeadlineDate,
  type ScrapedOrderDetail,
} from "@/lib/scraper/instaprint";
import { categorizeSourceStatus, monitoringFromSource, nextMonitoringStatus } from "@/lib/status";
import { cleanCustomerName, joinProductNames } from "@/lib/text";
import { dateOnlyToDb, monthRangeWib, wibDateString } from "@/lib/time";
import { notifyAdmins } from "@/lib/notifications";
import { logActivity } from "@/lib/activity";

export type UpsertResult = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  outlets: string[];
};

type PreparedOrder = {
  sourceOrderId: string;
  orderNumber: string;
  branchName: string;
  customerName: string;
  customerPhone: string | null;
  productName: string;
  orderDate: Date;
  deadlineDate: Date | null;
  sourceStatus: string;
  sourceUrl: string;
  raw: Record<string, unknown>;
};

/** Pastikan cabang tersedia, buat otomatis bila outlet baru muncul di sumber. */
async function ensureBranch(name: string, cache: Map<string, Branch>): Promise<Branch> {
  const branchName = name.trim() || "Tanpa Cabang";
  const cached = cache.get(branchName);
  if (cached) return cached;

  const existing = await prisma.branch.findFirst({ where: { branchName } });
  const branch =
    existing ??
    (await prisma.branch.create({
      data: {
        branchName,
        branchCode: branchName
          .replace(/^Instaprint\s+/i, "")
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "-")
          .slice(0, 24) || `CAB-${Date.now()}`,
      },
    }));
  cache.set(branchName, branch);
  return branch;
}

/** Susun data pesanan siap simpan dari baris daftar + detail (bila ada). */
function prepareOrder(
  row: {
    sourceId: string;
    outlet: string;
    sourceStatus: string;
    orderNumber: string;
    orderDateRaw: string;
    products: string[];
    customerRaw: string;
  },
  detail: ScrapedOrderDetail | null,
  baseUrl: string,
): PreparedOrder | null {
  const orderIso = parseSourceDate(detail?.orderDateRaw || row.orderDateRaw);
  if (!orderIso) return null;

  const customer = parseCustomer(detail?.customerName || row.customerRaw);
  // Deadline: prioritaskan deadline pesanan; jika kosong ATAU tidak valid
  // (sumber memakai 01-01-1970 sebagai penanda kosong), pakai deadline produk
  // paling akhir dari tabel Work Order.
  let deadlineDate = parseSourceDeadlineDate(detail?.deadlineRaw ?? null);
  if (!deadlineDate && detail?.products.length) {
    const candidates = detail.products
      .map((p) => p.deadlineRaw)
      .filter((v): v is string => Boolean(v))
      .sort((a, b) => {
        const da = parseSourceDate(a);
        const db = parseSourceDate(b);
        return (da ?? "").localeCompare(db ?? "");
      })
      .filter((v) => parseSourceDate(v) !== null);
    deadlineDate = parseSourceDeadlineDate(candidates.at(-1) ?? null);
  }

  const detailProductNames = detail?.products.length ? detail.products.map((p) => p.name) : [];
  let productName = joinProductNames(detailProductNames);
  // Jika detail tidak memuat nama produk yang bisa dipakai, pakai produk dari daftar order.
  if (productName === "-" && row.products.length) {
    productName = joinProductNames(row.products);
  }

  return {
    sourceOrderId: row.sourceId || row.orderNumber,
    orderNumber: detail?.orderNumber || row.orderNumber,
    branchName: detail?.outlet || row.outlet,
    customerName: cleanCustomerName(customer.name) || "-",
    customerPhone: customer.phone,
    productName,
    orderDate: new Date(orderIso),
    deadlineDate: deadlineDate ? dateOnlyToDb(deadlineDate) : null,
    sourceStatus: (detail?.paymentStatus || row.sourceStatus || "").trim(),
    sourceUrl: `${baseUrl}/workflow_order/detail/${row.sourceId}`,
    raw: { list: row, detail },
  };
}

/**
 * Upsert pesanan hasil scraping. Idempotent: aman dijalankan berulang.
 * Status sumber & status pemantauan dijaga terpisah; konfirmasi manual tidak ditimpa.
 */
export async function upsertOrders(
  prepared: PreparedOrder[],
  options: { branchCache?: Map<string, Branch>; logId?: string } = {},
): Promise<UpsertResult> {
  const branchCache = options.branchCache ?? new Map<string, Branch>();
  const result: UpsertResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [], outlets: [] };
  const outlets = new Set<string>();

  for (const item of prepared) {
    try {
      const branch = await ensureBranch(item.branchName, branchCache);
      outlets.add(branch.branchName);

      const category = categorizeSourceStatus(item.sourceStatus);
      const existing = await prisma.order.findUnique({
        where: { branchId_sourceOrderId: { branchId: branch.id, sourceOrderId: item.sourceOrderId } },
      });

      if (!existing) {
        const created = await prisma.order.create({
          data: {
            sourceOrderId: item.sourceOrderId,
            orderNumber: item.orderNumber,
            branchId: branch.id,
            customerName: item.customerName,
            customerPhone: item.customerPhone,
            productName: item.productName,
            orderDate: item.orderDate,
            deadlineDate: item.deadlineDate,
            sourceStatus: item.sourceStatus || "TIDAK DIKETAHUI",
            sourceStatusCategory: category,
            monitoringStatus: monitoringFromSource(category),
            monitoringStatusSource: "AUTO",
            monitoringStatusChangedAt: new Date(),
            lastScrapedAt: new Date(),
            sourceUrl: item.sourceUrl,
          },
        });
        await prisma.orderSnapshot.create({
          data: {
            orderId: created.id,
            sourceData: item.raw as Prisma.InputJsonValue,
            sourceStatus: created.sourceStatus,
          },
        });
        result.created += 1;
        continue;
      }

      // Perubahan status pemantauan: hormati konfirmasi manual.
      const next = nextMonitoringStatus({
        current: existing.monitoringStatus,
        manualConfirmed: existing.manualConfirmed,
        fromSource: monitoringFromSource(category),
      });

      await prisma.order.update({
        where: { id: existing.id },
        data: {
          orderNumber: item.orderNumber,
          customerName: item.customerName,
          customerPhone: item.customerPhone ?? existing.customerPhone,
          productName: item.productName,
          orderDate: item.orderDate,
          deadlineDate: item.deadlineDate ?? existing.deadlineDate,
          sourceStatus: item.sourceStatus || existing.sourceStatus,
          sourceStatusCategory: category,
          monitoringStatus: next.status,
          ...(next.changed
            ? { monitoringStatusSource: "AUTO" as const, monitoringStatusChangedAt: new Date() }
            : {}),
          lastScrapedAt: new Date(),
          sourceUrl: item.sourceUrl,
        },
      });

      if (next.changed) {
        await logActivity({
          action: "STATUS_AUTO",
          entityType: "order",
          entityId: existing.id,
          description: `Status pesanan ${item.orderNumber}: ${existing.monitoringStatus} → ${next.status} (sinkronisasi sumber)`,
        });
      }

      // Snapshot hanya dicatat bila status sumber berubah (hemat storage).
      if (existing.sourceStatus !== item.sourceStatus) {
        await prisma.orderSnapshot.create({
          data: {
            orderId: existing.id,
            sourceData: item.raw as Prisma.InputJsonValue,
            sourceStatus: item.sourceStatus || "TIDAK DIKETAHUI",
          },
        });
      }

      result.updated += 1;
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      if (result.errors.length < 20) result.errors.push(`${item.orderNumber}: ${message}`);
    }
  }

  result.outlets = [...outlets];
  return result;
}

export type ScrapeRunOptions = {
  /** Rentang tanggal MASUK pesanan (YYYY-MM-DD), inklusif. */
  startDate: string;
  endDate: string;
  processType: ProcessType;
  /**
   * true  = ambil detail setiap pesanan (lambat, tapi lengkap).
   * false = jangan ambil detail.
   * "smart" (default) = ambil detail hanya untuk pesanan baru, yang status daftarnya
   *   berubah, atau yang tenggatnya belum tersimpan. Jauh lebih cepat untuk
   *   pemeriksaan bulanan karena sebagian besar data tidak berubah.
   */
  fetchDetails?: boolean | "smart";
  triggeredBy?: string | null;
  retryOfId?: string | null;
  onProgress?: (message: string) => void;
};

/** Jalankan satu proses scraping lengkap: login -> daftar -> detail -> simpan -> log. */
export async function runScrape(options: ScrapeRunOptions): Promise<{ logId: string; result: UpsertResult }> {
  const {
    startDate,
    endDate,
    processType,
    fetchDetails = "smart",
    triggeredBy = null,
    retryOfId = null,
    onProgress,
  } = options;

  const log = await prisma.scrapingLog.create({
    data: {
      processType,
      status: "RUNNING",
      targetDate: dateOnlyToDb(startDate),
      triggeredBy,
      retryOfId,
    },
  });

  const client = new InstaprintClient();
  let found = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    onProgress?.("Login ke website sumber");
    await client.login();

    onProgress?.(`Mengambil daftar pesanan ${startDate} s/d ${endDate}`);
    const rows = await client.fetchOrdersForDateRange(startDate, endDate, (info) =>
      onProgress?.(`Halaman offset ${info.offset}: ${info.rows} baris (total ${info.total})`),
    );
    found = rows.length;

    const prepared: PreparedOrder[] = [];
    const baseUrl = (process.env.SOURCE_WEBSITE_URL ?? "").replace(/\/$/, "");

    // Mode "smart": muat keadaan tersimpan sekali, lalu putuskan per pesanan
    // apakah halaman detail perlu dibuka (mahal: satu request per pesanan).
    const existingMap = new Map<string, { sourceStatus: string; deadlineDate: Date | null }>();
    if (fetchDetails === "smart" && rows.length > 0) {
      const stored = await prisma.order.findMany({
        where: { sourceOrderId: { in: rows.map((r) => r.sourceId || r.orderNumber) } },
        select: { sourceOrderId: true, sourceStatus: true, deadlineDate: true },
      });
      for (const item of stored) existingMap.set(item.sourceOrderId, item);
    }

    let detailFetched = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      let needsDetail = fetchDetails === true;
      if (fetchDetails === "smart") {
        const existing = existingMap.get(row.sourceId || row.orderNumber);
        needsDetail = !existing || existing.sourceStatus !== row.sourceStatus || !existing.deadlineDate;
      }

      let detail: ScrapedOrderDetail | null = null;
      if (needsDetail) {
        detail = await client.fetchOrderDetail(row.sourceId).catch((error) => {
          errors.push(`Detail ${row.orderNumber}: ${(error as Error).message}`);
          return null;
        });
        detailFetched += 1;
      }

      const item = prepareOrder(row, detail, baseUrl);
      if (item) prepared.push(item);
      else failed += 1;
      if (detailFetched > 0 && detailFetched % 10 === 0) {
        onProgress?.(`Mengambil detail ${detailFetched} pesanan (${i + 1}/${rows.length} diproses)`);
      }
    }
    onProgress?.(`${detailFetched} halaman detail dibuka dari ${rows.length} pesanan`);

    onProgress?.("Menyimpan ke database");
    const upsert = await upsertOrders(prepared, { logId: log.id });
    created = upsert.created;
    updated = upsert.updated;
    failed += upsert.failed;
    errors.push(...upsert.errors);

    const status: ProcessStatus =
      failed === 0 ? "SUCCESS" : created + updated > 0 ? "PARTIAL" : "FAILED";

    await prisma.scrapingLog.update({
      where: { id: log.id },
      data: {
        status,
        finishedAt: new Date(),
        totalFound: found,
        totalCreated: created,
        totalUpdated: updated,
        totalSkipped: Math.max(0, found - created - updated - failed),
        totalFailed: failed,
        errorMessage: errors.length ? errors.slice(0, 10).join("\n").slice(0, 4000) : null,
        detail: { startDate, endDate, outlets: upsert.outlets, errors: errors.slice(0, 20) },
      },
    });

    if (status === "FAILED") {
      await notifyAdmins({
        title: "Pengambilan data gagal",
        message: `Proses ${processType} untuk ${startDate} s/d ${endDate} gagal. ${errors[0] ?? ""}`.trim(),
        type: "SCRAPE_FAILED",
        priority: "URGENT",
        relatedUrl: `/history/${log.id}`,
        dedupeKey: `scrape-failed:${log.id}`,
      });
    } else {
      await notifyAdmins({
        title: "Pengambilan data selesai",
        message: `${found} pesanan ditemukan, ${created} baru, ${updated} diperbarui${
          failed ? `, ${failed} gagal` : ""
        } (${startDate} s/d ${endDate}).`,
        type: "SCRAPE_SUCCESS",
        priority: failed ? "HIGH" : "NORMAL",
        relatedUrl: `/history/${log.id}`,
        dedupeKey: `scrape-done:${log.id}`,
      });
    }

    return {
      logId: log.id,
      result: { created, updated, skipped: Math.max(0, found - created - updated - failed), failed, errors, outlets: upsert.outlets },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.scrapingLog.update({
      where: { id: log.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        totalFound: found,
        totalCreated: created,
        totalUpdated: updated,
        totalFailed: Math.max(failed, 1),
        errorMessage: `${message}`.slice(0, 4000),
      },
    });
    await notifyAdmins({
      title: "Pengambilan data gagal",
      message: `Proses ${processType} gagal: ${message}`.slice(0, 500),
      type: "SCRAPE_FAILED",
      priority: "URGENT",
      relatedUrl: `/history/${log.id}`,
      dedupeKey: `scrape-failed:${log.id}`,
    });
    // Data lama TIDAK dihapus dan status TIDAK diubah saat gagal.
    throw error;
  } finally {
    await client.close();
  }
}

/** Sinkronisasi status pesanan aktif: ambil ulang pesanan yang belum selesai. */
export async function syncActiveOrderStatuses(triggeredBy: string | null = null): Promise<{
  logId: string;
  checked: number;
  updated: number;
}> {
  // Hanya pesanan aktif dalam N hari terakhir. Pesanan yang lebih lama sudah
  // ditangani pemeriksaan bulanan, dan menarik seluruh riwayat akan sangat lambat.
  const maxAgeDays = Number(process.env.SYNC_MAX_AGE_DAYS ?? 14);
  const oldest = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

  const active = await prisma.order.findMany({
    where: { monitoringStatus: "BELUM_SELESAI", orderDate: { gte: oldest } },
    select: { id: true, orderDate: true },
    orderBy: { orderDate: "desc" },
    take: 3000,
  });

  if (active.length === 0) {
    const log = await prisma.scrapingLog.create({
      data: {
        processType: "STATUS_SYNC",
        status: "SUCCESS",
        finishedAt: new Date(),
        triggeredBy,
        detail: { note: "Tidak ada pesanan aktif" },
      },
    });
    return { logId: log.id, checked: 0, updated: 0 };
  }

  // Ambil rentang tanggal order yang masih aktif, lalu scrape rentang tersebut.
  const dates = active.map((o) => o.orderDate.toISOString().slice(0, 10)).sort();
  const startDate = dates[0]!;
  const endDate = dates.at(-1)!;

  const { logId, result } = await runScrape({
    startDate,
    endDate,
    processType: "STATUS_SYNC",
    fetchDetails: "smart",
    triggeredBy,
  });

  return { logId, checked: active.length, updated: result.updated };
}

/** Tandai proses yang tertinggal dalam status RUNNING (mis. server restart) sebagai gagal. */
export async function closeOrphanProcesses(): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const result = await prisma.scrapingLog.updateMany({
    where: { status: "RUNNING", startedAt: { lt: cutoff } },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      errorMessage: "Proses terhenti sebelum selesai (server berhenti atau waktu habis).",
    },
  });
  if (result.count > 0) console.warn(`[sync] ${result.count} proses RUNNING ditandai gagal`);
  return result.count;
}

/** Jalankan pengambilan harian untuk tanggal yang diberikan (default kemarin WIB). */
export async function runDailyScrape(targetDate?: string, triggeredBy: string | null = null) {
  const date = targetDate ?? wibDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
  return runScrape({
    startDate: date,
    endDate: date,
    processType: "DAILY_SCRAPE",
    fetchDetails: "smart",
    triggeredBy,
  });
}

/** Jalankan pemeriksaan bulanan untuk bulan berjalan atau bulan tertentu. */
export async function runMonthlyReview(input: {
  year: number;
  month: number;
  createdBy?: string | null;
}) {
  const { year, month, createdBy = null } = input;
  const range = monthRangeWib(year, month);

  const { logId, result } = await runScrape({
    startDate: range.start.toISOString().slice(0, 10),
    endDate: new Date(range.end.getTime() - 1).toISOString().slice(0, 10),
    processType: "MONTHLY_REVIEW",
    fetchDetails: "smart",
    triggeredBy: createdBy,
  });

  // Bangun daftar pemeriksaan: semua pesanan pada bulan itu yang belum selesai.
  const orders = await prisma.order.findMany({
    where: {
      orderDate: { gte: range.start, lt: range.end },
      monitoringStatus: "BELUM_SELESAI",
    },
    select: { id: true, branchId: true },
  });

  const review = await prisma.monthlyReview.upsert({
    where: { year_month: { year, month } },
    update: {
      status: "COMPLETED",
      finishedAt: new Date(),
      totalOrders: orders.length,
      totalPending: orders.length,
      totalChecked: 0,
      scrapingLogId: logId,
      errorMessage: null,
    },
    create: {
      year,
      month,
      status: "COMPLETED",
      finishedAt: new Date(),
      totalOrders: orders.length,
      totalPending: orders.length,
      createdBy,
      scrapingLogId: logId,
    },
  });

  // Sinkronkan item pemeriksaan (aman dijalankan ulang).
  for (const order of orders) {
    await prisma.reviewItem.upsert({
      where: { monthlyReviewId_orderId: { monthlyReviewId: review.id, orderId: order.id } },
      update: { branchId: order.branchId },
      create: {
        monthlyReviewId: review.id,
        orderId: order.id,
        branchId: order.branchId,
        reviewStatus: "PENDING",
      },
    });
  }

  await notifyAdmins({
    title: "Pemeriksaan bulanan selesai",
    message: `Pemeriksaan ${month}/${year} selesai. ${orders.length} pesanan menunggu checklist pimpinan.`,
    type: "MONTHLY_REVIEW_DONE",
    priority: "HIGH",
    relatedUrl: `/monthly-review/${review.id}`,
    dedupeKey: `monthly-review:${review.id}`,
  });

  if (orders.length > 0) {
    await notifyAdmins({
      title: "Pesanan menunggu pemeriksaan",
      message: `${orders.length} pesanan bulan ${month}/${year} belum diperiksa pimpinan.`,
      type: "REVIEW_PENDING",
      priority: "HIGH",
      relatedUrl: `/monthly-review/${review.id}`,
      dedupeKey: `review-pending:${review.id}`,
    });
  }

  return { reviewId: review.id, logId, result, totalOrders: orders.length };
}
