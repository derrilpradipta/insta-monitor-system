/**
 * Kecepatan balas email, dihitung dari Gmail lewat Composio.
 *
 * Satu baris = satu percakapan (thread Gmail), bukan satu email. Kalau satu
 * pelanggan mengirim tiga email lalu dibalas sekali, itu tetap dihitung satu
 * percakapan — kalau dihitung per email, satu balasan akan terlihat seperti
 * membalas tiga email sekaligus dan angka rata-ratanya jadi menipu.
 *
 * Cara menentukan balasan: pesan keluar (in:sent) pertama di thread yang sama
 * yang waktunya SESUDAH pesan masuk pertama. Tidak memakai header In-Reply-To
 * karena Composio tidak mengembalikannya pada mode metadata.
 *
 * Semua pengambilan memakai `verbose: false` — hanya metadata. Status
 * belum-dibaca di mailbox tidak berubah.
 */

import { readMailAccounts, type ComposioConfig, type MailAccount } from "@/lib/email/accounts";

/** Batas pesan per arah per akun; menjaga satu kali perbarui tetap di bawah 60 detik. */
const MAX_PER_ARAH = 250;
const PER_PAGE = 50;

/** Offset WIB, dipakai untuk menghitung jam kerja. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Jam kerja Instaprint per hari (WIB), 0 = Minggu.
 *
 * Diberikan langsung oleh Derril: Senin–Jumat 08.00–22.00, Sabtu 09.00–18.00,
 * Minggu 11.00–20.00. Toko cetak buka tiap hari, jadi tidak ada hari libur
 * mingguan — jangan kembalikan ke asumsi Senin–Jumat 08.00–17.00.
 */
const JADWAL_KERJA: Record<number, { buka: number; tutup: number }> = {
  0: { buka: 11, tutup: 20 }, // Minggu
  1: { buka: 8, tutup: 22 }, // Senin
  2: { buka: 8, tutup: 22 }, // Selasa
  3: { buka: 8, tutup: 22 }, // Rabu
  4: { buka: 8, tutup: 22 }, // Kamis
  5: { buka: 8, tutup: 22 }, // Jumat
  6: { buka: 9, tutup: 18 }, // Sabtu
};

/** Ringkasan jam kerja untuk ditampilkan di halaman dan laporan. */
export const JAM_KERJA_RINGKAS = "Sen–Jum 08.00–22.00 · Sab 09.00–18.00 · Min 11.00–20.00";

export type PesanRingkas = {
  messageId: string;
  threadId: string;
  sender: string | null;
  subject: string;
  waktu: Date;
};

export type HasilBalas = {
  threadId: string;
  subject: string;
  fromName: string | null;
  fromAddress: string;
  receivedAt: Date;
  repliedAt: Date | null;
  replyMinutes: number | null;
  workMinutes: number | null;
  isAutomated: boolean;
  inboundCount: number;
};

type FetchResponse = {
  error?: unknown;
  data?: {
    messages?: {
      messageId?: string;
      threadId?: string;
      sender?: string;
      subject?: string;
      messageTimestamp?: string;
    }[];
    nextPageToken?: string;
  } | null;
};

/**
 * Alamat yang jelas bukan manusia: newsletter, notifikasi sistem, robot.
 * Dipakai untuk memisahkan "email pelanggan" dari "email otomatis" supaya
 * angka "belum dibalas" tidak dipenuhi hal yang memang tidak perlu dibalas.
 */
const POLA_OTOMATIS = /^(no-?reply|do-?not-?reply|donotreply|notification|notifications|notify|newsletter|mailer-daemon|postmaster|bounce|bounces|alert|alerts|automated|robot|bot)([+._-]|$)/i;

/** Domain yang seluruh pesannya bersifat pemberitahuan. */
const DOMAIN_OTOMATIS = new Set([
  "google.com",
  "googlemail.com",
  "facebookmail.com",
  "linkedin.com",
  "pinterest.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "apple.com",
  "microsoft.com",
  "openai.com",
  "github.com",
  "shopee.co.id",
  "tokopedia.com",
  // Layanan stok foto / desain: promosi berkala, bukan pelanggan.
  "creativefabrica.com",
  "depositphotos.com",
  "freepik.com",
  "canva.com",
  "shutterstock.com",
]);

export function isAlamatOtomatis(address: string, alamatSendiri: string[] = []): boolean {
  const a = (address ?? "").trim().toLowerCase();
  if (!a.includes("@")) return false;

  // Email dari mailbox milik kita sendiri bukan pekerjaan pelanggan. Contoh
  // nyata: onlineorder@ meneruskan pesanan ke bsd@ dan instaprintgs@ — 145 dari
  // 279 "belum dibalas" ternyata surat internal, bukan pelanggan yang menunggu.
  if (alamatSendiri.some((s) => s.toLowerCase() === a)) return true;

  const [lokal, domain] = a.split("@") as [string, string];
  if (POLA_OTOMATIS.test(lokal)) return true;
  if (DOMAIN_OTOMATIS.has(domain)) return true;
  return false;
}

