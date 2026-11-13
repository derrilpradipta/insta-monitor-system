/**
 * Helper waktu operasional.
 *
 * Aturan penyimpanan:
 * - Timestamp (DateTime) disimpan dalam UTC.
 * - Tanggal kalender (order_date, deadline_date, @db.Date) disimpan sebagai
 *   tengah malam UTC dari tanggal kalender WIB, sehingga tidak bergeser.
 * - Asia/Jakarta tidak memakai DST: offset selalu UTC+7.
 */

export const WIB_OFFSET_MINUTES = 7 * 60;
const WIB_OFFSET_MS = WIB_OFFSET_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Komponen tanggal/jam pada zona Asia/Jakarta. */
export function wibParts(date: Date = new Date()) {
  const shifted = new Date(date.getTime() + WIB_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

/** Format YYYY-MM-DD menurut kalender WIB. */
export function wibDateString(date: Date = new Date()): string {
  const p = wibParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Geser string tanggal YYYY-MM-DD sebanyak n hari. */
export function shiftDateString(dateString: string, days: number): string {
  const d = new Date(`${dateString}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Tanggal kemarin (WIB) dalam format YYYY-MM-DD. */
export function yesterdayWib(): string {
  return shiftDateString(wibDateString(), -1);
}

/** Tanggal besok (WIB) dalam format YYYY-MM-DD. */
export function tomorrowWib(): string {
  return shiftDateString(wibDateString(), 1);
}

/** Tanggal hari ini (WIB) dalam format YYYY-MM-DD. */
export function todayWibSafe(): string {
  return wibDateString();
}

/** Validasi string YYYY-MM-DD. */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Date object (UTC midnight) untuk kolom @db.Date dari string YYYY-MM-DD. */
export function dateOnlyToDb(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

/** String YYYY-MM-DD dari Date kolom @db.Date. */
export function dbDateToString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Awal hari WIB (instan UTC) untuk string tanggal. */
export function startOfWibDay(dateString: string): Date {
  return new Date(new Date(`${dateString}T00:00:00.000Z`).getTime() - WIB_OFFSET_MS);
}

/** Akhir hari WIB (eksklusif) untuk string tanggal. */
export function endOfWibDayExclusive(dateString: string): Date {
  return new Date(startOfWibDay(dateString).getTime() + DAY_MS);
}

/** Rentang UTC [start, end) untuk satu bulan kalender WIB. */
export function monthRangeWib(year: number, month: number) {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start: dateOnlyToDb(first), end: dateOnlyToDb(shiftDateString(last, 1)), last };
}

/** Format tanggal Indonesia: 12 Nov 2026. */
export function formatDateId(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const isDateOnly = typeof value === "string" || d.getUTCHours() === 0;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: isDateOnly ? "UTC" : "Asia/Jakarta",
  }).format(d);
}

/** Format tanggal + jam WIB: 12 Nov 2026, 23.30 */
export function formatDateTimeId(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

/** Format jam WIB saja: 23.30 */
export function formatTimeId(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

/** Nama bulan Indonesia. */
export const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function monthLabelId(month: number, year: number): string {
  return `${MONTH_NAMES_ID[month - 1] ?? month} ${year}`;
}

/** Apakah tanggal (WIB) sudah lewat dibanding hari ini. */
export function isPastDateWib(dateString: string): boolean {
  return dateString < wibDateString();
}

/** Selisih hari kalender (b - a) untuk string YYYY-MM-DD. */
export function diffDays(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY_MS,
  );
}
