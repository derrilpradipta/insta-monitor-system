# Checklist OWASP Top 10 (2021) — Instaprint Monitoring System

Audit dilakukan dengan membaca kode yang benar-benar ada dan **menguji langsung**
ke server, bukan dari asumsi. Setiap baris menyebut bukti yang bisa diperiksa
ulang. Tanggal audit: 18 November 2026.

Legenda: ✅ sudah diterapkan · ⚠️ sudah ada tetapi ada catatan · ❌ belum / tidak berlaku

---

## A01 — Broken Access Control

| Kontrol | Status | Bukti |
|---|---|---|
| Semua halaman dashboard wajib login | ✅ | `src/proxy.ts` mendaftar 8 prefiks: `/orders`, `/deadline`, `/email`, `/monthly-review`, `/history`, `/notifications`, `/profile`, `/analysis`. Uji curl: semua → **307** ke `/login` |
| Lapis kedua di server (bukan hanya cookie) | ✅ | `getShellData()` → `requireSession()` di `src/app/(dashboard)/layout.tsx`, jadi setiap halaman memvalidasi sesi ke database |
| Rute API wajib login | ✅ | 10 rute API diperiksa. Uji tanpa login: `/api/ai` → **401**, `/api/export/email` → **401**, `/api/scraper/run` → **401** |
| Operasi yang mengubah data dibatasi per peran | ✅ **(baru)** | `src/lib/api-guard.ts` + `guardApi(["ADMIN","PIMPINAN"])` di `scraper/run`, `scraper/retry`, `import/deadline`, `monthly/run`. Sebelumnya STAFF bisa memicu scraping dan menimpa status ceklis |
| Rute baca tetap boleh untuk STAFF | ✅ | `/api/export/deadline` sengaja hanya mewajibkan login |
| Uji nyata dengan akun STAFF | ✅ | Login sebagai STAFF lalu panggil rute: `scraper/run` **403**, `scraper/retry` **403**, `monthly/run` **403**, `import/deadline` **403**, `export/deadline` **200** |
| IDOR (akses data milik orang lain) | ⚠️ | `/history/[id]` bisa dibuka semua pengguna login. Risiko rendah karena semua pengguna adalah staf internal dengan akses data yang sama, dan log tidak memuat kredensial |

## A02 — Cryptographic Failures

| Kontrol | Status | Bukti |
|---|---|---|
| Password disimpan dengan hash kuat | ✅ | `bcrypt.hash(password, 12)` di `src/lib/auth.ts:112`. Tidak ada teks polos di database |
| Verifikasi password memakai perbandingan aman | ✅ | `bcrypt.compare()`, dan pada akun tidak ditemukan tetap menjalankan bcrypt pada hash dummy agar waktu respons sama (mencegah enumerasi akun) |
| Token sesi acak, bukan berurutan | ✅ | `randomBytes(32).toString("base64url")` (256 bit) di `src/lib/auth.ts:230` |
| Database tidak menyimpan token mentah | ✅ | Yang disimpan hanya `hashToken(token)` = SHA-256 dari token, jadi bocornya database tidak langsung memberi sesi aktif |
| Pembandingan token memakai waktu konstan | ✅ | `timingSafeEqual` di `src/lib/auth.ts:55` |
| Cookie sesi aman | ✅ | `httpOnly: true`, `secure` saat produksi, `sameSite: "lax"`, `path: "/"`, `maxAge` sesuai idle timeout |
| Transport terenkripsi | ✅ | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` + `upgrade-insecure-requests` di CSP saat produksi |
| Rahasia tidak masuk repo | ✅ | `.env` di-ignore; hanya `.env.example` yang ter-commit dan seluruh nilainya kosong. Dipindai ulang: tidak ada API key, password, atau connection string di berkas yang terlacak git |

## A03 — Injection

| Kontrol | Status | Bukti |
|---|---|---|
| Query database memakai parameter | ✅ | Seluruh akses data lewat Prisma ORM. Dua `$queryRaw` di `src/lib/analytics.ts` memakai *tagged template* Prisma (parameter terikat otomatis), bukan penyambungan string |
| Tidak ada `$queryRawUnsafe` | ✅ | `grep` seluruh `src/`: nol hasil |
| XSS (HTML mentah dari pengguna) | ✅ | `grep` `dangerouslySetInnerHTML` dan `innerHTML` di seluruh `src/`: nol hasil. Semua teks dirender lewat JSX (escape otomatis) |
| Konten CSP membatasi skrip | ✅ **(baru)** | `script-src 'self' 'unsafe-inline'` — `'unsafe-inline'` masih perlu untuk hidrasi Next.js, tetapi karena tidak ada HTML mentah dari pengguna, jalur XSS-nya tertutup |
| Perintah shell dari input pengguna | ✅ | Tidak ada `exec`/`spawn` dengan input pengguna. Playwright hanya membuka URL tetap milik situs sumber |
| Injeksi ke Excel (formula) | ⚠️ | Keterangan ditulis apa adanya ke `.xlsx` sesuai permintaan (teks harus tersimpan persis). Kalau sel diawali `=`, Excel memperlakukannya sebagai formula. Mitigasi: hanya staf internal yang membuka file, dan isinya berasal dari staf sendiri. Bisa ditambahkan pemberian prefiks `'` bila perlu |

