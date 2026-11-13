import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="truncate text-[19px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">{children}</div>
      ) : null}
    </div>
  );
}

type Tone = "default" | "success" | "warning" | "danger" | "info";

const TONE_VALUE: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-red-600",
  info: "text-blue-600",
};

const TONE_DOT: Record<Tone, string> = {
  default: "bg-slate-300",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
};

/**
 * Deretan metrik dalam SATU panel bergaris pemisah.
 * Lebih padat dan tidak "kartu-kartu template" dibanding 4 kotak terpisah.
 */
export function StatStrip({
  items,
  className,
}: {
  items: {
    label: string;
    value: string | number;
    hint?: string;
    tone?: Tone;
  }[];
  className?: string;
}) {
  return (
    <section
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)] lg:grid-cols-4",
        className,
      )}
    >
      {items.map((item, index) => {
        const tone = item.tone ?? "default";
        return (
          <div
            key={item.label}
            className={cn(
              "px-4 py-3.5 sm:px-4",
              // garis pemisah: vertikal antar kolom, horizontal antar baris di layar kecil
              index > 0 && "border-l border-border",
              index === 2 && "max-lg:border-l-0 max-lg:border-t",
              index === 3 && "max-lg:border-t",
              index === 2 && "lg:border-t-0",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden />
              <p className="label-eyebrow truncate">{item.label}</p>
            </div>
            <p
              className={cn(
                "mt-1.5 text-[24px] font-semibold leading-none tracking-[-0.03em] tabular-nums",
                TONE_VALUE[tone],
              )}
            >
              {typeof item.value === "number" ? item.value.toLocaleString("id-ID") : item.value}
            </p>
            {item.hint ? (
              <p className="mt-1.5 truncate text-[11.5px] leading-tight text-muted-foreground">{item.hint}</p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-card px-4 py-3.5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden />
          <p className="label-eyebrow truncate">{label}</p>
        </div>
        {icon ? <span className="shrink-0 text-muted-foreground/60">{icon}</span> : null}
      </div>
      <p
        className={cn(
          "mt-1.5 text-[24px] font-semibold leading-none tracking-[-0.03em] tabular-nums",
          TONE_VALUE[tone],
        )}
      >
        {typeof value === "number" ? value.toLocaleString("id-ID") : value}
      </p>
      {hint ? <p className="mt-1.5 truncate text-[11.5px] leading-tight text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-16 text-center">
      <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-4">
          <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5v-9Z" />
          <path d="M4 10h16M9 6v12" strokeDasharray="2 2" />
        </svg>
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
