"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { Eye, EyeOff, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginAction, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = {};

const noopSubscribe = () => () => {};

export function LoginForm({ notice }: { notice?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  // Form server action baru aktif setelah React selesai hidrasi. Menekan tombol
  // sebelum itu membuat browser mengirim form biasa tanpa action (login gagal
  // tanpa pesan). Nilai ini false saat SSR dan true setelah hidrasi.
  const ready = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  return (
    <form action={formAction} className="space-y-4">
      {notice ? (
        <div className="flex items-start gap-2.5 rounded-[10px] bg-[#fdf6e7] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#8a5a12]">
          <ShieldCheck className="mt-px size-4 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}

      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[10px] bg-[#fdf0ef] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#a5342b]"
        >
          <ShieldAlert className="mt-px size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <FloatingField
        id="identifier"
        name="identifier"
        label="Email atau username"
        autoComplete="username"
        placeholder="nama@instaprint.co.id"
        defaultValue={state.identifier}
        autoFocus
      />

      <FloatingField
        id="password"
        name="password"
        label="Password"
        type={showPassword ? "text" : "password"}
        autoComplete="current-password"
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:bg-white/80 hover:text-foreground"
            aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
          >
            {showPassword ? <EyeOff className="size-[17px]" /> : <Eye className="size-[17px]" />}
          </button>
        }
      />

      <Button
        type="submit"
        disabled={pending || !ready}
        className="h-12 w-full rounded-[10px] text-[13.5px] font-semibold shadow-[0_8px_18px_-10px_rgb(37_99_235/0.85)]"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Memproses…
          </>
        ) : (
          "Masuk"
        )}
      </Button>
    </form>
  );
}

/**
 * Kolom isian bergaya "label mengambang": kotak abu-abu tanpa garis, label kecil
 * menetap di dalamnya, nilai diketik di bawah label. Khusus tampilan login —
 * input global (`ui/input`) tetap dipakai di dalam aplikasi.
 */
function FloatingField({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  placeholder,
  defaultValue,
  autoFocus,
  trailing,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  defaultValue?: string;
  autoFocus?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="relative rounded-[10px] bg-[#f4f6f8] shadow-[0_0_0_1px_transparent] transition-[box-shadow,background-color] duration-150 focus-within:bg-white focus-within:shadow-[0_0_0_1.5px_var(--primary)] hover:bg-[#eef0f3] focus-within:hover:bg-white">
        <input
          id={id}
          name={name}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          defaultValue={defaultValue}
          autoFocus={autoFocus}
          required
          spellCheck={false}
          className="peer h-[56px] w-full rounded-[10px] bg-transparent px-4 pb-2 pt-[26px] text-[13.5px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/90"
          style={trailing ? { paddingRight: "2.75rem" } : undefined}
        />
        <label
          htmlFor={id}
          className="pointer-events-none absolute inset-x-4 top-[9px] text-[10.5px] font-medium leading-none text-muted-foreground"
        >
          {label}
        </label>
        {trailing}
      </div>
    </div>
  );
}
