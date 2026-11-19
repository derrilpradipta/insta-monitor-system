import { prisma } from "@/lib/db";
import { hitungBalasan, deteksiMasukBaru, deteksiBalasanBaru, menitKerja } from "@/lib/email/replies";
import {
  readComposioConfig,
  readMailAccounts,
  findMailAccount,
  type MailAccount,
} from "@/lib/email/accounts";

export type ReplySyncResult = {
  accountEmail: string;
  threads: number;
  replied: number;
  unreplied: number;
  automated: number;
};

export type ReplyProgress = {
  stage: "connect" | "fetch" | "save";
  message: string;
  account: string;
  page?: number;
  collected?: number;
  done?: number;
  total?: number;
};

/**
 * Simpan statistik balas satu akun.
 *
 * Baris dikunci dengan (akun, threadId) lalu diperbarui — bukan dihapus dan
 * dibuat ulang — supaya riwayat thread yang sama tidak berubah id-nya setiap
 * kali diperbarui.
 */
async function syncSatuAkun(
  account: MailAccount,
  hari: number,
  onProgress?: (info: ReplyProgress) => void,
): Promise<ReplySyncResult> {
  onProgress?.({ stage: "connect", account: account.email, message: `Menghubungi ${account.label}` });

  const config = readComposioConfig();
  const baris = await hitungBalasan(config, account, hari, (info) => {
    onProgress?.({
      stage: "fetch",
      account: account.email,
      message: `Membaca ${info.folder === "inbox" ? "kotak masuk" : "pesan terkirim"} halaman ${info.page}`,
      page: info.page,
      collected: info.collected,
    });
  });

  let replied = 0;
  let unreplied = 0;
  let automated = 0;

  // Tulis per potongan 50 dalam SATU transaksi. Menulis 657 baris satu per satu
  // berarti 657 perjalanan ke Neon — puluhan detik yang tidak perlu.
  const POTONGAN = 50;

  for (let i = 0; i < baris.length; i += POTONGAN) {
    const potongan = baris.slice(i, i + POTONGAN);

    for (const b of potongan) {
      if (b.isAutomated) automated += 1;
      else if (b.repliedAt) replied += 1;
      else unreplied += 1;
    }

    await prisma.$transaction(
      potongan.map((b) =>
        prisma.emailReplyStat.upsert({
          where: {
            accountEmail_threadId: { accountEmail: account.email, threadId: b.threadId },
          },
          create: {
            accountEmail: account.email,
            threadId: b.threadId,
            subject: b.subject,
            fromName: b.fromName,
            fromAddress: b.fromAddress,
            receivedAt: b.receivedAt,
            repliedAt: b.repliedAt,
            replyMinutes: b.replyMinutes,
            workMinutes: b.workMinutes,
            isAutomated: b.isAutomated,
            inboundCount: b.inboundCount,
          },
          update: {
            subject: b.subject,
            fromName: b.fromName,
            fromAddress: b.fromAddress,
            receivedAt: b.receivedAt,
            repliedAt: b.repliedAt,
            replyMinutes: b.replyMinutes,
            workMinutes: b.workMinutes,
            isAutomated: b.isAutomated,
            inboundCount: b.inboundCount,
            syncedAt: new Date(),
          },
        }),
      ),
    );

    const selesai = Math.min(i + POTONGAN, baris.length);
    onProgress?.({
      stage: "save",
      account: account.email,
      message: `Menyimpan ${selesai} dari ${baris.length}`,
      done: selesai,
      total: baris.length,
    });
  }

  return { accountEmail: account.email, threads: baris.length, replied, unreplied, automated };
}

/**
 * Segarkan statistik balas untuk penjadwal per jam.
 *
 * Membaca kotak masuk DAN terkirim untuk jendela pendek (3 hari), lalu:
 *  - percakapan baru → ditambahkan
 *  - percakapan lama yang baru dibalas → `repliedAt` diisi
 *  - percakapan lama lainnya → TIDAK disentuh (tanggal masuk aslinya tetap)
 *
 * Inilah yang membuat grafik di halaman Waktu Balas bergerak sendiri setiap
 * kali penjadwal email berjalan, tanpa user menekan tombol apa pun.
 *
 * Jendela 3 hari dipilih supaya murah (8 panggilan Gmail untuk 4 mailbox) tapi
 * tetap menangkap percakapan yang dibalas keesokan harinya.
 */
