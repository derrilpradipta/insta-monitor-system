"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  CalendarClock,
  ClipboardCheck,
  History,
  LogOut,
  Mail,
  Menu,
  Sparkles,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/labels";
import type { Role } from "@prisma/client";

const MAIN_NAV = [{ href: "/deadline", label: "Deadline", icon: CalendarClock }];

const SUPPORT_NAV = [
  { href: "/email", label: "Email", icon: Mail },
  { href: "/monthly-review", label: "Pemeriksaan Bulanan", icon: ClipboardCheck },
  { href: "/history", label: "Riwayat Pengambilan", icon: History },
  { href: "/analysis", label: "Analisis AI", icon: Sparkles },
  { href: "/notifications", label: "Notifikasi", icon: Bell, badgeKey: "unread" as const },
  { href: "/profile", label: "Profil Pengguna", icon: UserRound },
];

export function SidebarNav({
  user,
  unread,
  logoutAction,
}: {
  user: { name: string; email: string; role: Role };
  unread: number;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Jangan tampilkan baris kedua kalau isinya sama dengan nama (nama akun = peran).
  const roleLabel = ROLE_LABEL[user.role];
  const secondary =
    user.email && user.email !== user.name
      ? user.email
      : roleLabel && roleLabel.toLowerCase() !== user.name.toLowerCase()
        ? roleLabel
        : user.email && user.email !== user.name
          ? user.email
          : null;

  const NavLink = ({
    href,
    label,
    icon: Icon,
    badge,
  }: {
    href: string;
    label: string;
    icon: LucideIcon;
    badge?: number;
  }) => {
    const active = isActive(href);
    return (
      <Link
        href={href}
        onClick={() => setMobileOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] leading-5 transition-colors",
          active
            ? "bg-white/[0.07] font-medium text-white"
            : "text-sidebar-foreground hover:bg-white/[0.04] hover:text-white/90",
        )}
      >
        <Icon
          className={cn(
            "size-[15px] shrink-0 transition-colors",
            active ? "text-blue-300" : "text-sidebar-muted group-hover:text-sidebar-foreground",
          )}
        />
        <span className="flex-1 truncate">{label}</span>
        {badge ? (
          <span className="min-w-[18px] rounded-full bg-blue-500 px-1.5 py-px text-center text-[10px] font-semibold leading-4 text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </Link>
    );
  };

  const nav = (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-[58px] items-center gap-2.5 px-4">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-instaprint.png" alt="Instaprint" className="h-auto w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-tight text-white">Monitoring</p>
          <p className="truncate text-[10.5px] leading-tight tracking-wide text-sidebar-muted">INSTAPRINT</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-3 scrollbar-thin">
        <div className="space-y-0.5">
          <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-sidebar-muted/80">
            Menu utama
          </p>
          {MAIN_NAV.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </div>

        <div className="space-y-0.5">
          <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-sidebar-muted/80">
            Pendukung
          </p>
          {SUPPORT_NAV.map((item) => (
            <NavLink key={item.href} {...item} badge={item.badgeKey ? unread : undefined} />
          ))}
        </div>
      </nav>

      <div className="px-2.5 pb-3">
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <div className="flex items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-white">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium leading-tight text-white">{user.name}</p>
              {secondary ? (
                <p className="truncate text-[10.5px] leading-tight text-sidebar-muted">{secondary}</p>
              ) : null}
            </div>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="mt-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] text-sidebar-foreground transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            <LogOut className="size-[15px] text-sidebar-muted" />
            Keluar
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[228px] border-r border-white/[0.06] lg:block">
        {nav}
      </aside>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 flex size-9 items-center justify-center rounded-md bg-sidebar text-white shadow-lg lg:hidden"
        aria-label="Buka menu"
      >
        <Menu className="size-4" />
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
            aria-label="Tutup menu"
          />
          <div className="absolute inset-y-0 left-0 w-[228px] shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-3 z-10 flex size-8 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Tutup menu"
            >
              <X className="size-4" />
            </button>
            {nav}
          </div>
        </div>
      ) : null}
    </>
  );
}
