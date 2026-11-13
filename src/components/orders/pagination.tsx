import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  makeHref,
  itemLabel = "pesanan",
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  makeHref: (page: number) => string;
  itemLabel?: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const pages: (number | "…")[] = [];
  const push = (value: number | "…") => {
    if (pages.at(-1) !== value) pages.push(value);
  };
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i += 1) push(i);
  } else {
    push(1);
    if (page > 3) push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i += 1) push(i);
    if (page < totalPages - 2) push("…");
    push(totalPages);
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[12px] text-muted-foreground">
        Menampilkan <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> dari{" "}
        <span className="font-medium text-foreground">{total.toLocaleString("id-ID")}</span> {itemLabel}
      </p>

      <nav className="flex items-center gap-1" aria-label="Navigasi halaman">
        <PageLink href={makeHref(Math.max(1, page - 1))} disabled={page <= 1} label="Sebelumnya">
          <ChevronLeft className="size-4" />
        </PageLink>
        {pages.map((value, index) =>
          value === "…" ? (
            <span key={`gap-${index}`} className="px-2 text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <Link
              key={value}
              href={makeHref(value)}
              className={cn(
                "flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors",
                value === page
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-secondary",
              )}
            >
              {value}
            </Link>
          ),
        )}
        <PageLink
          href={makeHref(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          label="Berikutnya"
        >
          <ChevronRight className="size-4" />
        </PageLink>
      </nav>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="flex size-8 items-center justify-center rounded-md text-muted-foreground/40">
        {children}
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary"
    >
      {children}
    </Link>
  );
}
