/**
 * Seed awal: akun admin + daftar cabang Instaprint.
 * Jalankan: npx tsx scripts/seed.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Cabang diambil dari nilai kolom "Outlet" pada situs sumber + cabang asal transfer order. */
const BRANCHES = [
  { branchName: "Instaprint Pusat", branchCode: "PUSAT" },
  { branchName: "Instaprint Gading Serpong", branchCode: "GS" },
  { branchName: "Instaprint BSD", branchCode: "BSD" },
];

async function main() {
  const name = process.env.SEED_ADMIN_NAME ?? "Administrator";
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@instaprint.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error("SEED_ADMIN_PASSWORD belum diset di .env");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role: "ADMIN", isActive: true },
    create: { name, email, passwordHash, role: "ADMIN", isActive: true },
  });
  console.log(`[seed] admin siap: ${user.email} (${user.role})`);

  for (const branch of BRANCHES) {
    const row = await prisma.branch.upsert({
      where: { branchCode: branch.branchCode },
      update: { branchName: branch.branchName, isActive: true },
      create: { ...branch, isActive: true },
    });
    console.log(`[seed] cabang: ${row.branchName} (${row.branchCode})`);
  }

  // Catatan: hanya satu akun (ADMIN) yang dipakai. Peran PIMPINAN/STAFF tetap
  // tersedia di skema bila nanti dibutuhkan, tapi tidak dibuatkan akun otomatis.
}

main()
  .catch((error) => {
    console.error("[seed] gagal", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
