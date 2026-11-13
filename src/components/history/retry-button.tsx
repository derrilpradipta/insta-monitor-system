"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryButton({
  logId,
  processType,
  targetDate,
}: {
  logId: string;
  processType: string;
  targetDate?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const retry = () => {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/scraper/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId }),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string; logId?: string };
      if (!response.ok || !data.ok) {
        setMessage(data.message ?? "Gagal menjalankan ulang proses.");
        return;
      }
      router.push(`/history/${data.logId}`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={retry} disabled={pending} title={`${processType} · ${targetDate ?? ""}`}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        {pending ? "Menjalankan…" : "Jalankan ulang"}
      </Button>
      {message ? <p className="text-xs text-red-600">{message}</p> : null}
    </div>
  );
}
