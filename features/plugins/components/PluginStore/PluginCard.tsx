"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { scopeMessageKey } from "@/features/plugins/scopeText";
import type { CatalogEntry } from "@/lib/plugins/store/catalog";
import { PluginAction } from "./PluginAction";
import { PluginAvatar } from "./PluginAvatar";
import styles from "./pluginStore.module.scss";

interface Props {
  entry: CatalogEntry;
  /** Whether the admin released it for workspaces and projects, when that matters. */
  released?: boolean;
  disabled?: boolean;
  onOpen: (entry: CatalogEntry) => void;
  onInstall: (entry: CatalogEntry, version: string) => void;
}

/**
 * One plugin in the grid. The name is the button that opens the details and covers the
 * whole card; the action sits above it, so a click on the card opens the details and a
 * click on the button does what it says.
 */
export function PluginCard({
  entry,
  released,
  disabled,
  onOpen,
  onInstall,
}: Props) {
  const t = useTranslations();
  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <PluginAvatar id={entry.id} name={entry.name} />
        <div className={styles.cardTitle}>
          <span className={styles.nameRow}>
            <button
              type="button"
              className={styles.open}
              onClick={() => onOpen(entry)}
              aria-label={`${entry.name}: ${t("pluginStore.open")}`}
            >
              {entry.name}
            </button>
            {entry.official && (
              <Icon
                icon="lucide:badge-check"
                width={15}
                className={styles.verified}
                aria-label={t("pluginStore.verified")}
              />
            )}
          </span>
          <span className={styles.author}>
            {entry.official
              ? entry.author
              : `${entry.author} · ${entry.storeName}`}
          </span>
        </div>
      </div>
      <p className={styles.desc}>{entry.description}</p>
      <div className={styles.cardFoot}>
        <span className={styles.meta}>
          <span>{t(`pluginStore.${scopeMessageKey(entry.scope)}`)}</span>
          <span aria-hidden>·</span>
          <span>
            {entry.hasCode
              ? t("pluginStore.withCode")
              : t("pluginStore.noCode")}
          </span>
          {released && (
            <span
              className={styles.released}
              title={t("pluginStore.releasedFor")}
            >
              <Icon icon="lucide:badge-check" width={12} />
            </span>
          )}
        </span>
        <span className={styles.action}>
          <PluginAction
            entry={entry}
            disabled={disabled}
            onInstall={onInstall}
          />
        </span>
      </div>
    </article>
  );
}
