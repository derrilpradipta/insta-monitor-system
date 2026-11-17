# Pemantauan Email Belum Dibaca

Halaman `/email` menampilkan email yang **belum dibaca** di mailbox, diambil lewat
IMAP. Membaca email di sini **tidak** menandai email sebagai sudah dibaca di
mailbox asli — imapflow mengambil isi pesan dengan `BODY.PEEK[]`, yang secara
protokol tidak mengubah flag `\Seen`.

## Kenapa IMAP, bukan scraping webmail

Situs Instaprint (`instasiaga.com`) tidak punya fitur email sama sekali, dan
domainnya tidak punya MX record. Gmail juga tidak menyediakan halaman yang bisa
di-scrape dengan aman. Jalur resmi untuk membaca email adalah IMAP.

## 1. Siapkan App Password Gmail

Password akun Google biasa **akan ditolak** oleh IMAP. Yang dipakai adalah App
Password 16 karakter:

1. Aktifkan verifikasi 2 langkah di akun Google yang mau dipantau.
2. Buka <https://myaccount.google.com/apppasswords>.
3. Buat App Password baru (nama bebas, mis. `Instaprint Monitor`).
4. Salin 16 karakter yang muncul — hanya ditampilkan sekali.

Untuk Google Workspace, pastikan admin mengizinkan IMAP
(Admin Console → Apps → Google Workspace → Gmail → End User Access).

## 2. Isi environment

Tambahkan ke `.env` (lokal) **dan** ke Environment Variables Vercel:

```dotenv
MAIL_IMAP_HOST="imap.gmail.com"
MAIL_IMAP_PORT="993"
MAIL_IMAP_SECURE="true"
MAIL_IMAP_USER="akun@domain.com"
MAIL_IMAP_PASSWORD="abcdefghijklmnop"   # App Password 16 karakter
EMAIL_SYNC_SECRET="..."                  # opsional; kosong = pakai CRON_SECRET
```

Kalau kredensial belum diisi, halaman tetap terbuka dan menampilkan pesan
"Kredensial email belum diatur di server." — aplikasi tidak rusak.

## 3. Jadwalkan tiap jam

### Opsi A — cron-job.org (gratis, tanpa upgrade Vercel)

Vercel Hobby **tidak bisa** cron per jam: ekspresi seperti `0 * * * *` gagal saat
deploy dengan pesan *"Hobby accounts are limited to daily cron jobs"*.

1. Daftar di <https://cron-job.org> lalu buat cron job baru.
2. URL: `https://<domain-vercel>/api/email/sync?job=email`
3. Jadwal: **Every 1 hour**.
4. Tab Advanced → Headers, tambahkan:
   - `Authorization: Bearer <EMAIL_SYNC_SECRET>`
5. Simpan, lalu tekan **TEST RUN** untuk memastikan balasannya `{"ok":true,...}`.

### Opsi B — crontab VPS / PC yang menyala 24 jam

```cron
0 * * * * curl -s -X POST -H "x-cron-secret: $EMAIL_SYNC_SECRET" http://localhost:3000/api/email/sync
```

### Opsi C — penjadwal internal (Docker/VPS)

Set `ENABLE_INTERNAL_CRON=1`. Penjadwal di `src/lib/scheduler.ts` otomatis
menambahkan job email tiap jam **hanya jika** `MAIL_IMAP_USER` dan
`MAIL_IMAP_PASSWORD` terisi.

## 4. Penyegaran tampilan tiap jam

Halaman `/email` menyegarkan dirinya sendiri setiap jam lewat `router.refresh()`.
Itu hanya memperbarui **tampilan**; pengambilan data tetap tugas penjadwal di
atas, supaya data tetap terisi walau tidak ada tab yang terbuka. Penyegaran
dilewati saat tab tidak terlihat, dan dilakukan sekali saat tab kembali dibuka
bila sudah lewat satu jam.

## Cara kerja pengambilan

```
penjadwal (tiap jam)
      ↓  POST /api/email/sync  (+ secret)
IMAP: SEARCH seen:false  →  FETCH BODY.PEEK[]
      ↓
simpan ke tabel email_messages (kunci: Message-ID)
      ↓
halaman /email membaca database
```

- **Tidak menggandakan**: `message_id` unik; sync berikutnya memperbarui.
- **Status dibaca diselaraskan**: email yang dulu belum dibaca lalu dibaca di HP
  akan berubah jadi "sudah dibaca" di sini.
- **Tidak menandai dibaca**: pengambilan memakai `BODY.PEEK[]`.
- **Tercatat**: setiap proses masuk tabel `email_sync_runs` (berhasil/gagal,
  berapa ditemukan/baru/ditandai dibaca).

## Batasan

- Hanya folder `INBOX` yang dipantau (bisa dikembangkan).
- Isi lengkap email tidak disimpan — hanya cuplikan ~300 karakter, demi privasi
  dan ukuran database.
- Lampiran hanya dicatat keberadaannya (ikon klip), isinya tidak diunduh.
- Gmail membatasi IMAP untuk akun dengan 2FA tanpa App Password.
