"use client";

import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { toDoc } from "@/lib/richtext";
import type { PMDoc } from "@/lib/richtext/types";
import styles from "./miniEditor.module.scss";

export interface MiniEditorProps {
  value: PMDoc | unknown;
  onChange: (doc: PMDoc) => void;
  label: string;
  placeholder?: string;
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
  label,
  placeholder,
  editable = true,
  className,
}: MiniEditorProps) {
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
