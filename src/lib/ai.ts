import { buildOperationalSnapshot, type OperationalSnapshot } from "@/lib/analytics";

const SYSTEM_PROMPT = `Anda asisten analisis operasional percetakan Instaprint.
ATURAN WAJIB:
- Jawab dalam bahasa Indonesia yang ringkas dan profesional.
- Gunakan HANYA angka dari data JSON yang diberikan. Jangan mengarang angka, nama cabang, atau pesanan.
- Jika sebuah data tidak tersedia, katakan "data belum tersedia".
- Anda TIDAK BOLEH mengubah status, menghapus data, atau mengonfirmasi checklist. Anda hanya memberi analisis dan rekomendasi.
- Struktur jawaban: (1) Ringkasan kondisi, (2) Temuan utama dengan angka, (3) Rekomendasi tindak lanjut berupa poin-poin singkat.`;

export type AiAnswer = {
  ok: boolean;
  answer: string;
  model?: string;
  error?: string;
  snapshot: OperationalSnapshot;
};

/** Analisis AI berbasis data aktual (endpoint OpenAI-compatible, mis. 9Router). */
export async function askOperationalAi(question: string): Promise<AiAnswer> {
  const snapshot = await buildOperationalSnapshot();
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (!baseUrl || !model) {
    return {
      ok: false,
      answer: "",
      error: "Analisis AI belum dikonfigurasi. Isi AI_BASE_URL dan AI_MODEL di .env.",
      snapshot,
    };
  }

  const payload = {
    model,
    temperature: 0.2,
    max_tokens: 1200,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `DATA OPERASIONAL (JSON):\n${JSON.stringify(snapshot)}\n\nPERTANYAAN: ${question || "Buat ringkasan kondisi operasional hari ini dan rekomendasi tindak lanjut."}`,
      },
    ],
  };

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        answer: "",
        error: `Layanan AI menolak permintaan (HTTP ${response.status}): ${text.slice(0, 300)}`,
        snapshot,
      };
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return { ok: false, answer: "", error: "Layanan AI tidak mengembalikan jawaban.", snapshot };
    }
    return { ok: true, answer, model, snapshot };
  } catch (error) {
    return {
      ok: false,
      answer: "",
      error: error instanceof Error ? `Gagal menghubungi layanan AI: ${error.message}` : "Gagal menghubungi layanan AI.",
      snapshot,
    };
  }
}
