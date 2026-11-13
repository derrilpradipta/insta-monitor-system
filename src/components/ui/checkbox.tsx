"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Checkbox ringan berbasis <button role="checkbox">.
 * Sengaja tidak memakai hidden input agar tidak memicu hydration mismatch
 * pada React 19 (masalah umum pada checkbox berbasis Radix).
 */
export function Checkbox({
  checked,
  disabled,
  onCheckedChange,
  className,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded border shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-slate-300 bg-card text-transparent hover:border-slate-400",
        className,
      )}
    >
      <Check className="size-3" />
    </button>
  );
}
