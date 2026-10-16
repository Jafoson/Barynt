"use client";

import { Icon } from "@iconify/react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import type { NotePage, Widget } from "@/features/dashboard/widgets";
import { fromMarkdown, isEmptyDoc, toDoc, toPlainText } from "@/lib/richtext";
import type { PMDoc } from "@/lib/richtext/types";
import { randomId } from "@/lib/utils/id";
import { useNoteContext } from "../../NoteContext/NoteContext";
import styles from "../widget.module.scss";

// The editor stays off the read path's bundle and the server (conventions:
// editors only via `next/dynamic`, `ssr: false`).
const MiniEditor = dynamic(
  () =>
    import("@/components/ui/layout/MiniEditor/MiniEditor").then(
      (m) => m.MiniEditor,
    ),
  { ssr: false, loading: () => <div className={styles.noteLoading} /> },
);

/** A page's document — stored, or made from an older text. */
const docOf = (page: NotePage): PMDoc =>
  page.doc ? toDoc(page.doc) : fromMarkdown(page.text ?? "");

/** A tab's name: the page's first line of text, short. */
const titleOf = (page: NotePage) =>
  toPlainText(docOf(page)).split("\n")[0]?.trim().slice(0, 24) ?? "";

/**
 * A note you write straight into (BARY-169), formatted as you type — `# `
 * becomes a heading, `- ` a list, `[ ] ` a task and so on. Tabs for its
 * pages, "+" for a new one, the bin for the open one; "Save" at the
 * bottom right keeps the changes (also ⌘/Ctrl+S). Private: what
 * someone writes here only they see, even in a shared dashboard.
 * Read-only in the gallery's preview.
 */
export function NoteBody({
  widget,
  initial,
}: {
  widget: Widget;
  /** This person's stored pages. */
  initial: NotePage[];
}) {
  const t = useTranslations("widgets");
  const confirm = useConfirm();
  const note = useNoteContext();
  const canWrite = !!note?.canWrite;
  const [pages, setPages] = useState<NotePage[]>(() =>
    (initial.length ? initial : [{ id: "p1" }]).map((p) => ({
      id: p.id,
      doc: docOf(p),
    })),
  );
  const [activeId, setActiveId] = useState(pages[0].id);
  // What's stored — "Save" appears once the pages differ from it.
  const [stored, setStored] = useState(pages);
  const [saving, startSaving] = useTransition();
  const dirty = JSON.stringify(pages) !== JSON.stringify(stored);

  const save = () =>
    startSaving(async () => {
      if (note && (await note.save(widget.id, pages))) setStored(pages);
    });
  const active = pages.find((p) => p.id === activeId) ?? pages[0];

  const commit = (next: NotePage[]) => setPages(next);

  const write = (doc: PMDoc) =>
    commit(pages.map((p) => (p.id === active.id ? { ...p, doc } : p)));

  const addPage = () => {
    if (pages.length >= 12) return;
    const page = { id: randomId().slice(0, 12), doc: fromMarkdown("") };
    commit([...pages, page]);
    setActiveId(page.id);
  };

  const removePage = async () => {
    const empty = isEmptyDoc(docOf(active));
    if (
      !empty &&
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
      const fresh = { id: randomId().slice(0, 12), doc: fromMarkdown("") };
      commit([fresh]);
      setActiveId(fresh.id);
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
      <MiniEditor
        // A fresh editor per page — its content is its own state.
        key={active.id}
        value={active.doc}
        onChange={write}
        onSave={() => {
          if (dirty) save();
        }}
        editable={canWrite}
        label={t("type_note")}
        placeholder={t("notePlaceholder")}
        className={styles.noteEditor}
      />
      {canWrite && dirty && (
        <div className={styles.noteSave}>
          <Button
            variant="primary"
            size="sm"
            icon={<Icon icon="lucide:check" width={14} />}
            onClick={save}
            disabled={saving}
          >
            {t("save")}
          </Button>
        </div>
      )}
    </div>
  );
}
