"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Shortcut } from "@/components/ui/atoms/Shortcut/Shortcut";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import { shortcutGroups } from "./shortcutGroups";
import styles from "./shortcutsHelpModal.module.scss";

interface ShortcutsHelpModalProps {
  close: () => void;
}

/**
 * The "?" cheatsheet — Linear and Jira's own convention for "what can I
 * press right now". A compact list rather than `SettingsList`
 * (`AccountShortcuts`'s own layout): that grid reserves 280px for a
 * control meant for a toggle or a `SegmentedControl`, far more than a
 * single `Shortcut` badge needs, and would leave the label crushed at this
 * modal's width.
 */
export function ShortcutsHelpModal({ close }: ShortcutsHelpModalProps) {
  const t = useTranslations();
  const groups = shortcutGroups(t);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Nothing else in here is focusable (no form fields, just labels and
  // badges) — without this, keyboard users would land on `ModalFrame`'s
  // outer wrapper instead, which isn't the scroll container, so arrow
  // keys/Page Down/Space wouldn't scroll the list. A plain `autoFocus`
  // prop doesn't reach here: the browser only honors that attribute for
  // elements present when the page is first parsed, not ones a portal
  // inserts afterward — an explicit `.focus()` call is the only way for
  // script-inserted content. Runs before `ModalFrame`'s own effect (child
  // effects fire first), so its "only take focus if nothing inside already
  // has it" check sees this and steps back.
  useEffect(() => {
    bodyRef.current?.focus();
  }, []);

  return (
    <Modal width={440} className={styles.modal}>
      <ModalHeader
        title={t("nav.shortcuts")}
        onClose={close}
        closeLabel={t("actions.close")}
      />
      <ModalBody ref={bodyRef} className={styles.body} tabIndex={0}>
        {groups.map((group) => (
          <section key={group.title} className={styles.group}>
            <h3 className={styles.groupTitle}>{group.title}</h3>
            <ul className={styles.rows}>
              {group.rows.map((row) => (
                <li key={row.id} className={styles.row}>
                  <span className={styles.label}>{row.label}</span>
                  <Shortcut keys={row.keys} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </ModalBody>
    </Modal>
  );
}
