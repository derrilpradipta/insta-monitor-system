import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABEL } from "@/lib/labels";
import { formatDateTimeId } from "@/lib/time";
import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Profil Pengguna" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await requireSession();
  const { user } = session;

  return (
    <div className="space-y-4">
      <PageHeader title="Profil Pengguna" description="Informasi akun dan pengaturan keamanan." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informasi akun</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Nama pengguna" value={user.name} />
            <Row label="Email" value={user.email} />
            <Row
              label="Peran"
              value={<Badge className="bg-blue-50 text-blue-700 ring-blue-600/20">{ROLE_LABEL[user.role]}</Badge>}
            />
            <Row label="Tanggal pembuatan akun" value={formatDateTimeId(user.createdAt)} />
            <Row label="Login terakhir" value={user.lastLoginAt ? formatDateTimeId(user.lastLoginAt) : "—"} />
            <Row
              label="Sesi berakhir otomatis"
              value={`${process.env.SESSION_IDLE_MINUTES ?? 30} menit tanpa aktivitas`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ganti password</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border pb-2.5 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
