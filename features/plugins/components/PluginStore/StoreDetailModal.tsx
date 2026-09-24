"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import type { CatalogEntry } from "@/lib/plugins/store/catalog";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import { EntryCapabilities, EntryFacts, useDateText } from "./EntryFacts";
import { PluginAction } from "./PluginAction";
import { PluginAvatar } from "./PluginAvatar";
import styles from "./pluginStore.module.scss";

interface Props {
  entry: CatalogEntry;
  /** Whether the admin has released it for workspaces and projects. */
  released: boolean;
  /** "Only released plugins" is on, so the release counts. */
  curatedOnly: boolean;
  /**
   * Releases it or takes the release back. `null` = done, otherwise the error text. Only the
   * platform admin releases: without it the details have no release block.
   */
  onRelease?: (released: boolean) => Promise<string | null>;
  onInstall: (entry: CatalogEntry, version: string) => void;
  close: () => void;
  sheet?: boolean;
}

/**
 * A plugin's details: what it is, who wrote it, what it asks for, which versions there are
 * and what they changed, whether it fits this Barynt, and, for the platform admin, whether
 * workspaces and projects get it. Install is in the footer, where it is for the card.
 */
export function StoreDetailModal({
  entry,
  released,
  curatedOnly,
  onRelease,
  onInstall,
  close,
  sheet,
}: Props) {
  const t = useTranslations();
  const dateText = useDateText();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);
  const [isReleased, setReleased] = useState(released);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const version = entry.offered ?? entry.versions[0]?.version ?? "";

  const release = (next: boolean) =>
    startTransition(async () => {
      if (!onRelease) return;
      const failure = await onRelease(next);
      if (failure) setError(failure);
      else {
        setError("");
        setReleased(next);
      }
    });

  return (
    <Modal
      variant={sheet ? "sheet" : "dialog"}
      style={sheet ? swipe.style : undefined}
      {...(sheet ? swipe.handlers : {})}
    >
      {sheet ? (
        <SheetHeader
          title={entry.name}
          onClose={close}
          closeLabel={t("pluginStore.close")}
        />
      ) : (
        <ModalHeader
          title={entry.name}
          onClose={close}
          closeLabel={t("pluginStore.close")}
        />
      )}

      <ModalBody ref={bodyRef} className={styles.modalBody}>
        <div className={styles.detailHead}>
          <PluginAvatar id={entry.id} name={entry.name} size={3.25} />
          <div className={styles.detailTitle}>
            <h2>{entry.name}</h2>
            <span className={styles.author}>
              {t("pluginStore.by", { author: entry.author })}
              {entry.official && (
                <>
                  {" "}
                  <Icon
                    icon="lucide:badge-check"
                    width={14}
                    className={styles.verified}
                    aria-label={t("pluginStore.verified")}
                  />
                </>
              )}
            </span>
          </div>
        </div>

        <p className={styles.detailDesc}>{entry.description}</p>

        {!entry.compatible && (
          <p className={styles.notice}>
            <Icon icon="lucide:triangle-alert" width={14} />
            {t("pluginStore.incompatibleNote", { range: entry.barynt })}
          </p>
        )}
        {entry.offered === null && (
          <p className={styles.notice}>
            <Icon icon="lucide:triangle-alert" width={14} />
            {t("pluginStore.revokedNote")}
          </p>
        )}

        <EntryFacts entry={entry} version={version} full />
        <EntryCapabilities entry={entry} />

        {entry.versions.length > 0 && (
          <div className={styles.block}>
            <h3>{t("pluginStore.versions")}</h3>
            <ul className={styles.versions}>
              {entry.versions.slice(0, 10).map((v) => (
                <li key={v.version}>
                  <span
                    className={[
                      styles.versionNumber,
                      v.revoked && styles.versionRevoked,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {v.version}
                  </span>
                  {v.released && (
                    <span className={styles.note}>
                      {t("pluginStore.versionReleased", {
                        date: dateText(v.released),
                      })}
                    </span>
                  )}
                  {v.changelog && (
                    <a
                      href={v.changelog}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("pluginStore.versionChangelog")}
                    </a>
                  )}
                  {v.revoked && (
                    <span className={styles.versionRevoked}>
                      {v.revokedReason
                        ? t("pluginStore.versionRevokedReason", {
                            reason: v.revokedReason,
                          })
                        : t("pluginStore.versionRevoked")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {onRelease && (
          <div className={styles.block}>
            <h3>{t("pluginStore.curationTitle")}</h3>
            <div className={styles.curation}>
              <div>
                <span>
                  {isReleased
                    ? t("pluginStore.curationOn")
                    : t("pluginStore.curationOff")}
                </span>
                {!curatedOnly && (
                  <span className={styles.note}>
                    {t("pluginStore.curationInactive")}
                  </span>
                )}
              </div>
              <Switch
                id={`store-release-${entry.key}`}
                label={t("pluginStore.curationSwitch")}
                checked={isReleased}
                disabled={isPending}
                onChange={release}
              />
            </div>
            {error && (
              <p className={styles.error} role="alert">
                <Icon icon="lucide:circle-alert" width={14} />
                {error}
              </p>
            )}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        {!sheet && (
          <Button variant="ghost" onClick={close}>
            {t("pluginStore.close")}
          </Button>
        )}
        <PluginAction
          entry={entry}
          size="md"
          onInstall={(e, v) => {
            close();
            onInstall(e, v);
          }}
        />
      </ModalFooter>
    </Modal>
  );
}
