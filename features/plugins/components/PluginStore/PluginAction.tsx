"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import type { CatalogEntry } from "@/lib/plugins/store/catalog";
import styles from "./pluginStore.module.scss";

interface Props {
  entry: CatalogEntry;
  size?: "sm" | "md";
  disabled?: boolean;
  onInstall: (entry: CatalogEntry, version: string) => void;
}

/**
 * What can be done with a plugin in the list, as one thing: an update, nothing (it is
 * installed), a reason it cannot be installed, or the install button. One place, so the
 * card, the featured plugin and the details agree.
 */
export function PluginAction({
  entry,
  size = "sm",
  disabled,
  onInstall,
}: Props) {
  const t = useTranslations();

  if (entry.installed?.update) {
    const version = entry.installed.update;
    return (
      <Button
        variant="primary"
        size={size}
        icon={<Icon icon="lucide:refresh-cw" width={14} />}
        disabled={disabled}
        onClick={() => onInstall(entry, version)}
      >
        {t("pluginStore.update", { version })}
      </Button>
    );
  }
  if (entry.installed) {
    return (
      <span className={`${styles.pill} ${styles.pillOk}`}>
        <Icon icon="lucide:check" width={12} />
        {t("pluginStore.installed")}
      </span>
    );
  }
  if (entry.offered === null) {
    return (
      <span className={`${styles.pill} ${styles.pillMuted}`}>
        {t("pluginStore.revoked")}
      </span>
    );
  }
  if (!entry.compatible) {
    return (
      <span
        className={`${styles.pill} ${styles.pillMuted}`}
        title={t("pluginStore.incompatibleNote", { range: entry.barynt })}
      >
        {t("pluginStore.incompatible")}
      </span>
    );
  }
  const version = entry.offered;
  return (
    <Button
      variant="outline"
      size={size}
      disabled={disabled}
      onClick={() => onInstall(entry, version)}
    >
      {t("pluginStore.install")}
    </Button>
  );
}
