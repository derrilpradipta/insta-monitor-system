/**
 * Pembaca email belum dibaca lewat Composio (Gmail API).
 *
 * Alasannya memakai Composio, bukan IMAP: koneksi Gmail cukup lewat OAuth
 * (tidak perlu App Password), dan tetap jalan walau admin Google Workspace
 * mematikan akses IMAP.
 *
 * Satu instance = satu mailbox. Akun mana yang dibaca ditentukan oleh
 * connectedAccountId, bukan oleh kredensial global.
 *
 * CATATAN PENTING soal status dibaca: daftar pesan diambil lewat
 * GMAIL_FETCH_EMAILS yang hanya membaca metadata. Status belum-dibaca di
 * mailbox TIDAK berubah — sudah diuji dengan menjalankan query yang sama dua
 * kali dan semua pesan tetap berlabel UNREAD.
 */

import type { ComposioConfig, MailAccount } from "@/lib/email/accounts";

export type UnreadEmail = {
  accountEmail: string;
  mailbox: string;
  messageId: string;
  fromName: string | null;
  fromAddress: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
  hasAttachments: boolean;
};

const SNIPPET_LENGTH = 300;
const MAX_PAGES = 20;

/**
 * Batas jumlah pesan per panggilan. WAJIB diisi: bawaan GMAIL_FETCH_EMAILS
 * hanya 1 pesan, sehingga tanpa ini hasilnya terlihat seperti bug.
 */
const PER_PAGE = 50;

/** Rapikan teks jadi satu paragraf pendek untuk cuplikan. */
function toSnippet(raw: string): string {
  const bersih = raw
    .replace(/\r/g, "")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (bersih.length <= SNIPPET_LENGTH) return bersih;
  return `${bersih.slice(0, SNIPPET_LENGTH).trimEnd()}…`;
}

/**
 * Pecah pengirim berbentuk "Nama <alamat@domain>" menjadi nama dan alamat.
 * Kalau tidak ada tanda kurung siku, seluruhnya dianggap alamat.
 */
function parseSender(raw: string | null | undefined): { name: string | null; address: string } {
  const teks = (raw ?? "").trim();
  if (!teks) return { name: null, address: "(tanpa pengirim)" };

  const cocok = teks.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (cocok) {
    const nama = cocok[1]!.replace(/^["']|["']$/g, "").trim();
    return { name: nama || null, address: cocok[2]!.trim() };
  }

  return { name: null, address: teks };
}

type FetchResponse = {
  successful?: boolean;
  error?: unknown;
  data?: {
    messages?: {
      messageId?: string;
      threadId?: string;
      sender?: string;
      subject?: string;
      messageTimestamp?: string;
      preview?: { body?: string; subject?: string };
      attachmentList?: unknown[];
    }[];
    nextPageToken?: string;
  } | null;
};

export class ComposioMailbox {
  private config: ComposioConfig;
  private account: MailAccount;

  constructor(config: ComposioConfig, account: MailAccount) {
    this.config = config;
    this.account = account;
  }

  /** Tidak ada koneksi persisten; disediakan agar pemanggil seragam. */
  async connect(): Promise<void> {
    if (!this.account.connectedAccountId) {
      throw new Error(`Akun ${this.account.email} belum punya connected account Composio.`);
    }
  }

  async close(): Promise<void> {
    // Tidak ada yang perlu ditutup.
  }

  private async execute(arguments_: Record<string, unknown>): Promise<FetchResponse> {
    const response = await fetch(
      `${this.config.baseUrl}/api/v3/tools/execute/GMAIL_FETCH_EMAILS`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Tiga header ini wajib; tanpa x-project-id daftar akun terbaca kosong.
          "x-user-api-key": this.config.apiKey,
          "x-project-id": this.config.projectId,
        },
        body: JSON.stringify({
          user_id: this.config.userId,
          connected_account_id: this.account.connectedAccountId,
          arguments: arguments_,
        }),
        // Jangan biarkan permintaan menggantung saat server Composio lambat.
        signal: AbortSignal.timeout(45_000),
      },
    );

    const teks = await response.text();
    let hasil: FetchResponse;
    try {
      hasil = JSON.parse(teks) as FetchResponse;
    } catch {
      throw new Error(`Balasan Composio tidak dapat dibaca (HTTP ${response.status}).`);
    }

    if (!response.ok || hasil.error) {
      const pesan =
        typeof hasil.error === "object" && hasil.error && "message" in hasil.error
          ? String((hasil.error as { message?: unknown }).message)
          : `Composio menolak permintaan (HTTP ${response.status}).`;
      throw new Error(`${this.account.email}: ${pesan}`);
    }

    return hasil;
  }

  /**
   * Ambil semua email yang belum dibaca di INBOX akun ini.
   * Sumber kebenarannya label UNREAD milik Gmail, bukan tebakan lokal.
   *
   * `onPage` dipanggil setiap satu halaman selesai dibaca, supaya bilah progres
   * di browser mengikuti pekerjaan yang benar-benar terjadi.
   */
  async fetchUnread(
    limit = 500,
    onPage?: (info: { page: number; collected: number }) => void,
  ): Promise<UnreadEmail[]> {
    const emails: UnreadEmail[] = [];
    const terlihat = new Set<string>();
    let pageToken: string | null = null;

    for (let halaman = 0; halaman < MAX_PAGES; halaman += 1) {
      const args: Record<string, unknown> = {
        query: "is:unread in:inbox",
        max_results: Math.min(PER_PAGE, Math.max(1, limit - emails.length)),
        // verbose=false: hanya metadata (pengirim, subjek, waktu, pratinjau).
        // Ini juga yang membuat pengambilan tetap ringan dan cepat.
        verbose: false,
        include_payload: false,
      };
      if (pageToken) args.page_token = pageToken;

      const hasil = await this.execute(args);
      const data = hasil.data ?? {};
      const pesan = data.messages ?? [];

      for (const m of pesan) {
        const id = m.messageId?.trim();
        if (!id || terlihat.has(id)) continue;
        terlihat.add(id);

        const dari = parseSender(m.sender);
        const waktu = m.messageTimestamp ? new Date(m.messageTimestamp) : new Date();

        emails.push({
          accountEmail: this.account.email,
          mailbox: "INBOX",
          messageId: id,
          fromName: dari.name,
          fromAddress: dari.address,
          subject: (m.subject ?? m.preview?.subject ?? "(tanpa subjek)").trim() || "(tanpa subjek)",
          snippet: toSnippet(m.preview?.body ?? ""),
          receivedAt: Number.isNaN(waktu.getTime()) ? new Date() : waktu,
          hasAttachments: Boolean(m.attachmentList?.length),
        });

        if (emails.length >= limit) break;
      }

      onPage?.({ page: halaman + 1, collected: emails.length });

      if (emails.length >= limit) break;

      // nextPageToken bisa berupa string kosong; hanya token berisi yang berarti
      // masih ada halaman berikutnya.
      const token = (data.nextPageToken ?? "").trim();
      if (!token || pesan.length === 0) break;
      pageToken = token;
    }

    return emails;
  }
}

/** Apakah hasil fetch mungkin terpotong oleh batas `limit`. */
export function isTruncated(total: number, limit: number): boolean {
  return total >= limit;
}
