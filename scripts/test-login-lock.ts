import "dotenv/config";
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

/** Uji pembatasan percobaan login memakai akun sementara (dihapus setelah uji). */
async function main() {
  const email = "uji-lock@instaprint.local";
  await prisma.user.deleteMany({ where: { email } });
  await prisma.user.create({
    data: {
      name: "Uji Lock",
      email,
      passwordHash: await bcrypt.hash("PasswordBenar123!", 10),
      role: "STAFF",
    },
  });

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();

  let lastMessage = "";
  for (let i = 1; i <= 6; i += 1) {
    await page.goto("http://localhost:3100/login", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="identifier"]', email);
    await page.fill('input[name="password"]', `salah-${i}`);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(700);
    lastMessage =
      (await page.locator('[role="alert"]').innerText().catch(() => "")) ||
      (await page.evaluate(() => document.body.innerText.match(/[^\n]*salah[^\n]*|[^\n]*dikunci[^\n]*/i)?.[0] ?? ""));
    console.log(`percobaan ${i}:`, lastMessage.trim().slice(0, 120));
  }

  const user = await prisma.user.findUnique({ where: { email } });
  console.log("lockedUntil:", user?.lockedUntil?.toISOString() ?? null);

  // Password benar saat akun terkunci harus tetap ditolak
  await page.goto("http://localhost:3100/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', "PasswordBenar123!");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(700);
  console.log("login benar saat terkunci -> url:", page.url());
  console.log(
    "pesan:",
    (await page.locator('[role="alert"]').innerText().catch(() => "")).trim().slice(0, 120),
  );

  await prisma.user.delete({ where: { email } });
  await browser.close();
}

main().finally(() => prisma.$disconnect());
