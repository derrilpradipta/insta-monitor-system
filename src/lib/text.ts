/**
 * Normalisasi teks dari website sumber.
 * Dipakai saat scraping maupun saat merapikan data yang sudah tersimpan,
 * sehingga hasilnya konsisten.
 */

/** Bersihkan nama pelanggan: buang kurung kosong / username duplikat. */
export function cleanCustomerName(raw: string): string {
  let name = (raw ?? "").replace(/\s+/g, " ").trim();

  // Format marketplace: "user (user )" atau "user ( user )" -> "user"
  const paren = name.match(/^(.+?)\s*\(\s*([^)]*?)\s*\)\s*$/);
  if (paren) {
    const outside = paren[1]!.trim();
    const inside = paren[2]!.trim();
    if (!inside) return outside;
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalize(outside) === normalize(inside)) return outside;
    // "Andy (Dewi)" -> nama panggilan di dalam kurung lebih informatif? Pertahankan luar.
    return `${outside} (${inside})`;
  }

  // Buang nomor telepon di belakang: "Valen - 0895400928697" -> "Valen"
  name = name.replace(/\s*-\s*\d[\d\s-]{6,}$/, "").trim();
  return name || (raw ?? "").trim();
}

const PRODUCT_NOISE = [
  /Catatan Deskprint\s*:?.*/gi,
  /Deadline\s*:\s*\d{2}-\d{2}-\d{4}[^;·]*/gi,
  /\bCabang\b/gi,
  /Setujui\s*Tolak/gi,
  /^(Disetujui|Setujui|Tolak)$/i,
];

/** Label antarmuka sumber yang sering ikut terbaca sebagai nama produk. */
const NON_PRODUCT_LABELS = new Set(["download", "setujui", "tolak", "disetujui", "-"]);

/** Teks yang jelas bukan nama produk (catatan operator / kontak). */
function looksLikeNote(text: string): boolean {
  return /@|\(email\)|^op[_\s-]|\bno\.?\s*pesanan\b/i.test(text);
}

/** Ambil bagian nama produk saja dari sel tabel detail. */
export function cleanProductName(raw: string): string {
  let text = (raw ?? "").replace(/\r/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const deadlineIndex = text.search(/Deadline\s*:/i);
  if (deadlineIndex > 0) text = text.slice(0, deadlineIndex);
  const noteIndex = text.search(/Catatan Deskprint/i);
  if (noteIndex > 0) text = text.slice(0, noteIndex);

  for (const pattern of PRODUCT_NOISE) text = text.replace(pattern, " ");
  text = text.replace(/[;,]\s*$/g, "").replace(/\s{2,}/g, " ").trim();
  if (NON_PRODUCT_LABELS.has(text.toLowerCase())) return "";
  if (looksLikeNote(text)) return "";
  return text;
}

/** Gabungkan beberapa produk menjadi satu kolom ringkas tanpa duplikasi. */
export function joinProductNames(names: string[], max = 4): string {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  let fallback = "";

  const stripNotes = (value: string) =>
    value
      .replace(/Catatan Deskprint\s*:?.*/gi, " ")
      .replace(/Deadline\s*:\s*\d{2}-\d{2}-\d{4}[^;·]*/gi, " ")
      .replace(/\bCabang\b/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

  for (const raw of names) {
    for (const part of raw.split(/;\s*(?=[A-Z0-9])/)) {
      const name = cleanProductName(part);
      if (!name || name.length < 2) {
        if (!fallback) {
          const stripped = stripNotes(part).replace(/[;,]\s*$/g, "").trim();
          if (stripped.length >= 3) fallback = stripped.slice(0, 140);
        }
        continue;
      }
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(name);
      if (cleaned.length >= max) break;
    }
    if (cleaned.length >= max) break;
  }

  return cleaned.join(" · ") || fallback || "-";
}
