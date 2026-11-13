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

## Struktur

```
prisma/
  schema.prisma        # 10 tabel + enum
  init.sql             # DDL awal (dipakai docker-compose)
scripts/
  seed.ts              # akun admin + cabang awal
  run-daily.ts         # jalankan pengambilan harian manual
  run-monthly.ts       # jalankan pemeriksaan bulanan manual
  test-scraper.ts      # uji scraper tanpa database
  probe-*.ts           # skrip inspeksi struktur website sumber
src/
  app/(dashboard)/     # halaman: orders, deadline, monthly-review, history, notifications, profile, analysis
  app/login/           # halaman login
  app/api/             # scraper, monthly, ai, cron
  actions/             # server actions (auth, checklist, notifikasi)
  components/          # UI + komponen fitur
  lib/
    scraper/           # klien Playwright website sumber
    sync.ts            # orkestrasi scraping, upsert, sinkronisasi, pemeriksaan bulanan
    auth.ts            # sesi & password
    analytics.ts, ai.ts, notifications.ts, scheduler.ts, time.ts
```

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

Login awal: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` dari `.env`
(saat ini akun tunggal `frankyinsta`). Segera ganti password lewat menu Profil setelah login pertama.

### Perintah berguna

```bash
npx tsx scripts/run-daily.ts 2026-11-11     # ambil data tanggal tertentu
npx tsx scripts/run-monthly.ts 2026 11      # pemeriksaan bulanan
npx tsx scripts/test-scraper.ts 2026-11-11  # uji scraper tanpa menyimpan
npx tsx scripts/smoke-ui.ts                 # smoke test UI + screenshot
npx tsx scripts/reclassify-status.ts        # hitung ulang kategori status
npx tsx scripts/clean-data.ts               # rapikan nama pelanggan/produk tersimpan
npx tsx scripts/backfill-products.ts        # isi produk kosong dari snapshot
npx tsx scripts/reset-review-test.ts        # reset konfirmasi checklist hasil uji
npx tsx scripts/test-session-expiry.ts      # uji sesi 30 menit idle
npx tsx scripts/test-password-security.ts   # uji verifikasi password lama
npx tsx scripts/test-login-lock.ts          # uji pembatasan percobaan login
npx tsx scripts/test-failure-path.ts        # uji kegagalan scraper (data tidak rusak)
npx tsx scripts/test-api.ts                 # uji proteksi API & cron secret
```

## Struktur website sumber (hasil inspeksi)

| Bagian | Detail |
| --- | --- |
| Login | `POST /login/process`, field `username`, `password` (reCAPTCHA nonaktif) |
| Daftar pesanan | `GET /order_list?date1=DD-MM-YYYY&date2=DD-MM-YYYY&per_page=<offset>` |
| Tabel | `#dataTable`, 10 baris/halaman, `per_page` = **offset** (0, 10, 20, …) |
| Kolom | `#`, Aksi, Outlet, Jenis, Status, Nota, Tanggal Order, Tanggal Bayar, Produk, Pelanggan |
| ID pesanan | atribut `data-id` pada tombol aksi tiap baris |
| Detail + tenggat | `GET /workflow_order/detail/<id>` → Nota, Outlet, Status Pembayaran, Tanggal Order, **Deadline**, Pelanggan, PIC, deadline per produk |
| Status selesai | `PESANAN SUDAH DITERIMA` (status diawali `BATAL` untuk pembatalan) |

Catatan penting: deadline **tidak** ada di halaman daftar, sehingga setiap pesanan diperkaya dari
halaman detail. Nilai `01-01-1970` dari sumber dianggap kosong.

## Penjadwalan

`ENABLE_INTERNAL_CRON=1` menyalakan penjadwal internal (sudah aktif di `.env`). Jadwal default
Asia/Jakarta:

| Waktu | Job | Aksi |
| --- | --- | --- |
| 23.30 harian | `daily` | ambil semua pesanan bertanggal masuk hari itu (semua halaman + detail tenggat) |
| 00.05 harian | `sync` | sinkronkan status pesanan yang masih belum selesai |
| 08.00 harian | `reminder` | notifikasi tenggat besok, pesanan terlambat, data usang |
| tgl 1, 01.00 | `monthly` | pemeriksaan bulanan bulan sebelumnya |

Ada **catch-up**: jika server baru hidup setelah 23.30 terlewat (PC/VPS mati), sistem memeriksa
apakah data harian kemarin sudah ada; kalau belum, scraping dijalankan sekali saat start. Job yang
bertabrakan akan dilewati (ada cek `RUNNING`), jadi tidak ada dua scraping berjalan bersamaan.

Ekspresi cron bisa diubah lewat env `CRON_DAILY`, `CRON_SYNC`, `CRON_REMINDER`, `CRON_MONTHLY`
(berguna untuk menguji dalam hitungan menit).

Alternatif yang lebih tahan banting — crontab VPS memanggil endpoint:

```cron
CRON_SECRET=isi-secret
30 23 * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "http://127.0.0.1:3000/api/cron?job=daily"
0  8 * * *  curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "http://127.0.0.1:3000/api/cron?job=reminders"
0  2 * * *  curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "http://127.0.0.1:3000/api/cron?job=cleanup"
```

Zona waktu container disarankan `TZ=Asia/Jakarta`; jadwal cron internal sudah memakai zona tersebut.

## Deployment (Docker)

```bash
cp .env.example .env    # isi AUTH_SECRET, POSTGRES_PASSWORD, kredensial scraper, AI
docker compose up -d --build
docker compose exec app npx tsx scripts/seed.ts   # sekali, buat akun admin
```

Image dasar memakai `mcr.microsoft.com/playwright` sehingga Chromium sudah tersedia.

### Pencadangan

```bash
DATABASE_URL="postgresql://..." ./scripts/backup.sh ./backups
```

Simpan hasil backup di luar server (S3/Google Drive). Untuk Neon, aktifkan juga point-in-time
recovery di dashboard Neon.

## Catatan operasional

- Semua timestamp disimpan UTC; perhitungan tanggal operasional memakai Asia/Jakarta (UTC+7).
- Pengambilan data bersifat **idempotent** (upsert berdasarkan `branch_id + source_order_id`).
- Kegagalan scraping tidak menghapus data dan tidak mengubah status; kesalahan dicatat di riwayat.
- Pesanan yang tidak ditemukan saat pemeriksaan **tidak** otomatis dianggap selesai.
- Status sumber dan status pemantauan disimpan terpisah; konfirmasi manual tidak ditimpa sinkronisasi.
- Akun scraper hanya bisa melihat outlet `Instaprint Pusat`. Pesanan transfer dari cabang lain muncul
  dengan penanda `Transfer Order (Instaprint …)` pada nama pelanggan.
- `SELESAI DIKERJAKAN` = produksi selesai (belum diserahkan). Status `SELESAI` hanya untuk
  `PESANAN SUDAH DITERIMA` / sudah diambil.
- Halaman detail sumber memakan satu request per pesanan. Mode `fetchDetails: "smart"` hanya membuka
  detail untuk pesanan baru / berubah status, sehingga pemeriksaan bulanan tetap cepat.
- Kunci `AI_API_KEY` di `.env` saat ini memakai kunci gateway 9Router lokal; ganti dengan kunci
  khusus aplikasi ini sebelum dipakai produksi.

