"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { RichText } from "@/components/ui/atoms/RichText/RichText";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import type { PMDoc } from "@/lib/richtext/types";
import { loadReleaseNotes } from "../actions";
import styles from "./releaseNotesModal.module.scss";

interface ReleaseNotesModalProps {
  /** Every version with notes, newest first. */
  versions: string[];
  githubUrl: string;
  close: () => void;
}

/**
 * The release notes window: a tab per version across the top, the notes of
 * the open one below, a link to the full change list on GitHub at the foot.
 * The newest version opens first. Notes are fetched when a tab is first
 * opened (`loadReleaseNotes`) and kept, so switching back is instant.
 */
export function ReleaseNotesModal({
  versions,
  githubUrl,
  close,
}: ReleaseNotesModalProps) {
  const t = useTranslations("releases");
  const [active, setActive] = useState(versions[0]);
  const [notes, setNotes] = useState<Record<string, PMDoc | null>>({});

  // Fetching from a server function — there's no server-side way to hand
  // over a tab that is only opened later.
  useEffect(() => {
    if (!active || active in notes) return;
    let stale = false;
    loadReleaseNotes(active).then((doc) => {
      if (!stale) setNotes((prev) => ({ ...prev, [active]: doc }));
    });
    return () => {
      stale = true;
    };
  }, [active, notes]);

  const doc = notes[active];

  return (
    <Modal width={760}>
      <ModalHeader
        title={t("title")}
        leading={<Icon icon="lucide:sparkles" height={18} />}
        onClose={close}
        closeLabel={t("close")}
      />
      <div className={styles.tabs}>
        <SegmentedControl
          items={versions.map((v) => ({ value: v, label: `v${v}` }))}
          value={active}
          onChange={setActive}
        />
      </div>
      <ModalBody>
        <div className={styles.notes}>
          {doc ? (
            <RichText value={doc} />
          ) : (
            <p className={styles.status}>
              {active in notes ? t("empty") : t("loading")}
            </p>
          )}
        </div>
      </ModalBody>
      <div className={styles.footer}>
        <a
          className={styles.link}
          href={`${githubUrl}/releases/tag/v${active}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon icon="lucide:github" height={14} />
          <span>{t("allChanges")}</span>
        </a>
      </div>
    </Modal>
  );
}
