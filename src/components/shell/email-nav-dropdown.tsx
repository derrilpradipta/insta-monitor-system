"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export type EmailNavGroup = {
  slug: string;
  name: string;
  unread: number;
};

/**
 * Menu Email di sidebar dengan dropdown per cabang.
 *
 * Terbuka otomatis saat salah satu halaman email sedang dibuka, supaya cabang
 * yang aktif langsung terlihat tanpa perlu klik. Bisa juga dibuka-tutup manual.
 */
export function EmailNavDropdown({ groups }: { groups: EmailNavGroup[] }) {
  const pathname = usePathname();
  const aktifSlug = groups.find((g) => pathname === `/email/${g.slug}` || pathname.startsWith(`/email/${g.slug}/`))?.slug ?? null;
  const diHalamanEmail = pathname === "/email" || pathname.startsWith("/email");

  // Dropdown terbuka secara bawaan supaya ketiga cabang langsung terlihat dan
  // cukup satu klik untuk berpindah. Pengguna tetap bisa menutupnya; pilihan
  // itu diikat ke pathname sehingga saat pindah halaman kembali terbuka.
  const [pilihan, setPilihan] = useState<{ path: string; buka: boolean } | null>(null);
  const manual = pilihan && pilihan.path === pathname ? pilihan.buka : null;
  const open = manual ?? true;

  const totalUnread = groups.reduce((n, g) => n + g.unread, 0);

  return (
    <div>
      <button
        type="button"
        onClick={() => setPilihan({ path: pathname, buka: !open })}
        aria-expanded={open}
        className={cn(
          "group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] leading-5 transition-colors",
          diHalamanEmail
            ? "font-medium text-white"
            : "text-sidebar-foreground hover:bg-white/[0.04] hover:text-white/90",
        )}
      >
        <Mail
          className={cn(
            "size-[15px] shrink-0 transition-colors",
            diHalamanEmail ? "text-blue-300" : "text-sidebar-muted group-hover:text-sidebar-foreground",
          )}
        />
        <span className="flex-1 truncate text-left">Email</span>
        {totalUnread > 0 ? (
          <span className="min-w-[18px] rounded-full bg-blue-500 px-1.5 py-px text-center text-[10px] font-semibold leading-4 text-white">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        ) : null}
        <ChevronDown className={cn("size-3.5 shrink-0 text-sidebar-muted transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="ml-[26px] mt-0.5 space-y-0.5 border-l border-white/[0.08] pl-2">
          {groups.map((g) => {
            const aktif = g.slug === aktifSlug;
            return (
              <Link
                key={g.slug}
                href={`/email/${g.slug}`}
                aria-current={aktif ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded px-2 py-[5px] text-[12.5px] leading-5 transition-colors",
                  aktif
                    ? "bg-white/[0.07] font-medium text-white"
                    : "text-sidebar-foreground hover:bg-white/[0.04] hover:text-white/90",
                )}
              >
                <span className="flex-1 truncate">{g.name}</span>
                {/* Badge selalu tampil (termasuk 0) supaya ketiga cabang
                    sejajar rapi dan tidak terlihat seperti data hilang. */}
                <span
                  className={cn(
                    "min-w-[16px] rounded-full px-1 text-center text-[10px] font-semibold leading-4",
                    g.unread > 0
                      ? aktif
                        ? "bg-blue-500 text-white"
                        : "bg-white/10 text-sidebar-foreground"
                      : "text-sidebar-muted/60",
                  )}
                >
                  {g.unread > 99 ? "99+" : g.unread}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
