import cron from "node-cron";
import { prisma } from "@/lib/db";
import { runEmailSync } from "@/lib/email/sync";
import { closeOrphanProcesses, runDailyScrape, runMonthlyReview, syncActiveOrderStatuses } from "@/lib/sync";
import { notifyDeadlineTomorrow, notifyOverdue, notifyStaleOrders } from "@/lib/notifications";
import { dateOnlyToDb, shiftDateString, wibDateString, wibParts } from "@/lib/time";

let started = false;

/**
 * Catch-up: jika server hidup setelah jadwal 23.30 terlewat (mis. PC/VPS mati
 * semalam), ambil data kemarin sekali saat start. Tidak mengulang jika sudah ada.
 */
async function catchUpMissedDaily() {
  const now = wibParts();
  // Jangan jalan pada rentang 23:30–23:59 (jadwal utama masih akan/baru jalan).
  if (now.hour === 23 && now.minute >= 30) return;

  const yesterday = shiftDateString(wibDateString(), -1);
  const target = dateOnlyToDb(yesterday);

  const existing = await prisma.scrapingLog.findFirst({
    where: {
      processType: "DAILY_SCRAPE",
      status: { in: ["SUCCESS", "PARTIAL"] },
      targetDate: target,
    },
    select: { id: true, finishedAt: true },
  });
  if (existing) return;

  // Beri jeda agar server selesai start sebelum scraping berat dimulai.
  await new Promise((resolve) => setTimeout(resolve, 20_000));
  console.log(`[cron] catch-up: data harian ${yesterday} belum ada, mengambil sekarang`);
  try {
    await runDailyScrape(yesterday, "cron-catchup");
    console.log(`[cron] catch-up ${yesterday} selesai`);
  } catch (error) {
    console.error("[cron] catch-up gagal", error);
  }
}

/**
 * Penjadwal internal. Aktifkan dengan ENABLE_INTERNAL_CRON=1.
 * Untuk deployment yang lebih tahan banting, gunakan crontab VPS yang memanggil
 * POST /api/cron?job=daily (lihat README).
 *
 * Semua jadwal memakai zona waktu Asia/Jakarta. Ekspresi cron bisa diubah lewat
 * env (CRON_DAILY, CRON_SYNC, CRON_REMINDER, CRON_MONTHLY) — dipakai juga saat
 * pengujian untuk memicu job dalam hitungan menit.
 */
export function startScheduler() {
  if (started) return;
  if (process.env.ENABLE_INTERNAL_CRON !== "1") return;
  started = true;

  const options = { timezone: "Asia/Jakarta" } as const;
  const expr = {
    daily: process.env.CRON_DAILY ?? "30 23 * * *",
    sync: process.env.CRON_SYNC ?? "5 0 * * *",
    reminder: process.env.CRON_REMINDER ?? "0 8 * * *",
    monthly: process.env.CRON_MONTHLY ?? "0 1 1 * *",
  };

  console.log(
    `[cron] penjadwal internal aktif (Asia/Jakarta) — harian="${expr.daily}" sinkron="${expr.sync}" pengingat="${expr.reminder}" bulanan="${expr.monthly}"`,
  );

  // Bersihkan proses yang tertinggal saat start.
  void closeOrphanProcesses().catch(() => null);
  void catchUpMissedDaily().catch((error) => console.error("[cron] catch-up error", error));

  /** Jangan jalankan proses baru jika masih ada scraping yang berjalan. */
  const isBusy = async () => {
    const running = await prisma.scrapingLog.count({ where: { status: "RUNNING" } });
    return running > 0;
  };

  // 23:30 (default) — pengambilan data harian untuk hari ini.
  cron.schedule(
    expr.daily,
    async () => {
      if (await isBusy()) {
        console.warn("[cron] pengambilan harian dilewati: masih ada proses berjalan");
        return;
      }
      const today = wibDateString();
      console.log(`[cron] pengambilan harian ${today}`);
      try {
        const result = await runDailyScrape(today, "cron-internal");
        console.log(`[cron] pengambilan harian selesai: ${result.result.created} baru, ${result.result.updated} diperbarui`);
      } catch (error) {
        console.error("[cron] pengambilan harian gagal", error);
      }
    },
    options,
  );

  // 00.05 — sinkronisasi status pesanan aktif + ambil pesanan yang masuk
  // setelah jadwal 23.30 (mis. order 23.45) agar tidak ada yang terlewat.
  cron.schedule(
    expr.sync,
    async () => {
      if (await isBusy()) return;
      try {
        const yesterday = shiftDateString(wibDateString(), -1);
        const late = await runDailyScrape(yesterday, "cron-internal-susulan");
        await syncActiveOrderStatuses("cron-internal");
        console.log(
          `[cron] sinkronisasi status selesai (susulan ${yesterday}: ${late.result.created} baru, ${late.result.updated} diperbarui)`,
        );
      } catch (error) {
        console.error("[cron] sinkronisasi gagal", error);
      }
    },
    options,
  );

  // 08:00 — pengingat tenggat, keterlambatan, dan data usang.
  cron.schedule(
    expr.reminder,
    async () => {
      try {
        const [tomorrow, overdue, stale] = await Promise.all([
          notifyDeadlineTomorrow(),
          notifyOverdue(),
          notifyStaleOrders(),
        ]);
        console.log(`[cron] notifikasi: ${tomorrow} tenggat besok, ${overdue} terlambat, ${stale} usang`);
      } catch (error) {
        console.error("[cron] notifikasi gagal", error);
      }
    },
    options,
  );

  // Tanggal 1 pukul 01:00 — pemeriksaan bulanan untuk bulan sebelumnya.
  cron.schedule(
    expr.monthly,
    async () => {
      if (await isBusy()) return;
      const now = wibParts();
      const previous = shiftDateString(`${now.year}-${String(now.month).padStart(2, "0")}-01`, -1);
      const [year, month] = previous.split("-").map(Number);
      try {
        const result = await runMonthlyReview({ year: year!, month: month!, createdBy: null });
        console.log(`[cron] pemeriksaan bulanan ${month}/${year}: ${result.totalOrders} pesanan`);
      } catch (error) {
        console.error("[cron] pemeriksaan bulanan gagal", error);
      }
    },
    options,
  );

  // 02:00 — bersihkan sesi kedaluwarsa.
  cron.schedule(
    "0 2 * * *",
    async () => {
      await prisma.userSession
        .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86400_000) } } })
        .catch(() => null);
    },
    options,
  );

  // Setiap jam — ambil email yang belum dibaca.
  // Dilewati kalau kredensial IMAP belum diisi, supaya log tidak penuh galat.
  if (process.env.MAIL_IMAP_USER && process.env.MAIL_IMAP_PASSWORD) {
    cron.schedule(
      process.env.CRON_EMAIL ?? "0 * * * *",
      async () => {
        try {
          const hasil = await runEmailSync("cron-internal");
          console.log(`[cron] email: ${hasil.unreadFound} belum dibaca (${hasil.created} baru)`);
        } catch (error) {
          console.error("[cron] pengambilan email gagal", error);
        }
      },
      options,
    );
  }
}
