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
 * What connecting or switching on a store means, and the checkbox that says the
 * admin understood it. The server refuses without the answer (`trusted`), so this
 * is the question, not the protection. The words matter more than the layout:
 * they say what a plugin from the store could do.
 */
export function TrustNotice({ checked, onChange, disabled }: Props) {
  const t = useTranslations();
  return (
    <div className={styles.trust}>
      <p className={styles.trustTitle}>
        <Icon icon="lucide:triangle-alert" width={16} />
        {t("pluginStores.trustTitle")}
      </p>
      <p className={styles.trustText}>{t("pluginStores.trustBody")}</p>
      <p className={styles.trustText}>{t("pluginStores.trustNothingRuns")}</p>
      <label className={styles.trustCheck}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{t("pluginStores.trustCheck")}</span>
      </label>
    </div>
  );
}
