# Pemantauan Email Belum Dibaca

Halaman `/email` menampilkan email yang **belum dibaca** dari beberapa mailbox
Gmail, diambil lewat **Composio** (Gmail API + OAuth).

Dua hal yang membedakannya dari fitur lain:

1. **Membaca di sini tidak menandai email sudah dibaca.** Hanya metadata yang
   diambil. Sudah diuji: query yang sama dijalankan dua kali, semua pesan tetap
   berlabel `UNREAD`.
2. **Riwayatnya terpisah** dari riwayat pengambilan data pesanan. Ada di
   `/email/riwayat`, bukan di `/history`.

## Kenapa Composio, bukan IMAP

Situs Instaprint tidak punya fitur email, dan domainnya tidak punya MX record.
Jalur IMAP butuh App Password 16 karakter dan gagal kalau admin Google Workspace
mematikan akses IMAP. Composio memakai OAuth: sekali klik "Connect Gmail", tanpa
menyentuh password.

Data email memang melewati server Composio. Kalau nanti ingin sepenuhnya lokal,
hanya `src/lib/email/composio.ts` yang perlu diganti.

## 1. Hubungkan tiap mailbox

Pasang CLI sekali:

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/ComposioHQ/composio/next/install.ps1 | iex
```

```bash
# Linux / macOS / WSL
curl -fsSL https://composio.dev/install | sh
```

> Di Git Bash/MSYS installer menolak jalan. Pakai PowerShell atau WSL.

Login, lalu sambungkan Gmail:

```bash
composio login            # buka URL yang muncul
composio login --poll     # jalankan setelah login di browser selesai

# Mailbox pertama
composio link gmail

# Mailbox kedua dan seterusnya WAJIB pakai --alias
composio link gmail --alias onlineorder

# Cek hasilnya
composio link gmail --list
```

Status harus **ACTIVE**. Kalau `EXPIRED`, sambungkan ulang.

## 2. Ambil nilai environment

```bash
# API key
python -c "import json;print(json.load(open('$HOME/.composio/user_data.json'))['api_key'])"

# projectId dan consumerUserId
python -c "import json;e=list(json.load(open('$HOME/.composio/tool-permissions-cache.json'))['entries'].values())[0];print(e['projectId']);print(e['consumerUserId'])"
```

ID tiap akun Gmail (`ca_...`) dari `composio link gmail --list`.

Isi `.env` **dan** Environment Variables Vercel:

```dotenv
COMPOSIO_API_KEY="uak_..."
COMPOSIO_PROJECT_ID="pr_..."
COMPOSIO_USER_ID="consumer-..."

MAIL_ACCOUNT_1_EMAIL="instaprint24@gmail.com"
MAIL_ACCOUNT_1_LABEL="Instaprint Pusat"
MAIL_ACCOUNT_1_CONNECTED_ACCOUNT_ID="ca_..."

MAIL_ACCOUNT_2_EMAIL="onlineorder@instaprint8.com"
MAIL_ACCOUNT_2_LABEL="Online Order"
MAIL_ACCOUNT_2_CONNECTED_ACCOUNT_ID="ca_..."

EMAIL_SYNC_SECRET="..."          # opsional; kosong = pakai CRON_SECRET
```

Menambah mailbox = tambah pasangan `MAIL_ACCOUNT_3_*`, lalu tab baru muncul
otomatis. `LABEL` hanya nama tab; kalau kosong dipakai alamat email.

> **Penting:** header `x-project-id` wajib disertakan. Tanpa itu daftar connected
> account terbaca kosong (0 item) meski akunnya ada.

## 3. Jadwalkan tiap jam 08.00–23.00 WIB

Jadwalnya ada di `vercel.json` memakai **Vercel Schedules** (pengganti Cron
Jobs), jadi tidak perlu layanan luar:

```json
"schedules": {
  "email-per-jam": {
    "schedule": "0 8-23 * * *",
    "timezone": "Asia/Jakarta",
    "path": "/api/email/sync",
    "requestMethod": "POST"
  }
}
```

Artinya: 08.00, 09.00, …, 23.00 WIB (16 kali sehari), lalu berhenti sampai
08.00 besok. Tanpa `?account`, kedua mailbox diperiksa sekaligus.

**Kenapa bukan Cron Jobs biasa?** Cron Jobs di paket Hobby dibatasi sekali
sehari; ekspresi per jam ditolak saat deploy dengan pesan *"Hobby accounts are
limited to daily cron jobs"*. Schedules memberi batas 15 menit di Hobby,
sehingga per jam aman.

**Presisi:** Hobby memakai jendela jitter 15 menit, jadi jadwal 08.00 bisa
benar-benar berjalan antara 08.00–08.15. Kalau butuh tepat menit, perlu Pro
(jitter 1 menit) atau penjadwal eksternal.

Autentikasi: Vercel mengirim `Authorization: Bearer <CRON_SECRET>` otomatis.
Route menerima **CRON_SECRET maupun EMAIL_SYNC_SECRET**, jadi penjadwal
eksternal tetap bisa dipakai tanpa mengubah kode.

### Kalau ingin di luar Vercel (opsional)

```cron
0 8-23 * * * curl -s -X POST -H "x-cron-secret: $EMAIL_SYNC_SECRET" http://localhost:3000/api/email/sync
```

Untuk Docker/VPS dengan penjadwal internal: set `ENABLE_INTERNAL_CRON=1`.
Jadwal internal memakai ekspresi yang sama (`0 8-23 * * *`, Asia/Jakarta).

## 4. Penyegaran tampilan tiap jam

Halaman menyegarkan dirinya sendiri tiap jam lewat `router.refresh()`. Itu hanya
memperbarui **tampilan**; pengambilan tetap tugas penjadwal di server, supaya
data terisi walau tidak ada tab terbuka. Penyegaran dilewati saat tab tidak
terlihat, dan dijalankan sekali saat tab kembali dibuka bila sudah lewat sejam.

## Laporan Excel

Tombol **Excel** mengunduh SATU file `.xlsx` yang memuat **semua mailbox
sekaligus**, apa pun tab yang sedang dibuka. Alasannya: laporan ini untuk
atasan, jadi tidak perlu mengunduh satu per akun.

Susunan file:

```
Baris 1  Laporan Email — Semua Akun
Baris 2  Dicetak … WIB · Email belum dibaca · 15 email
         · Instaprint Pusat: 8 · Online Order: 7
