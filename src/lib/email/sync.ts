import { prisma } from "@/lib/db";
import { ComposioMailbox } from "@/lib/email/composio";
import {
  readComposioConfig,
  readMailAccounts,
  findMailAccount,
  isAlamatSendiri,
  type MailAccount,
} from "@/lib/email/accounts";

/** Tahap yang dilaporkan ke browser, sama polanya dengan pengambilan pesanan. */
export type EmailStage = "connect" | "fetch" | "save" | "reconcile";

export type EmailProgress =
  | { stage: "connect"; message: string; account: string }
  | { stage: "fetch"; message: string; account: string; page: number; collected: number }
  | { stage: "save"; message: string; account: string; done: number; total: number }
  | { stage: "reconcile"; message: string; account: string; markedRead: number };

export type EmailSyncResult = {
  accountEmail: string;
  runId: string;
  /** Email belum-dibaca dari pelanggan (email internal tidak dihitung). */
  unreadFound: number;
  /** Operan file antar-cabang yang sengaja tidak dimasukkan ke daftar. */
  internalSkipped: number;
  created: number;
  updated: number;
  markedRead: number;
};

/** Batas aman satu putaran; jauh di atas kebutuhan operasional. */
const LIMIT_PER_ACCOUNT = 500;

/**
 * Satu putaran pengambilan email belum-dibaca untuk satu akun.
 *
 * Sumber datanya Composio (Gmail API lewat OAuth), bukan IMAP.
 *
 * Daftar yang disimpan BERSIFAT DINAMIS, bukan akumulatif:
 *  - email yang masih belum dibaca → tetap ada di daftar
 *  - email yang sudah dibaca di Gmail → ditandai `isRead`, hilang dari daftar
 *  - email baru yang belum dibaca → masuk
 *
 * Penyelarasan status dibaca hanya dijalankan kalau pengambilan TIDAK terpotong
 * batas, supaya email di luar jangkauan tidak salah dianggap sudah dibaca.
 */
