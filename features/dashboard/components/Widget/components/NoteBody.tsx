"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import {
  type NotePage,
  notePages,
  type Widget,
} from "@/features/dashboard/widgets";
import { randomId } from "@/lib/utils/id";
import { useNoteContext } from "../../NoteContext/NoteContext";
import styles from "../widget.module.scss";

/** A tab's name: the page's first line, short. */
const titleOf = (page: NotePage) =>
  page.text.split("\n")[0]?.trim().slice(0, 24) ?? "";

/**
 * A note you write straight into (BARY-169): tabs for its pages, "+" for a
 * new one, × to delete the open one; the text saves itself. The first line
 * names the tab, like a note on a phone. Read-only where the person can't
 * change the dashboard (someone else's view) and in the gallery's preview.
 */
export function NoteBody({ widget }: { widget: Widget }) {
  const t = useTranslations("widgets");
  const confirm = useConfirm();
  const note = useNoteContext();
  const canWrite = !!note?.canWrite;
  const [pages, setPages] = useState<NotePage[]>(() => notePages(widget));
  const [activeId, setActiveId] = useState(pages[0].id);
  const active = pages.find((p) => p.id === activeId) ?? pages[0];

  const commit = (next: NotePage[]) => {
    setPages(next);
    note?.save(widget.id, next);
  };

  const write = (text: string) =>
    commit(pages.map((p) => (p.id === active.id ? { ...p, text } : p)));

  const addPage = () => {
    if (pages.length >= 12) return;
    const page = { id: randomId().slice(0, 12), text: "" };
    commit([...pages, page]);
    setActiveId(page.id);
  };

  const removePage = async () => {
    if (
      active.text.trim() &&
      !(await confirm({
        title: t("notePageDelete"),
        description: t("notePageDeleteHint", {
          name: titleOf(active) || t("notePageNew"),
        }),
        confirmLabel: t("remove"),
        cancelLabel: t("cancel"),
        danger: true,
      }))
    )
      return;
    // The last page isn't removed, only emptied — a note has at least one.
    if (pages.length === 1) {
      commit([{ ...active, text: "" }]);
      return;
    }
    const index = pages.findIndex((p) => p.id === active.id);
    const next = pages.filter((p) => p.id !== active.id);
    commit(next);
    setActiveId(next[Math.max(0, index - 1)].id);
  };

  return (
    <div className={styles.noteBox}>
      {(pages.length > 1 || canWrite) && (
        <div className={`${styles.noteTabs} ${styles.noS}`} role="tablist">
          {pages.map((page, i) => (
            <button
              key={page.id}
              type="button"
              role="tab"
              aria-selected={page.id === active.id}
              className={styles.noteTab}
              onClick={() => setActiveId(page.id)}
            >
              {titleOf(page) || t("notePageN", { n: i + 1 })}
            </button>
          ))}
          {canWrite && (
            <>
              <button
                type="button"
                className={styles.noteIcon}
                aria-label={t("notePageAdd")}
                title={t("notePageAdd")}
                onClick={addPage}
                disabled={pages.length >= 12}
              >
                <Icon icon="lucide:plus" width={14} />
              </button>
              <button
                type="button"
                className={styles.noteIcon}
                data-end
                aria-label={t("notePageDelete")}
                title={t("notePageDelete")}
                onClick={removePage}
              >
                <Icon icon="lucide:trash-2" width={13} />
              </button>
            </>
          )}
        </div>
      )}
      {canWrite ? (
        <textarea
          key={active.id}
          className={styles.noteText}
          value={active.text}
          placeholder={t("notePlaceholder")}
          aria-label={t("type_note")}
          maxLength={5000}
          onChange={(e) => write(e.target.value)}
        />
      ) : (
        <p className={styles.note}>{active.text.trim() || t("noteEmpty")}</p>
      )}
    </div>
  );
}
