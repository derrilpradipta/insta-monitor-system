import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-8 w-full rounded-md bg-card px-2.5 py-1 text-[13px] shadow-[0_0_0_1px_var(--input)] transition-shadow",
        "placeholder:text-muted-foreground/80",
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--ring)] focus-visible:ring-2 focus-visible:ring-ring/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
