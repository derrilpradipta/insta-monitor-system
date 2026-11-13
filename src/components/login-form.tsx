"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <form action={formAction} className="space-y-5">
      {notice ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}

      {state.error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {state.error}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="identifier">Email atau username</Label>
        <Input
          id="identifier"
          name="identifier"
          autoComplete="username"
          placeholder="nama@instaprint.co.id"
          required
          autoFocus
          className="h-10"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            className="h-10 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" className="h-10 w-full" disabled={pending || !ready}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Memproses…
          </>
        ) : (
          <>
            <LogIn className="size-4" /> Masuk
          </>
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Sesi otomatis berakhir setelah 30 menit tanpa aktivitas.
      </p>
    </form>
  );
}
