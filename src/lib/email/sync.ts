import { prisma } from "@/lib/db";
import { MailboxReader, readImapConfig } from "@/lib/email/imap";

/**
 * Satu putaran pengambilan email belum-dibaca.
 *
 * Aman dijalankan berkali-kali: email dikunci dengan Message-ID, jadi sync
 * berikutnya hanya memperbarui, tidak menggandakan.
 *
 * Status "sudah dibaca" juga ikut diselaraskan: email yang tadinya belum dibaca
 * lalu dibaca orang lain (mis. lewat HP) akan berubah jadi sudah dibaca di sini.
 */
export async function runEmailSync(triggeredBy: string | null = null) {
  const run = await prisma.emailSyncRun.create({
    data: { status: "RUNNING", triggeredBy },
  });

  // Pembaca dibuat di dalam try: kalau konfigurasi belum lengkap, catatan run
  // tetap ditutup sebagai FAILED, bukan tertinggal RUNNING selamanya.
  let reader: MailboxReader | null = null;
  let created = 0;
  let updated = 0;
  let markedRead = 0;
  let unreadFound = 0;

  try {
    reader = new MailboxReader(readImapConfig());
    await reader.connect();
    const { emails } = await reader.fetchUnread();
    unreadFound = emails.length;

    // Semua email yang sekarang belum dibaca, berdasarkan Message-ID.
    const idSekarang = new Set(emails.map((e) => e.messageId));

    for (const email of emails) {
      const sudahAda = await prisma.emailMessage.findUnique({
        where: { messageId: email.messageId },
        select: { id: true },
      });

      await prisma.emailMessage.upsert({
        where: { messageId: email.messageId },
        create: {
          mailbox: email.mailbox,
          uid: email.uid,
          uidValidity: email.uidValidity,
          messageId: email.messageId,
          fromName: email.fromName,
          fromAddress: email.fromAddress,
          subject: email.subject,
          snippet: email.snippet,
          receivedAt: email.receivedAt,
          hasAttachments: email.hasAttachments,
          isRead: false,
        },
        update: {
          uid: email.uid,
          uidValidity: email.uidValidity,
          fromName: email.fromName,
          fromAddress: email.fromAddress,
          subject: email.subject,
          snippet: email.snippet,
          receivedAt: email.receivedAt,
          hasAttachments: email.hasAttachments,
          isRead: false,
          lastSyncedAt: new Date(),
        },
      });

      if (sudahAda) updated += 1;
      else created += 1;
    }

    // Email yang dulu tercatat belum dibaca tapi kini tidak ada di daftar
    // UNSEEN berarti sudah dibaca di mailbox asli.
    const masihBelumDibaca = await prisma.emailMessage.findMany({
      where: { isRead: false, mailbox: "INBOX" },
      select: { id: true, messageId: true },
    });

    const sudahDibaca = masihBelumDibaca.filter((m) => !idSekarang.has(m.messageId));
    if (sudahDibaca.length > 0) {
      const hasil = await prisma.emailMessage.updateMany({
        where: { id: { in: sudahDibaca.map((m) => m.id) } },
        data: { isRead: true, lastSyncedAt: new Date() },
      });
      markedRead = hasil.count;
    }

    await prisma.emailSyncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        unreadFound,
        created,
        updated,
        markedRead,
      },
    });

    return { runId: run.id, unreadFound, created, updated, markedRead };
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

    // Cek email adalah fitur pendukung; kegagalannya tidak boleh menjatuhkan
    // aplikasi. Pemanggil menerima error agar bisa menampilkan pesan.
    throw error;
  } finally {
    await reader?.close();
  }
}
