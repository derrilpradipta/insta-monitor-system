import "dotenv/config";
import { chromium } from "playwright";

/** Uji keamanan: password lama salah harus ditolak; password baru tidak boleh tersimpan. */
async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();

  await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', process.env.SEED_ADMIN_EMAIL!);
  await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD!);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  const before = await prisma.user.findFirst({
    where: { email: process.env.SEED_ADMIN_EMAIL },
    select: { passwordHash: true },
  });

  await page.goto("http://localhost:3000/profile", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="currentPassword"]', "password-lama-salah");
  await page.fill('input[name="newPassword"]', "PasswordBaru123!");
  await page.fill('input[name="confirmPassword"]', "PasswordBaru123!");
  await page.click('form input[name="newPassword"] >> xpath=ancestor::form//button[@type="submit"]');
  await page.waitForTimeout(2500);

  const message = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("p")).find((p) =>
      /Password lama salah|berhasil diubah|Konfirmasi password tidak sama/.test(p.textContent ?? ""),
    );
    return el ? el.textContent : null;
  });
  console.log("pesan UI:", message);

  const after = await prisma.user.findFirst({
    where: { email: process.env.SEED_ADMIN_EMAIL },
    select: { passwordHash: true },
  });
  console.log("hash berubah?", before?.passwordHash !== after?.passwordHash);

  // Uji konfirmasi tidak sama
  await page.fill('input[name="currentPassword"]', process.env.SEED_ADMIN_PASSWORD!);
  await page.fill('input[name="newPassword"]', "PasswordBaru123!");
  await page.fill('input[name="confirmPassword"]', "PasswordBeda123!");
  await page.click('form input[name="newPassword"] >> xpath=ancestor::form//button[@type="submit"]');
  await page.waitForTimeout(2000);
  const message2 = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("p")).find((p) =>
      /Konfirmasi password tidak sama|berhasil diubah/.test(p.textContent ?? ""),
    );
    return el ? el.textContent : null;
  });
  console.log("pesan konfirmasi:", message2);

  await prisma.$disconnect();
  await browser.close();
}

main();
