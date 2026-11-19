# Instaprint Monitoring System

Aplikasi internal untuk memantau pesanan Instaprint dari seluruh cabang. Data diambil otomatis
dari website internal Instaprint (`instasiaga.com`) menggunakan Playwright di sisi server, disimpan
ke database sendiri (PostgreSQL), lalu ditampilkan sebagai dashboard operasional.

> Aplikasi ini **hanya membaca** website internal. Tidak ada perubahan data yang dikirim ke sana.

## Fitur

- **Orderan** — pesanan dengan tanggal masuk kemarin (WIB), ringkasan per cabang, filter, pencarian,
  pengurutan, dan pagination di sisi server.
- **Deadline** — pesanan berdasarkan tanggal tenggat (default besok), date picker, ringkasan
  selesai/belum/terlambat per cabang.
- **Pemeriksaan Bulanan** — ambil ulang seluruh pesanan satu bulan, cocokkan status, lalu checklist
  pimpinan per cabang (dicatat siapa & kapan).
- **Riwayat Pengambilan Data** — log setiap proses (harian, sinkronisasi, bulanan) beserta detail dan
  tombol jalankan ulang.
- **Notifikasi** — pengambilan berhasil/gagal, tenggat besok, pesanan terlambat, pemeriksaan selesai,
  pesanan usang, kesalahan sinkronisasi.
- **Analisis AI** — ringkasan & rekomendasi dari data aktual (endpoint OpenAI-compatible).
- **Keamanan** — sesi 30 menit idle, cookie HttpOnly/Secure/SameSite, bcrypt, proteksi session
  fixation, pembatasan percobaan login, ganti password + pencabutan sesi lain.

## Teknologi

Next.js 16 (App Router, TypeScript) · Tailwind CSS v4 · shadcn-style UI + lucide-react ·
PostgreSQL + Prisma 6 (driver adapter `pg`) · Playwright · Recharts · node-cron · Docker.

## Setup lokal

```bash
npm install
cp .env.example .env      # isi DATABASE_URL, DIRECT_URL, AUTH_SECRET, kredensial scraper
npx prisma generate
# Terapkan skema (Neon/Postgres):
psql "$DIRECT_URL" -f prisma/init.sql     # sekali saja untuk database baru
npx tsx scripts/seed.ts                    # buat akun admin & cabang
npm run dev
```
