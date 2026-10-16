"use client";

import { Extension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRef } from "react";
import { toDoc } from "@/lib/richtext";
import type { PMDoc } from "@/lib/richtext/types";
import styles from "./miniEditor.module.scss";

export interface MiniEditorProps {
  value: PMDoc | unknown;
  onChange: (doc: PMDoc) => void;
  label: string;
  placeholder?: string;
  /** ⌘/Ctrl+S inside the editor — for a caller with its own "Save". */
  onSave?: () => void;
  /** `false`: shown formatted, not changeable (a preview). */
  editable?: boolean;
  className?: string;
}

/**
 * A small writing surface that formats as you type — no toolbar, no menus.
 * Markdown shortcuts turn into formatting on the spot: `# ` a heading,
 * `- ` a list, `1. ` a numbered one, `[ ] ` a task, `> ` a quote,
 * `**bold**`, `*italic*`, `` `code` ``, `---` a rule. For short texts in
 * tight places (the dashboard's note); the full editor with toolbar,
 * mentions and attachments is `RichTextEditor`.
 *
 * Like `RichTextEditor`, only ever loaded via `next/dynamic` with
 * `ssr: false`.
 */
export function MiniEditor({
  value,
  onChange,
  onSave,
  label,
  placeholder,
  editable = true,
  className,
}: MiniEditorProps) {
  // The shortcut reads the latest handler — the extension is built once.
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: { openOnClick: true, autolink: true },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Extension.create({
        name: "saveShortcut",
        addKeyboardShortcuts: () => ({
          "Mod-s": () => {
            if (!saveRef.current) return false;
            saveRef.current();
            return true;
          },
        }),
      }),
    ],
    content: toDoc(value) as JSONContent,
    editorProps: {
      attributes: {
        class: styles.surface,
        "aria-label": label,
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as PMDoc),
  });

  return (
    <EditorContent
      editor={editor}
      className={[styles.editor, className].filter(Boolean).join(" ")}
    />
  );
}
