import Link from "next/link";
import { Bell } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { getShellData, getEmailUnreadByGroup } from "@/lib/query";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { SessionGuard } from "@/components/shell/session-guard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [{ session, unread }, emailGroups] = await Promise.all([
    getShellData(),
    getEmailUnreadByGroup(),
  ]);

  return (
    <div className="min-h-screen lg:pl-[228px]">
      <SidebarNav
        user={session.user}
        unread={unread}
        emailGroups={emailGroups}
        logoutAction={logoutAction}
      />

      <header className="sticky top-0 z-30 flex h-[58px] items-center gap-3 border-b border-border bg-background/85 px-4 pl-14 backdrop-blur-md sm:px-6 lg:pl-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight text-foreground">
            Instaprint Monitoring System
          </p>
          <p className="hidden truncate text-[11px] leading-tight text-muted-foreground sm:block">
            Semua cabang · Asia/Jakarta
          </p>
        </div>

        <Link
          href="/notifications"
          className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Notifikasi"
        >
          <Bell className="size-[17px]" />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 flex size-[7px] items-center justify-center rounded-full bg-red-500 ring-2 ring-background" />
          ) : null}
        </Link>

        <span className="h-5 w-px bg-border" aria-hidden />

        <Link
          href="/profile"
          className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition-colors hover:bg-secondary"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
            {session.user.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="hidden max-w-32 truncate text-[12.5px] font-medium sm:block">
            {session.user.name}
          </span>
        </Link>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-4 px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:pb-10">{children}</main>
      <SessionGuard />
    </div>
  );
}