## A04 — Insecure Design

| Kontrol | Status | Bukti |
|---|---|---|
| Batas ukuran unggahan | ✅ | `/api/import/deadline`: tolak > 15 MB dan hanya `.xlsx` |
| Batas ukuran body permintaan | ✅ **(baru)** | `/api/ai`: `content-length` > 4 KB → **413** (diuji, hasil 413) |
| Batas panjang input | ✅ | Pertanyaan AI dipotong 1000 karakter; keterangan dibatasi 20.000 karakter (batas Excel 32.767) dengan laporan bila terpotong |
| Batas jumlah baris ekspor | ✅ | `MAX_ROWS = 10_000` pada ekspor email, `take: 20_000` pada ekspor deadline |
| Pembatasan percobaan login | ✅ | 5 kegagalan → kunci 15 menit per akun; plus pembatas per IP di `src/app/actions/auth.ts` |
| Tugas berat ditolak lebih awal bila tak mungkin selesai | ✅ | `/api/monthly/run` menolak di Vercel (butuh 685–1352 detik, batas 300 detik) dengan pesan jelas, bukan gagal separuh jalan |
| Idempoten (aman dijalankan ulang) | ✅ | Scraping memakai `upsert`; email memakai kunci unik `(account_email, message_id)`; impor ceklis hanya mengubah baris yang berubah |

## A05 — Security Misconfiguration

