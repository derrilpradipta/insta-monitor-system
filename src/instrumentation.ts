/**
 * Dijalankan sekali saat server Next.js mulai.
 *
 * Di Vercel penjadwal node-cron tidak bisa hidup (function berhenti setelah
 * request selesai), jadi di sana pengambilan harian dijadwalkan lewat Vercel
 * Cron Jobs yang memanggil POST /api/cron?job=daily (lihat vercel.json).
 *
 * Di Docker/VPS hook ini yang menyalakan node-cron.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL) return;
  if (process.env.ENABLE_INTERNAL_CRON !== "1") return;

  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
