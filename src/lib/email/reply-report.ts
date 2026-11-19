/**
 * Perhitungan laporan kecepatan balas email.
 *
 * Dipakai halaman /waktu-balas dan ekspor Excel, supaya angka di layar dan di
 * file tidak pernah berbeda.
 *
 * Yang dihitung hanya percakapan dari manusia (`isAutomated = false`).
 * Newsletter, notifikasi sistem, dan robot tidak pernah dibalas siapa pun —
 * memasukkannya membuat persentase "belum dibalas" terlihat buruk padahal
 * bukan pekerjaan tim.
 */

import { prisma } from "@/lib/db";

export type Rentang = 7 | 30 | 90;

export type Ringkasan = {
  total: number;
  dibalas: number;
  belum: number;
  /** Persentase percakapan yang dibalas, 0–100. */
  persenDibalas: number;
  /** Median menit kalender; null kalau belum ada balasan sama sekali. */
  medianMenit: number | null;
  medianKerjaMenit: number | null;
  rataMenit: number | null;
  /** Rata-rata (mean) menit kerja. Dipakai sebagai angka utama di halaman. */
  rataKerjaMenit: number | null;
  /** Jumlah yang dibalas dalam ≤ 1 jam dan ≤ 4 jam jam kerja. */
  dalam1Jam: number;
  dalam4Jam: number;
  dalam1Hari: number;
};

export type BarisCabang = {
  group: string;
  ringkasan: Ringkasan;
};

export type BarisJam = {
  /** Jam masuk 0–23 WIB. */
  jam: number;
  jumlah: number;
  medianMenit: number | null;
  /** Rata-rata menit balas pada jam itu. */
  rataMenit: number | null;
};

/** Batas "terlambat" — dipakai konsisten di halaman dan ekspor. */
export const BATAS_MENIT = 4 * 60;

const MENIT_HARI = 24 * 60;

function median(nilai: number[]): number | null {
  if (nilai.length === 0) return null;
  const urut = [...nilai].sort((a, b) => a - b);
  const tengah = Math.floor(urut.length / 2);
  return urut.length % 2 === 0 ? Math.round((urut[tengah - 1]! + urut[tengah]!) / 2) : urut[tengah]!;
}

/** Rangkum satu kumpulan baris. */
export function ringkas(
  baris: { replyMinutes: number | null; workMinutes: number | null; repliedAt: Date | null }[],
): Ringkasan {
  const total = baris.length;
  const dibalas = baris.filter((b) => b.repliedAt !== null);
  const belum = total - dibalas.length;

  const kalender = dibalas.map((b) => b.replyMinutes ?? 0);
  const kerja = dibalas.map((b) => b.workMinutes ?? 0);
  const rata = (nilai: number[]) =>
    nilai.length === 0 ? null : Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length);

  return {
    total,
    dibalas: dibalas.length,
    belum,
    persenDibalas: total === 0 ? 0 : Math.round((dibalas.length / total) * 100),
    medianMenit: median(kalender),
    medianKerjaMenit: median(kerja),
    rataMenit: rata(kalender),
    rataKerjaMenit: rata(kerja),
    dalam1Jam: kerja.filter((m) => m <= 60).length,
    dalam4Jam: kerja.filter((m) => m <= BATAS_MENIT).length,
    dalam1Hari: kalender.filter((m) => m <= MENIT_HARI).length,
  };
}

/**
 * Seluruh data laporan untuk satu rentang hari.
 *
 * `groupDariEmail` memetakan alamat email ke nama cabang; dikirim pemanggil
 * supaya modul ini tidak perlu membaca environment.
 */
export async function ambilLaporan(
  hari: Rentang,
  groupDariEmail: (email: string) => string,
) {
  const sejak = new Date(Date.now() - hari * MENIT_HARI * 60_000);

  const baris = await prisma.emailReplyStat.findMany({
    where: { receivedAt: { gte: sejak } },
    orderBy: { receivedAt: "desc" },
    select: {
      accountEmail: true,
      subject: true,
      fromName: true,
      fromAddress: true,
      receivedAt: true,
      repliedAt: true,
      replyMinutes: true,
      workMinutes: true,
      isAutomated: true,
    },
  });

  const manusia = baris.filter((b) => !b.isAutomated);

  // --- Ringkasan keseluruhan ---
  const keseluruhan = ringkas(manusia);

  // --- Per cabang ---
  const perCabangPeta = new Map<string, typeof manusia>();
  for (const b of manusia) {
    const g = groupDariEmail(b.accountEmail);
    if (!perCabangPeta.has(g)) perCabangPeta.set(g, []);
    perCabangPeta.get(g)!.push(b);
  }
  const perCabang: BarisCabang[] = Array.from(perCabangPeta.entries())
    .map(([group, rows]) => ({ group, ringkasan: ringkas(rows) }))
    .sort((a, b) => b.ringkasan.total - a.ringkasan.total);

  // --- Per jam masuk (WIB) ---
  // `jumlah` menghitung SEMUA email masuk (dibalas maupun belum) supaya grafik
  // benar-benar menggambarkan volume. `medianMenit` hanya dari yang dibalas —
  // email yang belum dibalas tidak punya waktu balas untuk dirata-ratakan.
  const perJamJumlah = new Map<number, number>();
  const perJamNilai = new Map<number, number[]>();
  for (const b of manusia) {
    const jam = new Date(b.receivedAt.getTime() + 7 * 3_600_000).getUTCHours();
    perJamJumlah.set(jam, (perJamJumlah.get(jam) ?? 0) + 1);
    if (b.repliedAt) {
      if (!perJamNilai.has(jam)) perJamNilai.set(jam, []);
      perJamNilai.get(jam)!.push(b.replyMinutes ?? 0);
    }
  }
  const perJam: BarisJam[] = Array.from({ length: 24 }, (_, jam) => {
    const nilai = perJamNilai.get(jam) ?? [];
    return {
      jam,
      jumlah: perJamJumlah.get(jam) ?? 0,
      medianMenit: median(nilai),
      rataMenit:
        nilai.length === 0 ? null : Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length),
    };
  }).filter((j) => j.jumlah > 0);

  const terakhir = await prisma.emailReplyStat.findFirst({
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });

  return {
    hari,
    keseluruhan,
    perCabang,
    perJam,
    jumlahOtomatis: baris.length - manusia.length,
    terakhirDiperbarui: terakhir?.syncedAt ?? null,
  };
}

/** Format menit jadi teks ringkas: "38 mnt", "2,4 jam", "3,1 hari". */
export function formatMenit(menit: number | null | undefined): string {
  if (menit == null) return "—";
  if (menit < 60) return `${menit} mnt`;
  const jam = menit / 60;
  if (jam < 24) return `${jam.toFixed(1).replace(".", ",")} jam`;
  return `${(jam / 24).toFixed(1).replace(".", ",")} hari`;
}
