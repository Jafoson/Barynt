"use client";

import { useTranslations } from "next-intl";
import { WarningBox } from "@/components/ui/atoms/WarningBox/WarningBox";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * The warning for plugins that come from no store, and the checkbox that says the
 * admin understood it. It is shown when the setting is switched on, and again each
 * time a plugin is installed or updated this way: allowing them once is not consent
 * for every one. The server refuses without the answer, so this is the question,
 * not the protection. The words matter more than the layout: nobody reviewed or
 * tested these plugins, and the risk is the admin's.
 */
export function UnsignedNotice(props: Props) {
  const t = useTranslations();
  return (
    <WarningBox
      {...props}
      title={t("pluginStores.unsignedWarnTitle")}
      checkLabel={t("pluginStores.unsignedWarnCheck")}
    >
      <p>{t("pluginStores.unsignedWarnBody")}</p>
      <p>{t("pluginStores.unsignedWarnRisk")}</p>
      <p>{t("pluginStores.unsignedWarnEach")}</p>
    </WarningBox>
  );
}