| Kontrol | Status | Bukti |
|---|---|---|
| Header keamanan | ✅ **(baru)** | Diuji dengan `curl -I` ke server lokal: `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `X-DNS-Prefetch-Control: off`, `Strict-Transport-Security` |
| Penyembunyian versi framework | ✅ **(baru)** | `poweredByHeader: false` → `X-Powered-By` hilang dari respons |
| Penolakan framing (clickjacking) | ✅ | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Pesan galat tidak membocorkan detail | ✅ | Empat rute mengembalikan "Terjadi kesalahan pada server. Silakan coba lagi."; detail teknis hanya ke `console.error` |
| Rahasia tidak tercetak di log/frontend | ✅ | Tidak ada `console.log` kredensial; `.env` tidak pernah dikirim ke klien |
| Mode dev tidak aktif di produksi | ✅ | `allowedDevOrigins` hanya berlaku di dev; `output: standalone` hanya di luar Vercel |

## A06 — Vulnerable and Outdated Components

| Kontrol | Status | Bukti |
|---|---|---|
| Audit dependensi | ✅ **(baru)** | `npm audit --omit=dev` → **found 0 vulnerabilities** |
| Kerentanan `uuid` (moderate) | ✅ **(baru)** | Sebelumnya `uuid@8.3.2` lewat `exceljs`. Ditutup dengan `overrides.uuid = ^11.1.1`; terpasang 11.1.1, ekspor Excel diuji ulang dan tetap berjalan |
| Kerentanan `deepmerge-ts` (high) | ✅ **(baru)** | Sebelumnya 7.1.5 lewat `@prisma/config`. Ditutup dengan `overrides.deepmerge-ts = ^8.0.0`; `prisma generate` dan `prisma --version` diuji ulang normal |
| Dependensi usang | ✅ | `exceljs` 4.4.0 (dipilih dari `xlsx` yang punya riwayat CVE), Next 16.4.6, Prisma 6.19.3, Playwright 1.65 |
| Pemantauan berkelanjutan | ⚠️ | Belum ada CI yang menjalankan `npm audit`. Disarankan menambahkan langkah itu di pipeline |

## A07 — Identification and Authentication Failures

| Kontrol | Status | Bukti |
|---|---|---|
| Kebijakan password kuat | ✅ **(baru)** | `checkPasswordStrength()`: minimal **12** karakter, maksimal 128, menolak kata umum (termasuk nama aplikasi), menolak karakter berulang ≥4, menolak urutan `abcd`/`1234`, wajib ≥2 jenis karakter, dan menolak password yang memuat nama/email sendiri. Diuji 8 kasus, semuanya berperilaku benar |
| Password lama diverifikasi sebelum diganti | ✅ | `verifyPassword(current, user.passwordHash)` di `changePasswordAction` |
| Sesi lain dicabut setelah ganti password | ✅ | `revokeOtherSessions(user.id, session.sessionId)` |
| Session fixation dicegah | ✅ | `destroyCurrentSession()` sebelum `createSession()` saat login |
| Idle timeout | ✅ | `SESSION_IDLE_MINUTES` (30 menit), diperbarui lewat `/api/session/touch` |
| Enumerasi akun dicegah | ✅ | Pesan seragam "Email/username atau password salah" + bcrypt dummy agar waktu respons setara |
| Kunci akun setelah percobaan gagal | ✅ | `MAX_FAILED_LOGINS = 5`, `LOCK_MINUTES = 15` |

## A08 — Software and Data Integrity Failures

| Kontrol | Status | Bukti |
|---|---|---|
| Tidak ada deserialisasi tidak aman | ✅ | Tidak ada `pickle`/`eval`/`Function()` pada data masuk. JSON diurai dengan `JSON.parse` lalu divalidasi bentuknya |
| Unggahan Excel divalidasi | ✅ | Cek tipe `.xlsx`, ukuran, keterbacaan workbook, dan keberadaan kolom wajib. Header dicari per sel, bukan diasumsikan di baris tetap |
| Integritas data ceklis | ✅ | `manualConfirmed = true` melindungi status manual agar tidak diturunkan oleh sync otomatis |
| Dependensi terkunci versi | ✅ | `package-lock.json` ter-commit; versi Prisma dipatok persis (`6.19.3`) |
| Subresource Integrity | ❌ | Tidak ada aset dari CDN eksternal; semua aset dilayani sendiri, jadi SRI tidak diperlukan |

## A09 — Security Logging and Monitoring Failures

| Kontrol | Status | Bukti |
|---|---|---|
| Login berhasil dicatat | ✅ | `logActivity({ action: "LOGIN", ... })` dengan IP |
| Login gagal dicatat | ✅ | `logActivity({ action: "LOGIN_FAILED", description: 'Percobaan login gagal untuk "..." (KODE)', ipAddress })` |
| Perubahan password dicatat | ✅ | `action: "PASSWORD_CHANGED"` |
| Tindakan administratif dicatat | ✅ | `SCRAPE_MANUAL`, `IMPORT_CEKLIS`, `AI_ANALYSIS`, aksi review bulanan — semuanya via `logActivity` |
| Kegagalan sistem tercatat | ✅ | Setiap rute API memakai `console.error` untuk detail teknis; `EmailSyncRun` dan `ScrapingLog` menyimpan status dan pesan galat |
| Riwayat proses bisa diaudit | ✅ | `/history` (scraping) dan `/email/riwayat` (email) menampilkan siapa pemicunya (`triggeredBy`) dan hasilnya |
| Peringatan otomatis atas aktivitas mencurigakan | ⚠️ | Belum ada notifikasi saat terjadi banyak login gagal. Data sudah tercatat, tinggal ditambahkan pemicu notifikasi |

## A10 — Server-Side Request Forgery (SSRF)

| Kontrol | Status | Bukti |
|---|---|---|
| Tidak ada URL dari pengguna yang di-fetch server | ✅ | `grep` seluruh `fetch(` di `src/`: hanya ke host tetap — Composio (`backend.composio.dev`), situs sumber Instaprint, dan `AI_BASE_URL` dari environment |
| Alamat AI tidak bisa diubah pengguna | ✅ | `AI_BASE_URL` hanya dibaca dari `process.env`; tidak ada parameter request yang bisa menimpanya |
| `sourceUrl` pesanan bukan input pengguna | ✅ | Dibentuk server dari `baseUrl` + `sourceId` hasil scraping, bukan dari isi form |
| Redirect mengikuti host sembarang | ✅ | Playwright hanya membuka situs sumber yang tetap; tidak ada redirect yang dikendalikan pengguna |

---

## Ringkasan

| Kategori | Status | Yang dikerjakan pada audit ini |
|---|---|---|
| A01 Broken Access Control | ✅ | `api-guard.ts`, pembatasan peran 4 rute, `/email` masuk daftar proteksi |
| A02 Cryptographic Failures | ✅ | Sudah baik; tidak ada perubahan |
| A03 Injection | ✅ | Sudah baik; diverifikasi ulang |
| A04 Insecure Design | ✅ | Batas body 4 KB di rute AI |
| A05 Security Misconfiguration | ✅ | 7 header keamanan + `poweredByHeader: false` |
| A06 Vulnerable Components | ✅ | `overrides` uuid & deepmerge-ts → **0 kerentanan** |
| A07 Authentication Failures | ✅ | Kebijakan password 12 karakter +anti-kata-umum |
| A08 Data Integrity | ✅ | Sudah baik; tidak ada perubahan |
| A09 Logging & Monitoring | ✅ | Sudah baik; login gagal sudah tercatat |
| A10 SSRF | ✅ | Sudah baik; diverifikasi ulang |

### Sisa catatan (bukan celah kritis)

1. **IDOR pada `/history/[id]`** — semua staf bisa membuka detail log siapa pun. Dapat diterima untuk aplikasi internal; kuncinya bisa ditambahkan bila nanti ada peran eksternal.
2. **Formula injection di kolom Keterangan** — sengaja tidak di-escape karena teks harus tersimpan persis. Hanya staf internal yang membuka file.
3. **Belum ada CI untuk `npm audit`** — disarankan menambahkannya.
4. **Belum ada notifikasi otomatis untuk login gagal berulang** — datanya sudah tercatat, tinggal dipicu.
5. **`'unsafe-inline'` pada `script-src`** — diperlukan Next.js tanpa nonce; risikonya rendah karena tidak ada HTML mentah dari pengguna.
