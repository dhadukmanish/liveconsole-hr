import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guard";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-hairline py-2 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}

export default async function ProfilePage() {
  const user = await requireUser();
  const t = await getTranslations();

  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { profile: true, manager: { select: { name: true } }, role: true },
  });

  const dash = "—";

  return (
    <>
      <PageHeader title={t("more.profile")} subtitle={record.name} />
      <Card>
        <Row label={t("users.name")} value={record.name} />
        <Row label={t("users.mobile")} value={record.mobile} />
        <Row label={t("more.email")} value={record.email ?? dash} />
        <Row label={t("more.role")} value={t(`roles.${record.role.code}` as "roles.ADMIN")} />
        <Row label={t("more.employeeCode")} value={record.profile?.employeeCode ?? dash} />
        <Row label={t("more.designation")} value={record.profile?.designation ?? dash} />
        <Row label={t("more.department")} value={record.profile?.department ?? dash} />
        <Row label={t("more.reportsTo")} value={record.manager?.name ?? dash} />
        <Row
          label={t("users.loginMethod")}
          value={record.loginMethod === "OTP" ? t("users.loginOtp") : t("users.loginPassword")}
        />
      </Card>
    </>
  );
}
