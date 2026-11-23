/**
 * Daftar mailbox Gmail yang dipantau.
 *
 * Satu akun Gmail = satu connected account di Composio. Kredensialnya disimpan
 * di environment, bukan di database, supaya tidak ada token yang ikut ter-commit.
 *
 * Format tiap akun (indeks boleh 1, 2, 3, ...):
 *   MAIL_ACCOUNT_1_EMAIL="instaprint24@gmail.com"
 *   MAIL_ACCOUNT_1_CONNECTED_ACCOUNT_ID="ca_..."
 *   MAIL_ACCOUNT_1_LABEL="Instaprint Pusat"      (opsional, untuk tab)
 *
 * Variabel bersama (dipakai semua akun):
 *   COMPOSIO_API_KEY, COMPOSIO_PROJECT_ID, COMPOSIO_USER_ID
 *
 * Format lama (COMPOSIO_CONNECTED_ACCOUNT_ID tunggal) tetap didukung supaya
 * deployment yang sudah jalan tidak langsung rusak.
 */

export type MailAccount = {
  /** Alamat email, dipakai sebagai identitas di database. */
  email: string;
  /** ID connected account Composio untuk akun ini. */
  connectedAccountId: string;
  /** Nama pendek untuk tab; kalau kosong dipakai alamat email. */
  label: string;
  /**
   * Nama grup/cabang pemilik akun ini, mis. "Pusat" atau "Gading Serpong".
   * Beberapa alamat bisa berbagi satu grup — itulah yang tampil sebagai satu
   * entri di sidebar dengan tab per alamat di dalamnya.
   */
  group: string;
};

/** Satu cabang: nama grup + seluruh mailbox yang bernaung di bawahnya. */
export type MailGroup = {
  /** Bagian URL, mis. "gading-serpong". */
  slug: string;
  name: string;
  accounts: MailAccount[];
};

/** Ubah nama grup jadi bentuk aman untuk URL. */
export function groupSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type ComposioConfig = {
  apiKey: string;
  projectId: string;
  userId: string;
  baseUrl: string;
};

const MAX_AKUN = 10;

/** Kredensial bersama Composio. */
export function readComposioConfig(): ComposioConfig {
  const apiKey = process.env.COMPOSIO_API_KEY ?? "";
  const projectId = process.env.COMPOSIO_PROJECT_ID ?? "";
  const userId = process.env.COMPOSIO_USER_ID ?? "";

  if (!apiKey || !projectId || !userId) {
    throw new Error(
      "Kredensial email belum diatur. Isi COMPOSIO_API_KEY, COMPOSIO_PROJECT_ID, dan COMPOSIO_USER_ID di environment.",
    );
  }

  return {
    apiKey,
    projectId,
    userId,
    baseUrl: process.env.COMPOSIO_BASE_URL ?? "https://backend.composio.dev",
  };
}

/**
 * Semua mailbox yang dikonfigurasi. Urutannya mengikuti indeks, jadi entri di
 * sidebar mengikuti urutan yang sama.
 *
 * Tiap akun bisa punya GROUP, mis.:
 *   MAIL_ACCOUNT_1_EMAIL="instaprint24@gmail.com"
 *   MAIL_ACCOUNT_1_LABEL="Instaprint Pusat"
 *   MAIL_ACCOUNT_1_GROUP="Pusat"
 *   MAIL_ACCOUNT_2_EMAIL="onlineorder@instaprint8.com"
 *   MAIL_ACCOUNT_2_LABEL="Online Order"
 *   MAIL_ACCOUNT_2_GROUP="Pusat"
 *
 * Akun tanpa GROUP dianggap grup tersendiri memakai LABEL-nya, jadi
 * konfigurasi lama tetap jalan tanpa diubah.
 */
export function readMailAccounts(): MailAccount[] {
  const akun: MailAccount[] = [];

  for (let i = 1; i <= MAX_AKUN; i += 1) {
    const email = (process.env[`MAIL_ACCOUNT_${i}_EMAIL`] ?? "").trim();
    const connectedAccountId = (process.env[`MAIL_ACCOUNT_${i}_CONNECTED_ACCOUNT_ID`] ?? "").trim();
    const label = (process.env[`MAIL_ACCOUNT_${i}_LABEL`] ?? "").trim();
    const group = (process.env[`MAIL_ACCOUNT_${i}_GROUP`] ?? "").trim();

    if (!email || !connectedAccountId) continue;

    akun.push({
      email,
      connectedAccountId,
      label: label || email,
      group: group || label || email,
    });
  }

  // Dukungan format lama: satu akun tanpa penomoran.
  if (akun.length === 0) {
    const lamaEmail = (process.env.MAIL_ACCOUNT_EMAIL ?? "").trim();
    const lamaId = (process.env.COMPOSIO_CONNECTED_ACCOUNT_ID ?? "").trim();
    if (lamaEmail && lamaId) {
      akun.push({ email: lamaEmail, connectedAccountId: lamaId, label: lamaEmail, group: lamaEmail });
    }
  }

  return akun;
}

/**
 * Kelompokkan akun per cabang, mengikuti urutan kemunculan pertama.
 * Dipakai sidebar dan pemilih cabang di halaman Email.
 */
export function readMailGroups(): MailGroup[] {
  const grup: MailGroup[] = [];
  const peta = new Map<string, MailGroup>();

  for (const akun of readMailAccounts()) {
    const kunci = akun.group.toLowerCase();
    let ada = peta.get(kunci);
    if (!ada) {
      ada = { slug: groupSlug(akun.group), name: akun.group, accounts: [] };
      peta.set(kunci, ada);
      grup.push(ada);
    }
    ada.accounts.push(akun);
  }

  return grup;
}

/** Cari grup berdasarkan slug URL; null kalau tidak ada. */
export function findMailGroup(slug: string): MailGroup | null {
  const s = (slug ?? "").trim().toLowerCase();
  if (!s) return null;
  return readMailGroups().find((g) => g.slug === s) ?? null;
}

/** Cari satu akun berdasarkan alamat email; null kalau tidak dikonfigurasi. */
export function findMailAccount(email: string): MailAccount | null {
  return readMailAccounts().find((a) => a.email.toLowerCase() === email.toLowerCase()) ?? null;
}

/** Akun pertama, dipakai sebagai default saat tab tidak disebutkan. */
export function defaultMailAccount(): MailAccount | null {
  return readMailAccounts()[0] ?? null;
}

/**
 * Apakah alamat ini salah satu mailbox Instaprint sendiri?
 *
 * Dipakai untuk menandai email antar-cabang (operan file produksi). Email
 * semacam itu TIDAK wajib dibaca atau dibalas, jadi harus disingkirkan dari
 * daftar "belum dibaca" dan dari laporan waktu balas — kalau ikut dihitung,
 * angka kinerja tim jadi terlihat jauh lebih buruk daripada kenyataan.
 */
export function isAlamatSendiri(address: string): boolean {
  const a = (address ?? "").trim().toLowerCase();
  if (!a) return false;
  return readMailAccounts().some((akun) => akun.email.toLowerCase() === a);
}
