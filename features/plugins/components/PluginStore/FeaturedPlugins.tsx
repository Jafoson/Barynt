"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import type { CatalogEntry } from "@/lib/plugins/store/catalog";
import { PluginAction } from "./PluginAction";
import { PluginAvatar } from "./PluginAvatar";
import styles from "./pluginStore.module.scss";

interface Props {
  /** One to three, the first is shown big. */
  entries: CatalogEntry[];
  disabled?: boolean;
  onOpen: (entry: CatalogEntry) => void;
  onInstall: (entry: CatalogEntry, version: string) => void;
}

/**
 * The plugins on top: the most recently released. The first one is big, with what it
 * asks for as a short list and a picture of it joining Barynt; the others are small.
 */
export function FeaturedPlugins({
  entries,
  disabled,
  onOpen,
  onInstall,
}: Props) {
  const t = useTranslations();
  const [first, ...rest] = entries;
  if (!first) return null;
  return (
    <section className={styles.section} aria-label={t("pluginStore.featured")}>
      <div className={styles.featured}>
        <article className={`${styles.card} ${styles.big}`}>
          <div className={styles.bigMain}>
            <span className={styles.bigBadge}>{t("pluginStore.featured")}</span>
            <div className={styles.cardTop}>
              <PluginAvatar id={first.id} name={first.name} size={3.25} />
              <div className={styles.cardTitle}>
                <span className={styles.nameRow}>
                  <button
                    type="button"
                    className={`${styles.open} ${styles.bigName}`}
                    onClick={() => onOpen(first)}
                    aria-label={`${first.name}: ${t("pluginStore.open")}`}
                  >
                    {first.name}
                  </button>
                  {first.official && (
                    <Icon
                      icon="lucide:badge-check"
                      width={17}
                      className={styles.verified}
                      aria-label={t("pluginStore.verified")}
                    />
                  )}
                </span>
                <span className={styles.author}>
                  {t("pluginStore.by", { author: first.author })}
                </span>
              </div>
            </div>
            <p className={styles.desc}>{first.description}</p>
            {first.capabilities.length > 0 && (
              <ul className={styles.points}>
                {first.capabilities.slice(0, 3).map((capability) => (
                  <li key={capability}>
                    <Icon icon="lucide:circle-check" width={15} />
                    <code>{capability}</code>
                  </li>
                ))}
              </ul>
            )}
            <span className={styles.action}>
              <PluginAction
                entry={first}
                size="md"
                disabled={disabled}
                onInstall={onInstall}
              />
            </span>
          </div>
          <div className={styles.link} aria-hidden>
            <PluginAvatar id={first.id} name={first.name} size={3.5} />
            <span className={styles.linkDot} />
            <span className={styles.linkLine} />
            <span className={styles.barynt}>B</span>
          </div>
        </article>
        {rest.length > 0 && (
          <div className={styles.featuredSide}>
            {rest.map((entry) => (
              <article
                key={entry.key}
                className={`${styles.card} ${styles.small}`}
              >
                <PluginAvatar id={entry.id} name={entry.name} />
                <div className={styles.smallText}>
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
                  <p>{entry.description}</p>
                </div>
                <span className={styles.action}>
                  <PluginAction
                    entry={entry}
                    disabled={disabled}
                    onInstall={onInstall}
                  />
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
