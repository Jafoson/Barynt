"use client";

import { useTranslations } from "next-intl";
import { WarningBox } from "@/components/ui/atoms/WarningBox/WarningBox";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * What connecting or switching on a store means, and the checkbox that says the
 * admin understood it. The server refuses without the answer (`trusted`), so this
 * is the question, not the protection. The words matter more than the layout:
 * they say what a plugin from the store could do.
 */
export function TrustNotice(props: Props) {
  const t = useTranslations();
  return (
    <WarningBox
      {...props}
      title={t("pluginStores.trustTitle")}
      checkLabel={t("pluginStores.trustCheck")}
    >
      <p>{t("pluginStores.trustBody")}</p>
      <p>{t("pluginStores.trustNothingRuns")}</p>
    </WarningBox>
  );
}