/** Balasan otomatis (libur, auto-reply) tidak dihitung sebagai balasan manusia. */
function isBalasanOtomatis(subject: string): boolean {
  return /^(auto(matic)?[- ]?reply|out of office|balasan otomatis|di luar kantor)/i.test(
    (subject ?? "").trim(),
  );
}

function parseSender(raw: string | null | undefined): { name: string | null; address: string } {
  const teks = (raw ?? "").trim();
  if (!teks) return { name: null, address: "(tanpa pengirim)" };

  const cocok = teks.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (cocok) {
    const nama = cocok[1]!.replace(/^["']|["']$/g, "").trim();
    return { name: nama || null, address: cocok[2]!.trim().toLowerCase() };
  }
  return { name: null, address: teks.toLowerCase() };
}

/**
 * Menit kerja antara dua waktu.
 *
 * Menghitung hanya jam buka Instaprint (lihat JADWAL_KERJA), dalam WIB. Email
 * Jumat 21.30 yang dibalas Sabtu 09.30 = 90 menit kerja (bukan 12 jam), karena
 * itulah beban kerja nyata. Hari libur nasional belum diperhitungkan.
 */
export function menitKerja(mulaiMs: number, selesaiMs: number): number {
  if (!(selesaiMs > mulaiMs)) return 0;

  const mulai = mulaiMs + WIB_OFFSET_MS;
  const selesai = selesaiMs + WIB_OFFSET_MS;

  let total = 0;
  let hari = Math.floor(mulai / 86_400_000) * 86_400_000;

  while (hari < selesai) {
    const jadwal = JADWAL_KERJA[new Date(hari).getUTCDay()];
    if (jadwal) {
      const buka = hari + jadwal.buka * 3_600_000;
      const tutup = hari + jadwal.tutup * 3_600_000;
      const s = Math.max(buka, mulai);
      const e = Math.min(tutup, selesai);
      if (e > s) total += e - s;
    }
    hari += 86_400_000;
  }

  return Math.round(total / 60_000);
}

/** Ambil satu folder (inbox / sent) untuk satu akun. */
async function ambilFolder(
  config: ComposioConfig,
  account: MailAccount,
  folder: "inbox" | "sent",
  hari: number,
  onPage?: (info: { folder: string; page: number; collected: number }) => void,
): Promise<PesanRingkas[]> {
  const hasil: PesanRingkas[] = [];
  const terlihat = new Set<string>();
  let pageToken: string | null = null;

  for (let halaman = 0; halaman < MAX_PER_ARAH / PER_PAGE; halaman += 1) {
    const args: Record<string, unknown> = {
      query: `in:${folder} newer_than:${hari}d`,
      max_results: PER_PAGE,
      verbose: false,
      include_payload: false,
    };
    if (pageToken) args.page_token = pageToken;

    const response = await fetch(
      `${config.baseUrl}/api/v3/tools/execute/GMAIL_FETCH_EMAILS`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-api-key": config.apiKey,
          "x-project-id": config.projectId,
        },
        body: JSON.stringify({
          user_id: config.userId,
          connected_account_id: account.connectedAccountId,
          arguments: args,
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );

    const teks = await response.text();
    let json: FetchResponse;
    try {
      json = JSON.parse(teks) as FetchResponse;
    } catch {
      throw new Error(`${account.email}: balasan Composio tidak dapat dibaca (HTTP ${response.status}).`);
    }
    if (!response.ok || json.error) {
      const pesan =
        typeof json.error === "object" && json.error && "message" in json.error
          ? String((json.error as { message?: unknown }).message)
          : `Composio menolak permintaan (HTTP ${response.status}).`;
      throw new Error(`${account.email}: ${pesan}`);
    }

    const pesan = json.data?.messages ?? [];
    for (const m of pesan) {
      const id = m.messageId?.trim();
      const threadId = m.threadId?.trim();
      if (!id || !threadId || terlihat.has(id)) continue;
      terlihat.add(id);

      const waktu = m.messageTimestamp ? new Date(m.messageTimestamp) : null;
      if (!waktu || Number.isNaN(waktu.getTime())) continue;

      hasil.push({
        messageId: id,
        threadId,
        sender: m.sender ?? null,
        subject: (m.subject ?? "").trim(),
        waktu,
      });

      if (hasil.length >= MAX_PER_ARAH) break;
    }

    onPage?.({ folder, page: halaman + 1, collected: hasil.length });

    if (hasil.length >= MAX_PER_ARAH) break;
    const token = (json.data?.nextPageToken ?? "").trim();
    if (!token || pesan.length === 0) break;
    pageToken = token;
  }

  return hasil;
}

/**
 * Temukan percakapan yang masuk pada jendela pendek, untuk penjadwal per jam.
 *
 * Mengembalikan satu entri per thread (bukan per pesan) berisi pesan masuk
 * PERTAMA di thread itu — sama seperti `hitungBalasan`, tapi jauh lebih murah.
 */
export async function deteksiMasukBaru(
  config: ComposioConfig,
  account: MailAccount,
  hari = 3,
): Promise<
  Map<
    string,
    {
      subject: string;
      fromName: string | null;
      fromAddress: string;
      receivedAt: Date;
      isAutomated: boolean;
      inboundCount: number;
    }
  >
> {
  const masuk = await ambilFolder(config, account, "inbox", hari);
  const alamatSendiri = readMailAccounts().map((a) => a.email);

  const perThread = new Map<string, PesanRingkas[]>();
  for (const m of masuk) {
    if (!perThread.has(m.threadId)) perThread.set(m.threadId, []);
    perThread.get(m.threadId)!.push(m);
  }

  const hasil = new Map<string, {
    subject: string;
    fromName: string | null;
    fromAddress: string;
    receivedAt: Date;
    isAutomated: boolean;
    inboundCount: number;
  }>();

  for (const [threadId, daftar] of perThread) {
    daftar.sort((a, b) => a.waktu.getTime() - b.waktu.getTime());
    const pertama = daftar[0]!;
    const dari = parseSender(pertama.sender);
    hasil.set(threadId, {
      subject: pertama.subject || "(tanpa subjek)",
      fromName: dari.name,
      fromAddress: dari.address,
      receivedAt: pertama.waktu,
      isAutomated: isAlamatOtomatis(dari.address, alamatSendiri),
      inboundCount: daftar.length,
    });
  }

  return hasil;
}

/**
 * Cari balasan baru tanpa membaca ulang seluruh kotak masuk.
 *
 * Dipakai penjadwal per jam: cukup membaca folder TERKIRIM beberapa hari
 * terakhir, lalu memperbarui baris yang sudah ada berdasarkan threadId.
 *
 * Kenapa tidak membaca kotak masuk juga: percakapan lama yang baru dibalas hari
 * ini tidak akan terlihat kalau jendelanya pendek — tapi barisnya sudah ada di
 * database sejak email masuk pertama kali. Jadi mendeteksi dari sisi "terkirim"
 * saja sudah cukup, dan ini menghemat separuh panggilan Gmail.
 */
export async function deteksiBalasanBaru(
  config: ComposioConfig,
  account: MailAccount,
  hari = 3,
): Promise<Map<string, Date>> {
  const terkirim = await ambilFolder(config, account, "sent", hari);
  const hasil = new Map<string, Date>();

  for (const m of terkirim) {
    if (isBalasanOtomatis(m.subject)) continue;
    const ada = hasil.get(m.threadId);
    if (!ada || m.waktu.getTime() < ada.getTime()) hasil.set(m.threadId, m.waktu);
  }

  return hasil;
}

/**
 * Hitung statistik balas untuk satu akun.
 *
 * Mengembalikan satu baris per thread yang punya pesan masuk. Thread tanpa
 * balasan tetap dikembalikan dengan `repliedAt = null` — justru itu yang perlu
 * dilihat atasan.
 */
export async function hitungBalasan(
  config: ComposioConfig,
  account: MailAccount,
  hari = 30,
  onPage?: (info: { folder: string; page: number; collected: number }) => void,
): Promise<HasilBalas[]> {
  const [masuk, keluar] = await Promise.all([
    ambilFolder(config, account, "inbox", hari, onPage),
    ambilFolder(config, account, "sent", hari, onPage),
  ]);

  // Balasan tersusun per thread, terurut waktu.
  const balasanPerThread = new Map<string, PesanRingkas[]>();
  for (const m of keluar) {
    if (isBalasanOtomatis(m.subject)) continue;
    if (!balasanPerThread.has(m.threadId)) balasanPerThread.set(m.threadId, []);
    balasanPerThread.get(m.threadId)!.push(m);
  }
  for (const daftar of balasanPerThread.values()) {
    daftar.sort((a, b) => a.waktu.getTime() - b.waktu.getTime());
  }

  // Seluruh mailbox milik kita: dipakai untuk mengecualikan surat internal.
  const alamatSendiri = readMailAccounts().map((a) => a.email);

  const masukPerThread = new Map<string, PesanRingkas[]>();
  for (const m of masuk) {
    if (!masukPerThread.has(m.threadId)) masukPerThread.set(m.threadId, []);
    masukPerThread.get(m.threadId)!.push(m);
  }

  const hasil: HasilBalas[] = [];

  for (const [threadId, daftar] of masukPerThread) {
    daftar.sort((a, b) => a.waktu.getTime() - b.waktu.getTime());
    const pertama = daftar[0]!;
    const dari = parseSender(pertama.sender);
    const masukMs = pertama.waktu.getTime();

    const balasan = (balasanPerThread.get(threadId) ?? []).find((b) => b.waktu.getTime() > masukMs);

    const replyMinutes = balasan ? Math.round((balasan.waktu.getTime() - masukMs) / 60_000) : null;

    hasil.push({
      threadId,
      subject: pertama.subject || "(tanpa subjek)",
      fromName: dari.name,
      fromAddress: dari.address,
      receivedAt: pertama.waktu,
      repliedAt: balasan ? balasan.waktu : null,
      replyMinutes,
      workMinutes: balasan ? menitKerja(masukMs, balasan.waktu.getTime()) : null,
      isAutomated: isAlamatOtomatis(dari.address, alamatSendiri),
      inboundCount: daftar.length,
    });
  }

  return hasil;
}
