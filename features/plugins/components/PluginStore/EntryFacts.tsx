"use client";

import { useLocale, useTranslations } from "next-intl";
import type { CatalogEntry } from "@/lib/plugins/store/catalog";
import styles from "./pluginStore.module.scss";

/** A date the store wrote as `2026-09-21`, in the reader's language. */
export function useDateText() {
  const locale = useLocale();
  return (iso: string): string => {
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(date);
  };
}

interface Props {
  entry: CatalogEntry;
  /** The version the facts are about (the one that would be installed). */
  version: string;
  /** Also say what it works with, where it comes from and how it is licensed. */
  full?: boolean;
}

/**
 * What an admin needs to see about a plugin before deciding: which store, which version,
 * where it applies, and (in full) the licence, what it works with and where the code is.
 */
export function EntryFacts({ entry, version, full = false }: Props) {
  const t = useTranslations();
  return (
    <dl className={styles.facts}>
      <dt>{t("pluginStore.detailStore")}</dt>
      <dd>{entry.storeName}</dd>
      <dt>{t("pluginStore.detailVersion")}</dt>
      <dd>{version}</dd>
      {entry.installed && (
        <>
          <dt>{t("pluginStore.detailInstalled")}</dt>
          <dd>{entry.installed.version}</dd>
        </>
      )}
      <dt>{t("pluginStore.detailScope")}</dt>
      <dd>
        {entry.scope === "PLATFORM"
          ? t("pluginStore.scopePlatform")
          : t("pluginStore.scopeWorkspace")}
      </dd>
      {full && (
        <>
          <dt>{t("pluginStore.detailLicense")}</dt>
          <dd>{entry.license}</dd>
          <dt>{t("pluginStore.detailBarynt")}</dt>
          <dd>{entry.barynt}</dd>
          {entry.homepage && (
            <>
              <dt>{t("pluginStore.detailHomepage")}</dt>
              <dd>
                <a
                  href={entry.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {entry.homepage}
                </a>
              </dd>
            </>
          )}
          {entry.repository && (
            <>
              <dt>{t("pluginStore.detailRepository")}</dt>
              <dd>
                <a
                  href={entry.repository}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {entry.repository}
                </a>
              </dd>
            </>
          )}
        </>
      )}
    </dl>
  );
}

/** What a plugin asks to be allowed, with the note that it is a promise and not a limit. */
export function EntryCapabilities({ entry }: { entry: CatalogEntry }) {
  const t = useTranslations();
  return (
    <div className={styles.block}>
      <h3>{t("pluginStore.capabilities")}</h3>
      {entry.capabilities.length > 0 ? (
        <ul className={styles.capabilities}>
          {entry.capabilities.map((capability) => (
            <li key={capability}>
              <code>{capability}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("pluginStore.capabilitiesNone")}</p>
      )}
      <p className={styles.note}>{t("pluginStore.capabilitiesNote")}</p>
    </div>
  );
}
