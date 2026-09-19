"use client";

import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const t = useTranslations();
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="secondary" size="lg" className="text-danger-ink">
        <LogOut className="h-5 w-5" aria-hidden />
        {t("auth.signOut")}
      </Button>
    </form>
  );
}
