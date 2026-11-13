import "dotenv/config";
import { chromium } from "playwright";

/**
 * Uji timeout sesi 30 menit:
 * 1. login, catat cookie;
 * 2. paksa lastActivityAt di database menjadi 31 menit lalu;
 * 3. buka /orders -> harus diarahkan ke /login?reason=expired.
 */
async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { createHash } = await import("node:crypto");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL!);
  await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD!);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  console.log("login:", page.url());

  const cookies = await context.cookies();
  const token = cookies.find((c) => c.name === "ipms_session")?.value;
  if (!token) throw new Error("Cookie sesi tidak ditemukan");
  const hash = createHash("sha256").update(token).digest("hex");

  const session = await prisma.userSession.findUnique({ where: { sessionTokenHash: hash } });
  if (!session) throw new Error("Sesi tidak ada di database");
  console.log("sesi dibuat:", session.createdAt.toISOString(), "| idle menit:", Number(process.env.SESSION_IDLE_MINUTES));

  await prisma.userSession.update({
    where: { id: session.id },
    data: {
      lastActivityAt: new Date(Date.now() - 31 * 60 * 1000),
      expiresAt: new Date(Date.now() - 60 * 1000),
    },
  });

  const response = await page.goto("http://localhost:3000/orders", { waitUntil: "domcontentloaded" });
  console.log("setelah idle 31 menit ->", page.url(), "| status:", response?.status());

  const after = await prisma.userSession.findUnique({ where: { id: session.id } });
  console.log("sesi dicabut di database:", Boolean(after?.revokedAt));

  await prisma.$disconnect();
  await browser.close();
}

main();
