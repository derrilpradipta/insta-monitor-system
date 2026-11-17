import { Mail, Paperclip } from "lucide-react";
import { formatDateTimeId } from "@/lib/time";
import { cn } from "@/lib/utils";

export type EmailRow = {
  id: string;
  fromName: string | null;
  fromAddress: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  hasAttachments: boolean;
  isRead: boolean;
};

/** Daftar email. Sengaja tanpa tombol "buka": isi lengkap tidak disimpan. */
export function EmailList({ emails }: { emails: EmailRow[] }) {
  return (
    <ul className="divide-y divide-border">
      {emails.map((email) => (
        <li
          key={email.id}
          className={cn(
            "flex gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
            !email.isRead && "bg-primary/[0.03]",
          )}
        >
          <span
            className={cn(
              "mt-1.5 size-1.5 shrink-0 rounded-full",
              email.isRead ? "bg-transparent" : "bg-primary",
            )}
            aria-hidden
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span
                className={cn(
                  "truncate text-[13px] leading-tight",
                  email.isRead ? "text-foreground/80" : "font-semibold text-foreground",
                )}
              >
                {email.fromName ?? email.fromAddress}
              </span>
              {email.fromName ? (
                <span className="truncate text-[11.5px] text-muted-foreground">{email.fromAddress}</span>
              ) : null}
              <span className="ml-auto shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
                {formatDateTimeId(email.receivedAt)}
              </span>
            </div>

            <p
              className={cn(
                "mt-0.5 truncate text-[12.5px]",
                email.isRead ? "text-foreground/70" : "font-medium text-foreground",
              )}
            >
              {email.subject}
              {email.hasAttachments ? (
                <Paperclip className="ml-1.5 inline size-3 align-[-1px] text-muted-foreground" aria-label="Ada lampiran" />
              ) : null}
            </p>

            {email.snippet ? (
              <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">
                {email.snippet}
              </p>
            ) : null}
          </div>
        </li>
      ))}

      <li className="flex items-center gap-1.5 px-4 py-2.5 text-[11px] text-muted-foreground">
        <Mail className="size-3" />
        Dibaca lewat IMAP tanpa menandai email sebagai sudah dibaca.
      </li>
    </ul>
  );
}
