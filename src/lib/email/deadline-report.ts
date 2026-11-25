/**
 * Kirim laporan deadline lewat Gmail (Composio), lengkap dengan lampiran Excel.
 *
 * Alurnya tiga langkah, dan urutannya tidak boleh dibalik:
 *  1. minta izin unggah  → dapat URL sementara + kunci penyimpanan
 *  2. unggah file ke URL itu
 *  3. kirim email dengan menyebut kunci tadi sebagai lampiran
 *
 * File harus benar-benar terunggah sebelum email dikirim; Composio membacanya
 * lagi dari penyimpanan saat menyusun pesan. Kalau langkah 2 dilewati, Gmail
 * menerima email tanpa lampiran dan tidak ada error yang jelas.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { readComposioConfig, readMailAccounts, isAlamatSendiri } from "@/lib/email/accounts";
import { buatExcelDeadline } from "@/lib/deadline-excel";
import { formatDateId, todayWibSafe } from "@/lib/time";

export type HasilKirim = {
  runId: string;
  reportDate: string;
  to: string[];
  orderCount: number;
  fileName: string;
  skipped: boolean;
  reason?: string;
};

const MIMETYPE_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Alamat pengirim: mailbox pertama yang dikonfigurasi. */
function akunPengirim() {
  const akun = readMailAccounts();
  const pertama = akun[0];
  if (!pertama) {
    throw new Error("Belum ada akun email yang dikonfigurasi untuk mengirim laporan.");
  }
  return pertama;
}