Baris 3  Instaprint Pusat — instaprint24@gmail.com (8 email)
Baris 4  header kolom
Baris 5+ 8 email akun pertama
(baris kosong)
         Online Order — onlineorder@instaprint8.com (7 email)
         header kolom
         7 email akun kedua
```

Tiap akun punya subjudul sendiri (latar biru muda) dan header kolom diulang,
jadi tiap bagian terbaca mandiri. Nomor urut jalan terus lintas akun.

Kolom: No, Akun, Pengirim, Alamat Email, Subjek, Cuplikan, Waktu Masuk,
Lampiran, Status.

Isi mengikuti tab yang aktif: **Belum dibaca** (bawaan) atau **Semua**.
Endpoint: `GET /api/export/email?filter=belum|semua`.

## Progres pengecekan nyata

Tombol **Cek sekarang** membuka dialog yang memanggil
`POST /api/email/sync?account=...&stream=1`. Server membalas NDJSON per tahap,
sama seperti tombol "Ambil data" pada pesanan:

| Tahap | Angka yang dilaporkan |
|---|---|
| Menghubungi Gmail | — |
| Mengambil email belum dibaca | halaman ke-N, jumlah email terkumpul |
| Menyimpan ke database | email ke-N dari total |
| Menyelaraskan status dibaca | jumlah yang dikeluarkan |

Persentase dihitung dari angka-angka itu dan tidak pernah mundur. Tidak ada
bagian yang ditebak; satu-satunya yang berjalan sendiri adalah penghitung detik.

## Daftar bersifat dinamis, bukan akumulatif

Setiap pengecekan membandingkan isi database dengan daftar UNREAD di Gmail:

- email yang **masih** belum dibaca → tetap di daftar
- email yang **sudah dibaca** di Gmail → ditandai `isRead`, keluar dari daftar
- email **baru** yang belum dibaca → masuk

Penyelarasan ini hanya berjalan kalau pengambilan tidak terpotong batas 500
email, supaya email di luar jangkauan tidak salah dianggap sudah dibaca.

Dibuktikan dengan menyisipkan satu baris uji yang tidak ada di Gmail: setelah
sync, baris itu berubah jadi `isRead = true` dan jumlah belum-dibaca kembali
sama dengan angka nyata di Gmail.

## Posisi menu

Email ada di **Menu utama** (bersama Deadline), bukan di Pendukung. Riwayat
pengecekan email tetap terpisah di `/email/riwayat`.

## Struktur kode

```
src/lib/email/accounts.ts   ← daftar mailbox dari environment
src/lib/email/composio.ts   ← satu-satunya yang bicara ke Composio
src/lib/email/sync.ts       ← simpan ke DB, selaraskan status dibaca
src/app/api/email/sync      ← endpoint penjadwal (?account= untuk satu akun)
src/app/(dashboard)/email           ← halaman dengan tab per akun
src/app/(dashboard)/email/riwayat   ← riwayat pengecekan (terpisah)
src/app/api/export/email            ← laporan .xlsx
src/components/email/email-sync-controls.tsx  ← dialog progres nyata
```

`sync.ts` hanya memakai antarmuka `connect()`, `fetchUnread()`, `close()` dari
`composio.ts`, jadi sumber data bisa diganti tanpa menyentuh sisanya.

## Cara kerja

```
penjadwal (tiap jam)
      ↓  POST /api/email/sync  (+ secret)
untuk setiap akun: Composio → Gmail API "is:unread in:inbox"
      ↓
simpan ke email_messages (unik: account_email + message_id)
      ↓
halaman /email membaca database, difilter per akun
```

- **Tidak menggandakan**: kunci unik gabungan akun + Message-ID.
- **Tidak tercampur**: tiap baris menyimpan `account_email`.
- **Satu akun gagal tidak menghentikan akun lain**; kegagalan dilaporkan
  per akun di `email_sync_runs`.
- **Status dibaca diselaraskan**: email yang dibaca di HP hilang dari daftar
  belum-dibaca pada sync berikutnya.

## Jebakan yang sudah ditangani

| Jebakan | Penanganan |
|---|---|
| `max_results` default **1** → hanya dapat satu email | selalu diisi eksplisit |
| `nextPageToken` bisa `''` (string kosong) | hanya token berisi dianggap lanjut |
| Tanpa `x-project-id` daftar akun terbaca 0 | header selalu dikirim |
| Akun kedua ditolak tanpa `--alias` | didokumentasikan di langkah 1 |
| `sender` berbentuk `Nama <alamat>` | dipecah jadi nama + alamat |
| Kredensial kosong meninggalkan run RUNNING | pembaca dibuat di dalam `try` |

## Batasan

- Hanya `in:inbox` yang dipantau.
- Isi lengkap tidak disimpan — hanya cuplikan ~300 karakter.
- Lampiran hanya ditandai keberadaannya, isinya tidak diunduh.
- Kuota Composio Hobby: 100.000 panggilan/bulan. Dua akun per jam ≈ 1.440/bulan.
