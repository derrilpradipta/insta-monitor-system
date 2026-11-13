import "dotenv/config";
import { prisma } from "../src/lib/db";
import { runScrapeFailureProbe } from "./lib-failure-probe";

async function main() {
  const before = {
    orders: await prisma.order.count(),
    logs: await prisma.scrapingLog.count(),
    notifications: await prisma.notification.count(),
  };

  console.log("[failure] mencoba login dengan password salah…");
  const result = await runScrapeFailureProbe({
    username: process.env.SCRAPER_USERNAME!,
    password: "password-sengaja-salah",
  });

  const after = {
    orders: await prisma.order.count(),
    logs: await prisma.scrapingLog.count(),
    notifications: await prisma.notification.count(),
  };

  console.log("[failure] hasil:", result);
  console.log("[failure] pesanan sebelum/sesudah:", before.orders, after.orders);
  console.log("[failure] log sebelum/sesudah:", before.logs, after.logs);
  console.log("[failure] notifikasi sebelum/sesudah:", before.notifications, after.notifications);

  const log = await prisma.scrapingLog.findFirst({ orderBy: { startedAt: "desc" } });
  console.log("[failure] log terakhir:", {
    status: log?.status,
    error: log?.errorMessage?.slice(0, 160),
    finished: Boolean(log?.finishedAt),
  });

  const notif = await prisma.notification.findFirst({
    where: { type: "SCRAPE_FAILED" },
    orderBy: { createdAt: "desc" },
  });
  console.log("[failure] notifikasi gagal:", notif?.title, "|", notif?.message.slice(0, 120));

}

main().finally(() => prisma.$disconnect());