export async function syncAccount(
  account: MailAccount,
  triggeredBy: string | null = null,
  onProgress?: (info: EmailProgress) => void,
): Promise<EmailSyncResult> {
  const run = await prisma.emailSyncRun.create({
    data: { accountEmail: account.email, status: "RUNNING", triggeredBy },
  });

  // Pembaca dibuat di dalam try: kalau konfigurasi belum lengkap, catatan run
  // tetap ditutup sebagai FAILED, bukan tertinggal RUNNING selamanya.
  let reader: ComposioMailbox | null = null;
  let created = 0;
  let updated = 0;
  let markedRead = 0;
  let unreadFound = 0;

  try {
    onProgress?.({ stage: "connect", account: account.email, message: `Menghubungi ${account.label}` });
    reader = new ComposioMailbox(readComposioConfig(), account);
    await reader.connect();

    // Kumpulkan dulu seluruh daftar belum-dibaca, lalu simpan sekaligus. Dengan
    // begitu bilah progres mencerminkan halaman yang benar-benar sudah terbaca.
    const emails = await reader.fetchUnread(LIMIT_PER_ACCOUNT, (info) => {
      onProgress?.({
        stage: "fetch",
        account: account.email,
        message: `Membaca halaman ${info.page}`,
        page: info.page,
        collected: info.collected,
      });
    });

    // Email antar-cabang bukan pekerjaan pelanggan: tetap disimpan (supaya
    // riwayat utuh) tapi ditandai, dan TIDAK dihitung sebagai "belum dibaca".
    const internalSkipped = emails.filter((e) => isAlamatSendiri(e.fromAddress)).length;
    unreadFound = emails.length - internalSkipped;
    const terpotong = emails.length >= LIMIT_PER_ACCOUNT;
    const idSekarang = new Set(emails.map((e) => e.messageId));

    for (let i = 0; i < emails.length; i += 1) {
      const email = emails[i]!;

      const sudahAda = await prisma.emailMessage.findUnique({
        where: {
          accountEmail_messageId: { accountEmail: email.accountEmail, messageId: email.messageId },
        },
        select: { id: true },
      });

      await prisma.emailMessage.upsert({
        where: {
          accountEmail_messageId: { accountEmail: email.accountEmail, messageId: email.messageId },
        },
        create: {
          accountEmail: email.accountEmail,
          mailbox: email.mailbox,
          messageId: email.messageId,
          fromName: email.fromName,
          fromAddress: email.fromAddress,
          subject: email.subject,
          snippet: email.snippet,
          receivedAt: email.receivedAt,
          hasAttachments: email.hasAttachments,
          isRead: false,
          isInternal: isAlamatSendiri(email.fromAddress),
        },
        // Email yang sama dan masih belum dibaca: isinya diperbarui, tetap di
        // daftar. Kalau sebelumnya sempat tercatat sudah dibaca (mis. dibuka
        // lalu dijadikan belum dibaca lagi), statusnya dikembalikan.
        update: {
          fromName: email.fromName,
          fromAddress: email.fromAddress,
          subject: email.subject,
          snippet: email.snippet,
          receivedAt: email.receivedAt,
          hasAttachments: email.hasAttachments,
          isRead: false,
          isInternal: isAlamatSendiri(email.fromAddress),
          lastSyncedAt: new Date(),
        },
      });

      if (sudahAda) updated += 1;
      else created += 1;

      onProgress?.({
        stage: "save",
        account: account.email,
        message: `Menyimpan ${i + 1} dari ${emails.length}`,
        done: i + 1,
        total: emails.length,
      });
    }

    if (!terpotong) {
      // Email yang dulu belum dibaca tapi sekarang tidak ada di daftar UNREAD
      // berarti sudah dibaca di Gmail. Inilah yang membuat daftar tetap ramping.
      const masihTercatat = await prisma.emailMessage.findMany({
        where: { accountEmail: account.email, isRead: false },
        select: { id: true, messageId: true },
      });

      const sudahDibaca = masihTercatat.filter((m) => !idSekarang.has(m.messageId));

      if (sudahDibaca.length > 0) {
        const hasil = await prisma.emailMessage.updateMany({
          where: { id: { in: sudahDibaca.map((m) => m.id) } },
          data: { isRead: true, lastSyncedAt: new Date() },
        });
        markedRead = hasil.count;

        onProgress?.({
          stage: "reconcile",
          account: account.email,
          message: `${markedRead} email sudah dibaca, dikeluarkan dari daftar`,
          markedRead,
        });
      }
    }

    await prisma.emailSyncRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", finishedAt: new Date(), unreadFound, created, updated, markedRead },
    });

    return { accountEmail: account.email, runId: run.id, unreadFound, internalSkipped, created, updated, markedRead };
  } catch (error) {
    const pesan = error instanceof Error ? error.message : String(error);
    await prisma.emailSyncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        unreadFound,
        created,
        updated,
        markedRead,
        errorMessage: pesan.slice(0, 2000),
      },
    });

    throw error;
  } finally {
    await reader?.close();
  }
}

/**
 * Jalankan sync untuk satu akun (kalau `email` diisi) atau semua akun.
 *
 * Satu akun gagal tidak menghentikan akun lain — hasilnya dilaporkan per akun
 * supaya halaman bisa menampilkan status masing-masing.
 */
export async function runEmailSync(
  triggeredBy: string | null = null,
  email?: string | null,
  onProgress?: (info: EmailProgress) => void,
): Promise<{ results: EmailSyncResult[]; errors: { accountEmail: string; message: string }[] }> {
  const akun = email
    ? [findMailAccount(email)].filter((a): a is MailAccount => Boolean(a))
    : readMailAccounts();

  if (akun.length === 0) {
    throw new Error(
      email
        ? `Akun ${email} belum dikonfigurasi di environment.`
        : "Belum ada akun email yang dikonfigurasi. Isi MAIL_ACCOUNT_1_EMAIL dan MAIL_ACCOUNT_1_CONNECTED_ACCOUNT_ID.",
    );
  }

  const results: EmailSyncResult[] = [];
  const errors: { accountEmail: string; message: string }[] = [];

  for (const akunIni of akun) {
    try {
      results.push(await syncAccount(akunIni, triggeredBy, onProgress));
    } catch (error) {
      errors.push({
        accountEmail: akunIni.email,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { results, errors };
}
