"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction, type PasswordState } from "@/app/actions/auth";

const initialState: PasswordState = {};

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);
  const [show, setShow] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}

      {[
        { name: "currentPassword", label: "Password lama", autoComplete: "current-password" },
        { name: "newPassword", label: "Password baru", autoComplete: "new-password" },
        { name: "confirmPassword", label: "Konfirmasi password baru", autoComplete: "new-password" },
      ].map((field) => (
        <div key={field.name} className="space-y-2">
          <Label htmlFor={field.name}>{field.label}</Label>
          <div className="relative">
            <Input
              id={field.name}
              name={field.name}
              type={show ? "text" : "password"}
              autoComplete={field.autoComplete}
              required
              minLength={field.name === "currentPassword" ? undefined : 8}
              className="pr-10"
            />
            {field.name === "currentPassword" ? (
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
                aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            ) : null}
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Minimal 8 karakter. Setelah berhasil, semua sesi lain otomatis dikeluarkan.
      </p>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        {pending ? "Menyimpan…" : "Simpan password baru"}
      </Button>
    </form>
  );
}
