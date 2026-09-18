import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getCurrentUser } from "@/lib/auth/session";
import { BetaBanner } from "@/components/beta-banner";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/home");
  const t = await getTranslations();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <BetaBanner className="mb-4" />

      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-on-brand">
          LC
        </div>
        <h1 className="text-2xl font-bold text-ink">{t("common.appName")}</h1>
        <p className="mt-1 text-sm text-muted">{t("auth.signIn")}</p>
      </div>

      <Card>
        <LoginForm />
      </Card>

      <div className="mt-6">
        <p className="mb-2 text-center text-sm font-semibold text-muted">
          {t("auth.language")}
        </p>
        <LanguageSwitcher />
      </div>
    </main>
  );
}
