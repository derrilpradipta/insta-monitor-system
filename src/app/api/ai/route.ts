import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { askOperationalAi } from "@/lib/ai";
import { logActivity } from "@/lib/activity";

export const maxDuration = 120;

/** Analisis AI berbasis data aktual. AI tidak pernah mengubah data. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Sesi berakhir." }, { status: 401 });
  }

  // Batas ukuran body (OWASP A04 Insecure Design): pertanyaan panjang tidak
  // berguna dan hanya membebani model. 4 KB jauh lebih dari cukup.
  const panjang = Number(request.headers.get("content-length") ?? 0);
  if (panjang > 4096) {
    return NextResponse.json({ ok: false, message: "Pertanyaan terlalu panjang." }, { status: 413 });
  }

  const body = (await request.json().catch(() => ({}))) as { question?: string };
  const question = String(body.question ?? "").slice(0, 1000);

  const result = await askOperationalAi(question);

  await logActivity({
    userId: session.user.id,
    action: "AI_ANALYSIS",
    entityType: "ai",
    description: `Analisis AI: ${question || "(ringkasan otomatis)"}`.slice(0, 200),
  });

  return NextResponse.json(
    {
      ok: result.ok,
      answer: result.answer,
      error: result.error,
      model: result.model,
      snapshot: result.snapshot,
    },
    { status: result.ok ? 200 : 200 },
  );
}
