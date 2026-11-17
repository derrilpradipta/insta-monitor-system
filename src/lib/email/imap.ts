import { ImapFlow } from "imapflow";
import PostalMime from "postal-mime";

/**
 * Pembaca email lewat IMAP.
 *
 * Kenapa IMAP, bukan scraping webmail: situs sumber tidak punya fitur email
 * sama sekali, dan Gmail hanya bisa dibaca dengan aman lewat IMAP/API resmi.
 *
 * Catatan penting soal status belum-dibaca: imapflow mengambil isi pesan dengan
 * BODY.PEEK[], sehingga membaca email di sini TIDAK menandainya sebagai sudah
 * dibaca di mailbox asli. Status belum-dibaca tetap apa adanya.
 */

export type UnreadEmail = {
  mailbox: string;
  uid: number | null;
  uidValidity: bigint | null;
  messageId: string;
  fromName: string | null;
  fromAddress: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
  hasAttachments: boolean;
};

export type ImapConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

const SNIPPET_LENGTH = 300;

/** Ambil konfigurasi dari environment; lempar pesan jelas bila belum diisi. */
export function readImapConfig(): ImapConfig {
  const user = process.env.MAIL_IMAP_USER ?? "";
  const password = process.env.MAIL_IMAP_PASSWORD ?? "";

  if (!user || !password) {
    throw new Error(
      "Kredensial email belum diatur. Isi MAIL_IMAP_USER dan MAIL_IMAP_PASSWORD (App Password Gmail) di environment.",
    );
  }

  return {
    host: process.env.MAIL_IMAP_HOST ?? "imap.gmail.com",
    port: Number(process.env.MAIL_IMAP_PORT ?? 993),
    secure: (process.env.MAIL_IMAP_SECURE ?? "true") !== "false",
    user,
    password,
  };
}

/** Rapikan teks jadi satu paragraf pendek untuk cuplikan. */
function toSnippet(raw: string): string {
  const bersih = raw
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (bersih.length <= SNIPPET_LENGTH) return bersih;
  return `${bersih.slice(0, SNIPPET_LENGTH).trimEnd()}…`;
}

/** Ubah HTML sederhana jadi teks, untuk email yang tidak punya versi teks. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');
}

export class MailboxReader {
  private client: ImapFlow;
  private readonly mailbox: string;

  constructor(config: ImapConfig, mailbox = "INBOX") {
    this.mailbox = mailbox;
    this.client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      // Senyap: jangan banjiri log serverless dengan lalu lintas IMAP.
      logger: false,
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async close(): Promise<void> {
    try {
      await this.client.logout();
    } catch {
      // Koneksi mungkin sudah tertutup; tidak perlu menggagalkan proses.
    }
  }

  /**
   * Ambil semua email yang statusnya BELUM DIBACA.
   * Sumber kebenarannya adalah flag \Seen di server IMAP, bukan tebakan lokal.
   */
  async fetchUnread(limit = 200): Promise<{ emails: UnreadEmail[]; uidValidity: bigint | null }> {
    const emails: UnreadEmail[] = [];
    let uidValidity: bigint | null = null;

    const lock = await this.client.getMailboxLock(this.mailbox);
    try {
      const kotak = this.client.mailbox;
      if (typeof kotak === "object" && kotak && "uidValidity" in kotak) {
        const nilai = (kotak as { uidValidity?: bigint | number }).uidValidity;
        if (nilai !== undefined && nilai !== null) uidValidity = BigInt(nilai);
      }

      const uids = await this.client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return { emails, uidValidity };

      // Ambil yang terbaru saja bila jumlahnya melebihi batas.
      const dipakai = uids.length > limit ? uids.slice(-limit) : uids;

      // fetchAll dulu, baru di-parse: menjalankan perintah IMAP lain di dalam
      // loop fetch() bisa menyebabkan deadlock.
      const pesan = await this.client.fetchAll(
        dipakai,
        { envelope: true, source: true, flags: true },
        { uid: true },
      );

      for (const item of pesan) {
        if (!item.source) continue;

        let parsed: Awaited<ReturnType<typeof PostalMime.parse>> | null = null;
        try {
          parsed = await PostalMime.parse(item.source);
        } catch {
          // Pesan rusak/tidak standar: tetap tampilkan dari envelope saja.
        }

        const dari = parsed?.from ?? item.envelope?.from?.[0];
        const alamat = dari?.address?.trim() || "(tanpa pengirim)";
        const tanggal = parsed?.date
          ? new Date(parsed.date)
          : item.envelope?.date
            ? new Date(item.envelope.date)
            : new Date();

        const teksMentah = parsed?.text ?? (parsed?.html ? htmlToText(parsed.html) : "");

        emails.push({
          mailbox: this.mailbox,
          uid: item.uid ?? null,
          uidValidity,
          messageId:
            parsed?.messageId?.trim() ||
            item.envelope?.messageId?.trim() ||
            `imap:${this.mailbox}:${uidValidity ?? 0}:${item.uid}`,
          fromName: dari?.name?.trim() || null,
          fromAddress: alamat,
          subject: (parsed?.subject ?? item.envelope?.subject ?? "(tanpa subjek)").trim() || "(tanpa subjek)",
          snippet: toSnippet(teksMentah),
          receivedAt: Number.isNaN(tanggal.getTime()) ? new Date() : tanggal,
          hasAttachments: Boolean(parsed?.attachments?.length),
        });
      }
    } finally {
      lock.release();
    }

    return { emails, uidValidity };
  }
}
