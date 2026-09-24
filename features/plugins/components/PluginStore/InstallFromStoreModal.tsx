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
  version: string;
  /** Installs it. `null` = done, otherwise the error text to show. */
  onConfirm: () => Promise<string | null>;
  close: () => void;
  sheet?: boolean;
}

/**
 * The consent before a plugin is installed from a store: what it is, what it asks for, and
 * what installing does and does not do. The server asks for the same yes. Installing puts
 * the files on this instance; it switches nothing on, and the code of a plugin with code
 * runs only after the platform approves it.
 */
export function InstallFromStoreModal({
  entry,
  version,
  onConfirm,
  close,
  sheet,
}: Props) {
  const t = useTranslations();
  return (
    <AcknowledgeModal
      close={close}
      sheet={sheet}
      title={t("pluginStore.installTitle", { name: entry.name, version })}
      confirmLabel={t("pluginStore.installConfirm")}
      notice={(state) => (
        <>
          <EntryFacts entry={entry} version={version} />
          <EntryCapabilities entry={entry} />
          <p className={styles.notice}>
            <Icon icon="lucide:info" width={14} />
            {entry.hasCode
              ? t("pluginStore.installCodeNote")
              : t("pluginStore.installNoCodeNote")}
          </p>
          <WarningBox
            {...state}
            title={t("pluginStore.installWarnTitle")}
            checkLabel={t("pluginStore.installCheck")}
          >
            <p>{t("pluginStore.installWarnBody")}</p>
          </WarningBox>
        </>
      )}
      onConfirm={onConfirm}
    />
  );
}
