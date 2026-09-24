"use client";

import { useTranslations } from "next-intl";
import { WarningBox } from "@/components/ui/atoms/WarningBox/WarningBox";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * What approving the code of a plugin means, and the box that says the admin
 * understood it: after this the plugin's code runs with the full power of the app.
 * The server asks for the same yes (`approvePluginCode`), so this is the question,
 * not the protection. The words matter more than the layout.
 */
export function ApproveWarning(props: Props) {
  const t = useTranslations();
  return (
    <WarningBox
      {...props}
      title={t("pluginsAdmin.approveWarnTitle")}
      checkLabel={t("pluginsAdmin.approveCheck")}
    >
      <p>{t("pluginsAdmin.approveWarnBody")}</p>
      <p>{t("pluginsAdmin.approveWarnFiles")}</p>
    </WarningBox>
  );
}
