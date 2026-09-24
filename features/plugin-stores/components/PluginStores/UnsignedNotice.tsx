"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import styles from "./pluginStores.module.scss";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * The warning for plugins that come from no store, and the checkbox that says the
 * admin understood it. It is shown when the setting is switched on, and has to be
 * shown again each time a plugin is installed this way (BARY-60): allowing them
 * once is not consent for every one. The server refuses without the answer, so
 * this is the question, not the protection. The words matter more than the
 * layout: nobody reviewed or tested these plugins, and the risk is the admin's.
 */
export function UnsignedNotice({ checked, onChange, disabled }: Props) {
  const t = useTranslations();
  return (
    <div className={styles.trust}>
      <p className={styles.trustTitle}>
        <Icon icon="lucide:triangle-alert" width={16} />
        {t("pluginStores.unsignedWarnTitle")}
      </p>
      <p className={styles.trustText}>{t("pluginStores.unsignedWarnBody")}</p>
      <p className={styles.trustText}>{t("pluginStores.unsignedWarnRisk")}</p>
      <p className={styles.trustText}>{t("pluginStores.unsignedWarnEach")}</p>
      <label className={styles.trustCheck}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{t("pluginStores.unsignedWarnCheck")}</span>
      </label>
    </div>
  );
}
