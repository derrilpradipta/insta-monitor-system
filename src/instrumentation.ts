/** Dijalankan sekali saat server Next.js mulai. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.ENABLE_INTERNAL_CRON !== "1") return;

  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
