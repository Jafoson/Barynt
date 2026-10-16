"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import type { NotePage, Widget } from "@/features/dashboard/widgets";
import { randomId } from "@/lib/utils/id";
import { useNoteContext } from "../../NoteContext/NoteContext";
import styles from "../widget.module.scss";
import { NoteMarkdown, plainTitle, toggleTask } from "./NoteMarkdown";

/** A tab's name: the page's first line, short, without its Markdown. */
const titleOf = (page: NotePage) => plainTitle(page.text);

/**
 * A note you write straight into (BARY-169): tabs for its pages, "+" for a
 * new one, × to delete the open one; the text saves itself. The first line
 * names the tab, like a note on a phone. Private: what someone writes here
 * only they see, even in a shared dashboard. Read-only in the gallery's
 * preview.
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
    initial.length ? initial : [{ id: "p1", text: "" }],
  );
  const [activeId, setActiveId] = useState(pages[0].id);
  /** Writing: the raw text in a field. Otherwise the Markdown, rendered. */
  const [writing, setWriting] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  // Opened by a click on the rendered note: straight into typing, the
  // caret at the end.
  useEffect(() => {
    const el = field.current;
    if (!writing || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [writing]);
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
              onClick={() => {
                setActiveId(page.id);
                setWriting(false);
              }}
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
      {canWrite && (writing || !active.text.trim()) ? (
        <textarea
          key={active.id}
          className={styles.noteText}
          value={active.text}
          placeholder={t("notePlaceholder")}
          aria-label={t("type_note")}
          maxLength={5000}
          ref={field}
          onChange={(e) => write(e.target.value)}
          onBlur={() => setWriting(false)}
        />
      ) : canWrite ? (
        // biome-ignore lint/a11y/useSemanticElements: the rendered note holds links and checkboxes, which a <button> or <textarea> can't contain
        <div
          className={styles.noteView}
          role="textbox"
          tabIndex={0}
          aria-label={t("noteEdit")}
          title={t("noteEdit")}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a, input")) return;
            setWriting(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setWriting(true);
            }
          }}
        >
          <NoteMarkdown
            source={active.text}
            onToggle={(line) => write(toggleTask(active.text, line))}
          />
        </div>
      ) : active.text.trim() ? (
        <div className={styles.noteView}>
          <NoteMarkdown source={active.text} />
        </div>
      ) : (
        <p className={styles.note}>{t("noteEmpty")}</p>
      )}
    </div>
  );
}
