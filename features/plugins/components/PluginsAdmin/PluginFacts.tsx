"use client";

import { useTranslations } from "next-intl";
import type { InstalledPlugin } from "@/features/plugins/overview";
import styles from "./pluginsAdmin.module.scss";

interface Props {
  version: string;
  /** The store it comes from, or `null` for no store. */
  origin: string | null;
  /** The hash of the files, when there is one to show. */
  hash?: string;
  capabilities: InstalledPlugin["capabilities"];
  /** Say what the plugin asks to be allowed. */
  showCapabilities?: boolean;
}

/**
 * What an admin needs to see before deciding about a plugin: which version, where
 * it comes from, which files (the hash an approval is for), and what it asks for.
 */
export function PluginFacts({
  version,
  origin,
  hash,
  capabilities,
  showCapabilities = false,
}: Props) {
  const t = useTranslations();
  return (
    <div className={styles.facts}>
      <dl className={styles.factList}>
        <dt>{t("pluginsAdmin.approveFactVersion")}</dt>
        <dd>{version}</dd>
        <dt>{t("pluginsAdmin.approveFactOrigin")}</dt>
        <dd className={origin ? styles.mono : undefined}>
          {origin ?? t("pluginsAdmin.approveFactNoStore")}
        </dd>
        {hash && (
          <>
            <dt>{t("pluginsAdmin.approveFactHash")}</dt>
            <dd className={styles.mono}>{hash}</dd>
          </>
        )}
      </dl>
      {showCapabilities && (
        <div className={styles.asks}>
          <p>
            {capabilities.length > 0
              ? t("pluginsAdmin.approveAsks")
              : t("pluginsAdmin.approveAsksNone")}
          </p>
          {capabilities.length > 0 && (
            <ul className={styles.capabilities}>
              {capabilities.map((capability) => (
                <li key={capability}>
                  <code>{capability}</code>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.asksNote}>{t("pluginsAdmin.approveAsksNote")}</p>
        </div>
      )}
    </div>
  );
}
