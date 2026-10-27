"use client";

import { Icon } from "@iconify/react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { modKey } from "@/lib/a11y";
import styles from "./editorToolbar.module.scss";

/**
 * The toolbar above the editor.
 *
 * It only shows what's used often — everything else lives in the `/` menu.
 * Each button lights up when its mark applies at the current cursor
 * position.
 *
 * The active state comes via `useEditorState`: that computes once per
 * transaction and only re-renders when the result actually changes. Without
 * it, every keystroke would redraw the whole toolbar.
 */

/** Also the key in `messages/*.json` under `editor`. */
type ToolId =
  | "bold"
  | "italic"
  | "strikethrough"
  | "code"
  | "heading"
  | "bulletList"
  | "numberedList"
  | "taskList"
  | "quote"
  | "link"
  | "attachment";

interface ToolbarActions {
  /** Opens the editor's address bar — directly below `anchor`, instead of at
   *  the cursor, which can sit elsewhere in the text when a toolbar button
   *  is clicked. */
  onLink: (anchor?: HTMLElement) => void;
  /** Opens the attachment dialog (URL or upload, depending on what the
   *  editor instance offers) — image, video, or other file, one picker
   *  instead of separate buttons. Missing where the editor instance doesn't
   *  offer attachments (comments, the create-issue composer). */
  onAttachment?: (anchor?: HTMLElement) => void;
}

interface ToolButton {
  id: ToolId;
  icon: string;
  /** Keyboard shortcut shown in the tooltip after the name. */
  shortcut?: string;
  /** `anchor` is the clicked button itself — for popovers that should
   *  position against it rather than against the cursor. */
  run: (editor: Editor, actions: ToolbarActions, anchor: HTMLElement) => void;
  /** When the button counts as active. */
  active?: (editor: Editor) => boolean;
}

const GROUPS: ToolButton[][] = [
  [
    {
      id: "bold",
      icon: "lucide:bold",
      run: (e) => e.chain().focus().toggleBold().run(),
      active: (e) => e.isActive("bold"),
    },
    {
      id: "italic",
      icon: "lucide:italic",
      run: (e) => e.chain().focus().toggleItalic().run(),
      active: (e) => e.isActive("italic"),
    },
    {
      id: "strikethrough",
      icon: "lucide:strikethrough",
      run: (e) => e.chain().focus().toggleStrike().run(),
      active: (e) => e.isActive("strike"),
    },
    {
      id: "code",
      icon: "lucide:code",
      run: (e) => e.chain().focus().toggleCode().run(),
      active: (e) => e.isActive("code"),
    },
  ],
  [
    {
      id: "heading",
      icon: "lucide:heading",
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
      active: (e) => e.isActive("heading", { level: 2 }),
    },
    {
      id: "bulletList",
      icon: "lucide:list",
      run: (e) => e.chain().focus().toggleBulletList().run(),
      active: (e) => e.isActive("bulletList"),
    },
    {
      id: "numberedList",
      icon: "lucide:list-ordered",
      run: (e) => e.chain().focus().toggleOrderedList().run(),
      active: (e) => e.isActive("orderedList"),
    },
    {
      id: "taskList",
      icon: "lucide:list-checks",
      run: (e) => e.chain().focus().toggleTaskList().run(),
      active: (e) => e.isActive("taskList"),
    },
    {
      id: "quote",
      icon: "lucide:quote",
      run: (e) => e.chain().focus().toggleBlockquote().run(),
      active: (e) => e.isActive("blockquote"),
    },
  ],
  [
    {
      id: "link",
      icon: "lucide:link",
      shortcut: "K",
      // Setting, changing, and removing is handled by the address bar — it
      // knows the existing link and also offers removal there.
      run: (_editor, { onLink }, anchor) => onLink(anchor),
      active: (e) => e.isActive("link"),
    },
    {
      id: "attachment",
      icon: "lucide:paperclip",
      // Opens the attachment dialog — the actual choice (URL/upload) and
      // the upload itself happen in `RichTextEditor.tsx`.
      run: (_editor, { onAttachment }, anchor) => onAttachment?.(anchor),
    },
  ],
];

interface EditorToolbarProps {
  editor: Editor | null;
  /** Opens the address bar for links. */
  onLink: () => void;
  /** Opens the attachment dialog. Missing ⇒ no button for it. */
  onAttachment?: () => void;
  /** Whether the editor currently fills the screen. */
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function EditorToolbar({
  editor,
  onLink,
  onAttachment,
  fullscreen,
  onToggleFullscreen,
}: EditorToolbarProps) {
  const t = useTranslations("editor");

  const active = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return {} as Record<string, boolean>;
      const state: Record<string, boolean> = {};
      for (const group of GROUPS)
        for (const button of group)
          state[button.id] = button.active?.(editor) ?? false;
      return state;
    },
  });

  if (!editor) return null;

  return (
    <div className={styles.toolbar} role="toolbar" aria-label={t("toolbar")}>
      <div className={styles.tools}>
        {GROUPS.map((group, index) => (
          <Fragment key={group[0].id}>
            {index > 0 && <span className={styles.divider} />}
            {group
              // No button for a feature this editor instance doesn't offer.
              .filter((button) => button.id !== "attachment" || onAttachment)
              .map((button) => (
                <button
                  key={button.id}
                  type="button"
                  className={styles.btn}
                  data-active={active?.[button.id] ? "" : undefined}
                  aria-pressed={
                    button.active ? !!active?.[button.id] : undefined
                  }
                  aria-label={t(button.id)}
                  title={
                    button.shortcut
                      ? `${t(button.id)} (${modKey()} + ${button.shortcut})`
                      : t(button.id)
                  }
                  // Focus must stay in the text — otherwise the command loses
                  // the selection it applies to.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) =>
                    button.run(
                      editor,
                      { onLink, onAttachment },
                      e.currentTarget,
                    )
                  }
                >
                  <Icon icon={button.icon} width={15} />
                </button>
              ))}
          </Fragment>
        ))}
      </div>
      {/* Outside the row: on a phone the row scrolls sideways, this one
          stays put at the right edge. */}
      <button
        type="button"
        className={styles.btn}
        data-active={fullscreen ? "" : undefined}
        aria-pressed={fullscreen}
        aria-label={t(fullscreen ? "exitFullscreen" : "fullscreen")}
        title={t(fullscreen ? "exitFullscreen" : "fullscreen")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggleFullscreen}
      >
        <Icon
          icon={fullscreen ? "lucide:minimize-2" : "lucide:maximize-2"}
          width={15}
        />
      </button>
    </div>
  );
}
