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
};

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
 * Semua mailbox yang dikonfigurasi. Urutannya mengikuti indeks, jadi tab di
 * halaman mengikuti urutan yang sama.
 */
export function readMailAccounts(): MailAccount[] {
  const akun: MailAccount[] = [];

  for (let i = 1; i <= MAX_AKUN; i += 1) {
    const email = (process.env[`MAIL_ACCOUNT_${i}_EMAIL`] ?? "").trim();
    const connectedAccountId = (process.env[`MAIL_ACCOUNT_${i}_CONNECTED_ACCOUNT_ID`] ?? "").trim();
    const label = (process.env[`MAIL_ACCOUNT_${i}_LABEL`] ?? "").trim();

    if (!email || !connectedAccountId) continue;

    akun.push({
      email,
      connectedAccountId,
      label: label || email,
    });
  }

  // Dukungan format lama: satu akun tanpa penomoran.
  if (akun.length === 0) {
    const lamaEmail = (process.env.MAIL_ACCOUNT_EMAIL ?? "").trim();
    const lamaId = (process.env.COMPOSIO_CONNECTED_ACCOUNT_ID ?? "").trim();
    if (lamaEmail && lamaId) {
      akun.push({ email: lamaEmail, connectedAccountId: lamaId, label: lamaEmail });
    }
  }

  return akun;
}

/** Cari satu akun berdasarkan alamat email; null kalau tidak dikonfigurasi. */
export function findMailAccount(email: string): MailAccount | null {
  return readMailAccounts().find((a) => a.email.toLowerCase() === email.toLowerCase()) ?? null;
}

/** Akun pertama, dipakai sebagai default saat tab tidak disebutkan. */
export function defaultMailAccount(): MailAccount | null {
  return readMailAccounts()[0] ?? null;
}
