import {
  MonitoringStatus,
  NotificationPriority,
  ProcessStatus,
  ProcessType,
  ReviewStatus,
  Role,
  SourceStatusCategory,
} from "@prisma/client";

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrator",
  PIMPINAN: "Pimpinan",
  STAFF: "Staf",
};

export const MONITORING_LABEL: Record<MonitoringStatus, string> = {
  BELUM_SELESAI: "Belum selesai",
  SELESAI: "Selesai",
  DIBATALKAN: "Dibatalkan",
};

export const SOURCE_CATEGORY_LABEL: Record<SourceStatusCategory, string> = {
  BARU: "Baru",
  PROSES: "Diproses",
  SELESAI: "Selesai",
  DIBATALKAN: "Dibatalkan",
  LAINNYA: "Lainnya",
};

export const PROCESS_TYPE_LABEL: Record<ProcessType, string> = {
  DAILY_SCRAPE: "Pengambilan harian",
  STATUS_SYNC: "Sinkronisasi status",
  MONTHLY_REVIEW: "Pemeriksaan bulanan",
  DEADLINE_REPORT: "Kirim laporan email",
};

export const PROCESS_STATUS_LABEL: Record<ProcessStatus, string> = {
  RUNNING: "Berjalan",
  SUCCESS: "Berhasil",
  PARTIAL: "Sebagian berhasil",
  FAILED: "Gagal",
};

export const PRIORITY_LABEL: Record<NotificationPriority, string> = {
  LOW: "Rendah",
  NORMAL: "Normal",
  HIGH: "Tinggi",
  URGENT: "Mendesak",
};

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: "Belum diperiksa",
  DONE: "Sudah diperiksa",
  SKIPPED: "Dilewati",
};

/** Warna badge status pemantauan (hijau selesai, kuning perhatian, merah terlambat). */
export function monitoringBadgeClass(
  status: MonitoringStatus,
  deadline?: Date | string | null,
  today?: string,
): string {
  if (status === "SELESAI") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (status === "DIBATALKAN") return "bg-slate-100 text-slate-600 ring-slate-500/20";
  if (deadline) {
    const deadlineStr = typeof deadline === "string" ? deadline.slice(0, 10) : deadline.toISOString().slice(0, 10);
    const base = today ?? new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    if (deadlineStr < base) return "bg-red-50 text-red-700 ring-red-600/20";
    if (deadlineStr === base) return "bg-amber-50 text-amber-700 ring-amber-600/20";
  }
  return "bg-amber-50 text-amber-700 ring-amber-600/20";
}

export function sourceBadgeClass(category: SourceStatusCategory): string {
  switch (category) {
    case "SELESAI":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    case "DIBATALKAN":
      return "bg-slate-100 text-slate-600 ring-slate-500/20";
    case "PROSES":
      return "bg-blue-50 text-blue-700 ring-blue-600/20";
    case "BARU":
      return "bg-indigo-50 text-indigo-700 ring-indigo-600/20";
    default:
      return "bg-slate-100 text-slate-600 ring-slate-500/20";
  }
}

export function processStatusClass(status: ProcessStatus): string {
  switch (status) {
    case "SUCCESS":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    case "PARTIAL":
      return "bg-amber-50 text-amber-700 ring-amber-600/20";
    case "FAILED":
      return "bg-red-50 text-red-700 ring-red-600/20";
    default:
      return "bg-blue-50 text-blue-700 ring-blue-600/20";
  }
}

export function priorityClass(priority: NotificationPriority): string {
  switch (priority) {
    case "URGENT":
      return "bg-red-50 text-red-700 ring-red-600/20";
    case "HIGH":
      return "bg-amber-50 text-amber-700 ring-amber-600/20";
    case "LOW":
      return "bg-slate-100 text-slate-600 ring-slate-500/20";
    default:
      return "bg-blue-50 text-blue-700 ring-blue-600/20";
  }
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("id-ID").format(value ?? 0);
}

/**
 * Label ringkas untuk status mentah website sumber.
 * Nilai mentah tetap ditampilkan penuh lewat tooltip agar tidak ada informasi hilang.
 * Daftar ini diturunkan dari status yang benar-benar muncul di halaman sumber.
 */
const SOURCE_STATUS_SHORT: { match: RegExp; short: string }[] = [
  { match: /menunggu pembayaran/i, short: "Menunggu bayar" },
  { match: /verifikasi pembayaran/i, short: "Menunggu bayar" },
  { match: /verifikasi pesanan/i, short: "Menunggu verifikasi" },
  { match: /menunggu verifikasi/i, short: "Menunggu verifikasi" },
  { match: /dalam pengiriman/i, short: "Pengiriman" },
  { match: /pengiriman/i, short: "Pengiriman" },
  { match: /siap dikirim/i, short: "Siap dikirim" },
  { match: /siap diambil/i, short: "Siap diambil" },
  { match: /selesai dikerjakan/i, short: "Selesai dikerjakan" },
  { match: /sudah diterima/i, short: "Diterima" },
  { match: /sedang dikerjakan/i, short: "Produksi" },
  { match: /produksi/i, short: "Produksi" },
  { match: /sudah diverifikasi/i, short: "Terverifikasi" },
  { match: /dibatalkan|batal/i, short: "Dibatalkan" },
];

export function shortSourceStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  const found = SOURCE_STATUS_SHORT.find((item) => item.match.test(text));
  return found ? found.short : text;
}
