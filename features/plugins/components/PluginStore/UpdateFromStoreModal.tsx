"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { WarningBox } from "@/components/ui/atoms/WarningBox/WarningBox";
import { AcknowledgeModal } from "@/components/ui/layout/AcknowledgeModal/AcknowledgeModal";
import type { CatalogEntry } from "@/lib/plugins/store/catalog";
import { EntryCapabilities, EntryFacts } from "./EntryFacts";
import styles from "./pluginStore.module.scss";

interface Props {
  entry: CatalogEntry;
  /** The version it would be updated to. */
  version: string;
  /** Updates it. `null` = done, otherwise the error text to show. */
  onConfirm: () => Promise<string | null>;
  close: () => void;
  sheet?: boolean;
}

/**
 * The consent before an installed plugin is updated from the store it came from: what
 * changes, what the new version asks for **in addition** to what the installed one did, and
 * what an update does to its code approval. The old files stay, so the platform can go back.
 * The server asks for the same yes, so this is the question, not the protection.
 */
export function UpdateFromStoreModal({
  entry,
  version,
  onConfirm,
  close,
  sheet,
}: Props) {
  const t = useTranslations();
  const added = entry.installed?.addedCapabilities ?? [];
  return (
    <AcknowledgeModal
      close={close}
      sheet={sheet}
      title={t("pluginStore.updateTitle", { name: entry.name, version })}
      confirmLabel={t("pluginStore.updateConfirm")}
      notice={(state) => (
        <>
          <EntryFacts entry={entry} version={version} />
          {added.length > 0 ? (
            <div className={`${styles.block} ${styles.added}`}>
              <h3>
                <Icon icon="lucide:triangle-alert" width={14} />
                {t("pluginStore.updateAdded")}
              </h3>
              <ul className={styles.capabilities}>
                {added.map((capability) => (
                  <li key={capability}>
                    <code>{capability}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className={styles.notice}>
              <Icon icon="lucide:info" width={14} />
              {t("pluginStore.updateAddedNone")}
            </p>
          )}
          <EntryCapabilities entry={entry} />
          <p className={styles.notice}>
            <Icon icon="lucide:info" width={14} />
            {entry.hasCode
              ? t("pluginStore.updateCodeNote")
              : t("pluginStore.updateNoCodeNote")}
          </p>
          <p className={styles.notice}>
            <Icon icon="lucide:undo-2" width={14} />
            {t("pluginStore.updateBackNote")}
          </p>
          <WarningBox
            {...state}
            title={t("pluginStore.updateWarnTitle")}
            checkLabel={t("pluginStore.updateCheck")}
          >
            <p>{t("pluginStore.updateWarnBody", { store: entry.storeName })}</p>
          </WarningBox>
        </>
      )}
      onConfirm={onConfirm}
    />
  );
}
