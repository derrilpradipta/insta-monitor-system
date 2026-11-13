import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-[2px] text-[11px] font-medium leading-4 ring-1 ring-inset",
        "bg-slate-50 text-slate-600 ring-slate-500/15",
        className,
      )}
      {...props}
    />
  );
}
