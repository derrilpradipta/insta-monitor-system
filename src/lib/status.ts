import { MonitoringStatus, SourceStatusCategory } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Normalisasi status mentah website internal.
 *
 * Daftar di bawah diturunkan dari nilai status yang BENAR-BENAR muncul di
 * halaman order_list / workflow / detail pesanan sumber:
 *   MENUNGGU PEMBAYARAN, VERIFIKASI PEMBAYARAN, PESANAN MENUNGGU VERIFIKASI,
 *   PESANAN SUDAH DIVERIFIKASI, PROSES PRODUKSI, SEDANG DIKERJAKAN,
 *   SELESAI DIKERJAKAN, PESANAN SIAP DIKIRIM, PESANAN SIAP DIAMBIL,
 *   PESANAN DALAM PENGIRIMAN, PESANAN SUDAH DITERIMA, SELESAI SEBAGIAN.
 *
 * PENTING: "SELESAI DIKERJAKAN" berarti produksi selesai, BUKAN pesanan
 * diterima pelanggan. Hanya "PESANAN SUDAH DITERIMA" (atau status yang
 * menyatakan sudah diambil/diterima) yang dianggap SELESAI.
 */
const EXPLICIT_STATUS: { match: RegExp; category: SourceStatusCategory }[] = [
  { match: /sudah diterima|sudah diambil|telah diterima|telah diambil/i, category: "SELESAI" },
  { match: /^selesai$/i, category: "SELESAI" },
  { match: /batal|cancel|void|refund/i, category: "DIBATALKAN" },
  { match: /menunggu pembayaran|verifikasi pembayaran|belum bayar/i, category: "BARU" },
  { match: /menunggu verifikasi/i, category: "BARU" },
  { match: /sudah diverifikasi|sudah dibayar|pembayaran diterima/i, category: "PROSES" },
  { match: /proses produksi|sedang dikerjakan|dalam produksi|produksi/i, category: "PROSES" },
  { match: /selesai dikerjakan|selesai sebagian|siap dikirim|siap diambil/i, category: "PROSES" },
  { match: /dalam pengiriman|proses pengiriman|dikirim/i, category: "PROSES" },
];

const FALLBACK: { match: RegExp; category: SourceStatusCategory }[] = [
  { match: /selesai|done|complete|finish/i, category: "SELESAI" },
  { match: /proses|process|cetak|print|finishing|desain|revisi|antri|antre|kerja/i, category: "PROSES" },
  { match: /baru|new|masuk|pending|menunggu|waiting/i, category: "BARU" },
];

export function categorizeSourceStatus(raw: string): SourceStatusCategory {
  const status = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!status) return "LAINNYA";

  for (const rule of EXPLICIT_STATUS) {
    if (rule.match.test(status)) return rule.category;
  }
  for (const rule of FALLBACK) {
    if (rule.match.test(status)) return rule.category;
  }
  return "LAINNYA";
}

/** Status pemantauan otomatis dari status sumber. */
export function monitoringFromSource(category: SourceStatusCategory): MonitoringStatus {
  switch (category) {
    case "SELESAI":
      return "SELESAI";
    case "DIBATALKAN":
      return "DIBATALKAN";
    default:
      return "BELUM_SELESAI";
  }
}

/**
 * Hitung status pemantauan yang baru saat sinkronisasi.
 * - Konfirmasi manual pimpinan tidak diturunkan kembali oleh sinkronisasi.
 * - Pesanan yang tidak ditemukan tidak pernah dianggap selesai.
 */
export function nextMonitoringStatus(params: {
  current: MonitoringStatus;
  manualConfirmed: boolean;
  fromSource: MonitoringStatus;
}): { status: MonitoringStatus; changed: boolean } {
  const { current, manualConfirmed, fromSource } = params;

  if (manualConfirmed && current === "SELESAI" && fromSource !== "DIBATALKAN") {
    return { status: current, changed: false };
  }
  if (fromSource === current) return { status: current, changed: false };
  if (fromSource === "BELUM_SELESAI" && current === "SELESAI") {
    // Jangan turunkan status yang sudah selesai karena data sumber parsial.
    return { status: current, changed: false };
  }
  return { status: fromSource, changed: true };
}

export type StatusTransitionContext = {
  orderId: string;
  orderNumber: string;
  from: MonitoringStatus;
  to: MonitoringStatus;
  source: "AUTO" | "MANUAL";
  actorId?: string | null;
  note?: string;
};

/** Catat perubahan status ke activity log. */
export async function logStatusTransition(ctx: StatusTransitionContext): Promise<void> {
  if (ctx.from === ctx.to) return;
  await prisma.activityLog.create({
    data: {
      userId: ctx.actorId ?? null,
      action: ctx.source === "AUTO" ? "STATUS_AUTO" : "STATUS_MANUAL",
      entityType: "order",
      entityId: ctx.orderId,
      description:
        ctx.note ??
        `Status pesanan ${ctx.orderNumber}: ${ctx.from} → ${ctx.to} (${ctx.source === "AUTO" ? "sinkronisasi" : "konfirmasi manual"})`,
    },
  });
}
