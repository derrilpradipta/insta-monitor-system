"use client";

import { useState } from "react";
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SUGGESTIONS = [
  "Ringkas kondisi operasional hari ini",
  "Cabang mana yang paling perlu perhatian?",
  "Pola keterlambatan apa yang terlihat?",
  "Pesanan mana yang lama tidak diperbarui?",
];

export function AiPanel({ configured, model }: { configured: boolean; model: string | null }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (prompt: string) => {
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });
      const data = (await response.json()) as { ok?: boolean; answer?: string; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Analisis gagal dijalankan.");
        return;
      }
      setAnswer(data.answer ?? "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Gagal menghubungi server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> Asisten Analisis AI
        </CardTitle>
        {model ? <span className="text-xs text-muted-foreground">{model}</span> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {!configured ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            AI belum dikonfigurasi. Isi <code className="mx-1 rounded bg-white/60 px-1">AI_BASE_URL</code> dan{" "}
            <code className="mx-1 rounded bg-white/60 px-1">AI_MODEL</code> di file <code>.env</code> lalu mulai ulang
            server.
          </p>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!loading && configured) ask(question);
          }}
          className="flex gap-2"
        >
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Tanya tentang kondisi operasional…"
            disabled={loading || !configured}
          />
          <Button type="submit" disabled={loading || !configured}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading ? "Menganalisis…" : "Analisis"}
          </Button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || !configured}
              onClick={() => {
                setQuestion(suggestion);
                ask(suggestion);
              }}
            >
              {suggestion}
            </Button>
          ))}
        </div>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        {answer ? (
          <div className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/50 p-4 text-sm leading-relaxed">
            {answer}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          AI hanya membaca data. Perubahan status hanya bisa dilakukan lewat sinkronisasi atau checklist pimpinan.
        </p>
      </CardContent>
    </Card>
  );
}
