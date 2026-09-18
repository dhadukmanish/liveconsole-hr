import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";

/**
 * Shown until NEXT_PUBLIC_BETA_BANNER is set to "false", which is the switch for
 * "we are live" rather than a code change.
 */
export async function BetaBanner({ className }: { className?: string }) {
  if (process.env.NEXT_PUBLIC_BETA_BANNER === "false") return null;
  const t = await getTranslations();
  return (
    <Alert tone="warning" className={className}>
      {t("common.beta")}
    </Alert>
  );
}
