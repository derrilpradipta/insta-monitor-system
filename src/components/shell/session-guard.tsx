"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const IDLE_MS = 30 * 60 * 1000;
const ACTIVITY_PING_MS = 5 * 60 * 1000;
const CHECK_MS = 60 * 1000;

/**
 * Idle guard sisi klien:
 * - pengguna yang tidak beraktivitas 30 menit diarahkan ke halaman login;
 * - selama aktif, waktu aktivitas di server diperbarui tiap 5 menit.
 * Validasi otoritatif tetap dilakukan server (getSession).
 */
export function SessionGuard() {
  const router = useRouter();

  useEffect(() => {
    let lastActivity = Date.now();
    let lastPing = Date.now();

    const onActivity = () => {
      lastActivity = Date.now();
    };

    const events: Array<keyof WindowEventMap> = ["click", "keydown", "mousemove", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

    const timer = window.setInterval(() => {
      const now = Date.now();
      if (now - lastActivity >= IDLE_MS) {
        router.replace("/login?reason=expired");
        return;
      }
      // Perbarui aktivitas server hanya jika pengguna benar-benar aktif.
      if (now - lastPing >= ACTIVITY_PING_MS && now - lastActivity < CHECK_MS) {
        lastPing = now;
        void fetch("/api/session/touch", { method: "POST" }).then((response) => {
          if (response.status === 401) router.replace("/login?reason=expired");
        });
      }
    }, CHECK_MS);

    return () => {
      events.forEach((event) => window.removeEventListener(event, onActivity));
      window.clearInterval(timer);
    };
  }, [router]);

  return null;
}
