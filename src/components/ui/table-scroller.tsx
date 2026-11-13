"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Pembungkus tabel dengan penanda geser horizontal.
 * Bayangan tepi hanya muncul kalau masih ada kolom tersembunyi di sisi itu,
 * jadi pengguna tahu tabel bisa digeser tanpa harus menebak.
 */
export function TableScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setState({ left: el.scrollLeft > 2, right: max > 2 && el.scrollLeft < max - 2 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  return (
    <div className="relative">
      <div ref={ref} className="w-full overflow-x-auto scrollbar-thin">
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-slate-900/20 to-transparent transition-opacity",
          state.left ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-slate-900/20 to-transparent transition-opacity",
          state.right ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