export async function segarkanBalasanCepat(
  hari = 3,
): Promise<{ baru: number; diperbarui: number; akun: number; errors: { accountEmail: string; message: string }[] }> {
  const akun = readMailAccounts();
  if (akun.length === 0) return { baru: 0, diperbarui: 0, akun: 0, errors: [] };

  const config = readComposioConfig();
  const errors: { accountEmail: string; message: string }[] = [];
  let baru = 0;
  let diperbarui = 0;

  const hasil = await Promise.allSettled(
    akun.map(async (akunIni) => {
      const [masuk, terkirim] = await Promise.all([
        deteksiMasukBaru(config, akunIni, hari),
        deteksiBalasanBaru(config, akunIni, hari),
      ]);

      // Percakapan yang sudah tercatat, beserta tanggal masuk aslinya.
      const tercatat = await prisma.emailReplyStat.findMany({
        where: { accountEmail: akunIni.email },
        select: { id: true, threadId: true, receivedAt: true, repliedAt: true, isAutomated: true },
      });
      const peta = new Map(tercatat.map((b) => [b.threadId, b]));

      let nBaru = 0;
      let nDiperbarui = 0;

      // 1. Percakapan baru dari kotak masuk jendela ini.
      for (const [threadId, info] of masuk) {
        if (peta.has(threadId)) continue;

        // Percakapan baru bisa saja sudah dibalas dalam jendela yang sama;
        // tanpa pemeriksaan ini balasannya baru tercatat satu jam kemudian.
        const waktuBalas = terkirim.get(threadId);
        const adaBalasan = waktuBalas && waktuBalas.getTime() > info.receivedAt.getTime();

        await prisma.emailReplyStat.create({
          data: {
            accountEmail: akunIni.email,
            threadId,
            subject: info.subject,
            fromName: info.fromName,
            fromAddress: info.fromAddress,
            receivedAt: info.receivedAt,
            isAutomated: info.isAutomated,
            inboundCount: info.inboundCount,
            ...(adaBalasan
              ? {
                  repliedAt: waktuBalas,
                  replyMinutes: Math.round((waktuBalas.getTime() - info.receivedAt.getTime()) / 60_000),
                  workMinutes: menitKerja(info.receivedAt.getTime(), waktuBalas.getTime()),
                }
              : {}),
          },
        });
        nBaru += 1;
      }

      // 2. Balasan baru untuk percakapan yang masih menggantung.
      for (const b of tercatat) {
        if (b.repliedAt) continue;
        const waktu = terkirim.get(b.threadId);
        if (!waktu) continue;
        // Balasan harus SESUDAH email masuk; kalau tidak, itu pesan lain.
        if (waktu.getTime() <= b.receivedAt.getTime()) continue;

        await prisma.emailReplyStat.update({
          where: { id: b.id },
          data: {
            repliedAt: waktu,
            replyMinutes: Math.round((waktu.getTime() - b.receivedAt.getTime()) / 60_000),
            workMinutes: menitKerja(b.receivedAt.getTime(), waktu.getTime()),
            syncedAt: new Date(),
          },
        });
        nDiperbarui += 1;
      }

      return { nBaru, nDiperbarui };
    }),
  );

  hasil.forEach((h, i) => {
    if (h.status === "fulfilled") {
      baru += h.value.nBaru;
      diperbarui += h.value.nDiperbarui;
    } else {
      errors.push({
        accountEmail: akun[i]!.email,
        message: h.reason instanceof Error ? h.reason.message : String(h.reason),
      });
    }
  });

  return { baru, diperbarui, akun: akun.length, errors };
}

/**
 * Perbarui statistik balas untuk satu akun atau semua akun.
 *
 * Satu akun gagal tidak menghentikan akun lain — hasilnya dilaporkan per akun.
 */
export async function runReplySync(
  email?: string | null,
  hari = 30,
  onProgress?: (info: ReplyProgress) => void,
): Promise<{ results: ReplySyncResult[]; errors: { accountEmail: string; message: string }[] }> {
  const akun = email
    ? [findMailAccount(email)].filter((a): a is MailAccount => Boolean(a))
    : readMailAccounts();

  if (akun.length === 0) {
    throw new Error("Belum ada akun email yang dikonfigurasi.");
  }

  const results: ReplySyncResult[] = [];
  const errors: { accountEmail: string; message: string }[] = [];

  // Akun dijalankan PARALEL. Sebelumnya berurutan dan memakan 63 detik untuk
  // empat mailbox — melewati plafon 60 detik sehingga proses terpotong di
  // tengah jalan. Tiap akun hanya membaca HTTP keluar, jadi paralel aman.
  const hasil = await Promise.allSettled(
    akun.map((akunIni) => syncSatuAkun(akunIni, hari, onProgress)),
  );

  hasil.forEach((h, i) => {
    const akunIni = akun[i]!;
    if (h.status === "fulfilled") {
      results.push(h.value);
    } else {
      errors.push({
        accountEmail: akunIni.email,
        message: h.reason instanceof Error ? h.reason.message : String(h.reason),
      });
    }
  });

  return { results, errors };
}