/** Penerima laporan, dari env (dipisah koma bila lebih dari satu). */
export function penerimaLaporan(): string[] {
  return (process.env.DEADLINE_REPORT_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

/**
 * Unggah satu file ke penyimpanan Composio, kembalikan keterangannya.
 *
 * Dua langkah: minta izin (dapat URL), lalu kirim isi file ke URL itu.
 */
async function unggahLampiran(
  nama: string,
  isi: Buffer,
): Promise<{ name: string; mimetype: string; s3key: string }> {
  const config = readComposioConfig();

  const minta = await fetch(`${config.baseUrl}/api/v3/files/upload/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-api-key": config.apiKey,
      "x-project-id": config.projectId,
    },
    body: JSON.stringify({
      toolkit_slug: "gmail",
      tool_slug: "GMAIL_SEND_EMAIL",
      filename: nama,
      mimetype: MIMETYPE_XLSX,
      md5: createHash("md5").update(isi).digest("hex"),
    }),
    signal: AbortSignal.timeout(45_000),
  });

  const teks = await minta.text();
  let hasil: { key?: string; new_presigned_url?: string; newPresignedUrl?: string; id?: string };
  try {
    hasil = JSON.parse(teks);
  } catch {
    throw new Error(`Permintaan unggah ditolak (HTTP ${minta.status}).`);
  }
  if (!minta.ok) {
    throw new Error(`Permintaan unggah gagal (HTTP ${minta.status}): ${teks.slice(0, 200)}`);
  }

  const url = hasil.new_presigned_url ?? hasil.newPresignedUrl;
  const key = hasil.key;
  if (!url || !key) {
    throw new Error("Balasan unggah tidak memuat URL atau kunci penyimpanan.");
  }

  const kirim = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": MIMETYPE_XLSX },
    body: new Uint8Array(isi),
    signal: AbortSignal.timeout(60_000),
  });

  if (!kirim.ok) {
    throw new Error(`Berkas gagal diunggah (HTTP ${kirim.status}).`);
  }

  return { name: nama, mimetype: MIMETYPE_XLSX, s3key: key };
}

/** Kirim satu email lewat Gmail API (Composio). */
async function kirimEmail(args: {
  dariAkun: ReturnType<typeof akunPengirim>;
  ke: string[];
  subjek: string;
  badan: string;
  lampiran: { name: string; mimetype: string; s3key: string };
}): Promise<void> {
  const config = readComposioConfig();

  const response = await fetch(
    `${config.baseUrl}/api/v3/tools/execute/GMAIL_SEND_EMAIL`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-api-key": config.apiKey,
        "x-project-id": config.projectId,
      },
      body: JSON.stringify({
        user_id: config.userId,
        connected_account_id: args.dariAkun.connectedAccountId,
        arguments: {
          user_id: "me",
          recipient_email: args.ke[0],
          extra_recipients: args.ke.slice(1),
          subject: args.subjek,
          body: args.badan,
          is_html: false,
          attachment: args.lampiran,
        },
      }),
      // Lampiran membuat pengiriman lebih lambat daripada email biasa.
      signal: AbortSignal.timeout(120_000),
    },
  );

  const teks = await response.text();
  let hasil: { error?: { message?: string } | string; successful?: boolean };
  try {
    hasil = JSON.parse(teks);
  } catch {
    throw new Error(`Balasan Gmail tidak dapat dibaca (HTTP ${response.status}).`);
  }

  if (!response.ok || hasil.error || hasil.successful === false) {
    const pesan =
      typeof hasil.error === "object" && hasil.error
        ? (hasil.error.message ?? "Gmail menolak permintaan.")
        : typeof hasil.error === "string"
          ? hasil.error
          : "Gmail menolak permintaan.";
    throw new Error(pesan);
  }
}

/** Badan email: ringkasan supaya penerima tahu isinya tanpa membuka lampiran. */
function susunBadan(tanggal: string, jumlah: number, perCabang: { nama: string; jumlah: number }[]): string {
  const rincian = perCabang
    .filter((c) => c.jumlah > 0)
    .map((c) => `  ${c.nama.padEnd(20, " ")} ${c.jumlah}`)
    .join("\n");

  return [
    "Selamat pagi,",
    "",
    `Berikut daftar pesanan yang tenggat ${formatDateId(tanggal)}.`,
    "",
    `  Total pesanan : ${jumlah}`,
    rincian ? `  Rincian cabang:\n${rincian}` : "",
    "",
    "Rincian lengkap ada di lampiran. Isi kolom Ceklis bila pesanan sudah selesai.",
    "",
    "—",
    "Instaprint Monitoring System",
  ]
    .filter((b) => b !== "")
    .join("\n");
}

/**
 * Kirim laporan deadline satu tanggal (default: hari ini WIB).
 *
 * Kalau tidak ada pesanan pada tanggal itu, email TIDAK dikirim dan hasilnya
 * ditandai `skipped` — mengirim lampiran kosong setiap hari hanya melatih
 * penerima untuk mengabaikan email ini.
 */
export async function kirimLaporanDeadline(
  opsi: { tanggal?: string; triggeredBy?: string | null; paksa?: boolean } = {},
): Promise<HasilKirim> {
  const tanggal = opsi.tanggal ?? todayWibSafe();
  const ke = penerimaLaporan();

  if (ke.length === 0) {
    throw new Error("DEADLINE_REPORT_TO belum diisi. Tidak ada tujuan pengiriman.");
  }

  const akun = akunPengirim();

  // Penjaga kiriman ganda. Dua penjadwal bisa aktif bersamaan (Vercel
  // Schedules dan penjadwal internal di server), dan tanpa penjaga ini
  // penerima mendapat dua email berisi lampiran yang sama.
  // Tombol "Kirim ke email" memakai `paksa: true` karena itu permintaan sadar
  // dari pengguna yang memang ingin mengirim ulang.
  if (!opsi.paksa) {
    const sudah = await prisma.scrapingLog.findFirst({
      where: { processType: "DEADLINE_REPORT", status: "SUCCESS", targetDate: new Date(`${tanggal}T00:00:00.000Z`) },
      select: { id: true, totalFound: true },
    });
    if (sudah) {
      return {
        runId: sudah.id,
        reportDate: tanggal,
        to: ke,
        orderCount: sudah.totalFound,
        fileName: "",
        skipped: true,
        reason: "Laporan tanggal ini sudah terkirim sebelumnya.",
      };
    }
  }

  // Email ke mailbox kita sendiri tidak akan pernah masuk daftar "belum dibaca"
  // (disaring sebagai email internal), jadi aman mengirim ke alamat sendiri.
  // Riwayat ditulis ke `scraping_logs` — tabel yang sama dengan pengambilan
  // data pesanan — supaya semuanya terlihat di satu halaman Riwayat. Jenisnya
  // dibedakan lewat processType = DEADLINE_REPORT.
  const run = await prisma.scrapingLog.create({
    data: {
      processType: "DEADLINE_REPORT",
      status: "RUNNING",
      targetDate: new Date(`${tanggal}T00:00:00.000Z`),
      triggeredBy: opsi.triggeredBy ?? null,
      detail: {
        fromEmail: akun.email,
        toEmails: ke.join(","),
        reportDate: tanggal,
      },
    },
  });

  try {
    const excel = await buatExcelDeadline({ dari: tanggal, sampai: tanggal });

    // Rincian per cabang untuk badan email.
    const orders = await prisma.order.groupBy({
      by: ["branchId"],
      where: { deadlineDate: new Date(`${tanggal}T00:00:00.000Z`) },
      _count: { _all: true },
    });
    const cabang = await prisma.branch.findMany({ select: { id: true, branchName: true } });
    const namaCabang = new Map(cabang.map((c) => [c.id, c.branchName]));
    const perCabang = orders.map((o) => ({
      nama: namaCabang.get(o.branchId) ?? "Cabang lain",
      jumlah: o._count._all,
    }));

    if (excel.jumlah === 0) {
      // Tidak ada pesanan: email sengaja tidak dikirim. Dicatat sebagai
      // SUCCESS dengan keterangan supaya terlihat di riwayat bahwa sistem
      // memang berjalan — bukan gagal.
      await prisma.scrapingLog.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          totalFound: 0,
          errorMessage: "Tidak ada pesanan dengan tenggat pada tanggal ini — email tidak dikirim.",
        },
      });
      return {
        runId: run.id,
        reportDate: tanggal,
        to: ke,
        orderCount: 0,
        fileName: excel.fileName,
        skipped: true,
        reason: "Tidak ada pesanan dengan tenggat pada tanggal ini.",
      };
    }

    const lampiran = await unggahLampiran(excel.fileName, Buffer.from(excel.buffer));

    await kirimEmail({
      dariAkun: akun,
      ke,
      subjek: `[Instaprint] Deadline ${formatDateId(tanggal)} — ${excel.jumlah} pesanan`,
      badan: susunBadan(tanggal, excel.jumlah, perCabang),
      lampiran,
    });

    await prisma.scrapingLog.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        totalFound: excel.jumlah,
        detail: {
          fromEmail: akun.email,
          toEmails: ke.join(","),
          reportDate: tanggal,
          fileName: excel.fileName,
        },
      },
    });

    return {
      runId: run.id,
      reportDate: tanggal,
      to: ke,
      orderCount: excel.jumlah,
      fileName: excel.fileName,
      skipped: false,
    };
  } catch (error) {
    const pesan = error instanceof Error ? error.message : String(error);
    await prisma.scrapingLog.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), errorMessage: pesan.slice(0, 2000) },
    });
    throw error;
  }
}

/** Apakah alamat pengirim termasuk mailbox kita (untuk uji kewarasan). */
export function pengirimInternal(email: string): boolean {
  return isAlamatSendiri(email);
}
