"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import {
  RichText,
  type RichTextLabels,
} from "@/components/ui/atoms/RichText/RichText";
import { onActivate } from "@/lib/a11y";
import { isEmptyDoc, toDoc } from "@/lib/richtext/doc";
import type { PMDoc } from "@/lib/richtext/types";
import styles from "./editableRichText.module.scss";
import type {
  IssueSource,
  MentionSource,
  UploadedAttachment,
} from "./RichTextEditor";

/**
 * Text you can touch: the rendered document at rest, the editor after a
 * click. With its own buttons (`actions`, the normal case), editing stays
 * open until someone ends it — via save, cancel, Escape, or ⌘/Ctrl+Enter,
 * never by simply clicking away (unlike Jira). Without buttons
 * (`actions={false}`), leaving the field takes over instead, see
 * `EditableRichTextProps.actions`.
 *
 * The editor comes in via `next/dynamic` — as long as nobody is writing, the
 * browser doesn't even load the Tiptap bundle. Reading happens far more
 * often than writing, and the display path needs none of it.
 */

const RichTextEditor = dynamic(
  () => import("./RichTextEditor").then((m) => m.RichTextEditor),
  {
    // ProseMirror needs a real DOM; pre-rendering would just produce a
    // mismatched first tree.
    ssr: false,
    loading: () => <div className={styles.loading} />,
  },
);

interface EditableRichTextProps {
  value: PMDoc | unknown;
  /** Runs when the editor is left — and only if something changed. */
  onCommit: (value: PMDoc) => void;
  /**
   * Runs on every keystroke. Needed everywhere something else submits the
   * value without waiting for the field to be left: in the create-issue
   * window, ⌘/Ctrl+Enter is caught on `document` and would otherwise run
   * ahead of the `onCommit` here — the issue would be created without the
   * most recently typed text.
   */
  onChange?: (value: PMDoc) => void;
  /** Accessible name: the text carries no visible label. */
  label: string;
  placeholder?: string;
  saveLabel?: string;
  cancelLabel?: string;
  /**
   * Checkmark and cross below the field. Off where a dialog already has its
   * own buttons — in the create-issue window there would be two "Done"
   * buttons stacked on top of each other. Committed silently on leaving the
   * field or with ⌘/Ctrl+Enter instead.
   */
  actions?: boolean;
  members?: MentionSource[];
  issues?: IssueSource[];
  /** See `RichTextEditor` — upload/remove attachment. Missing ⇒ feature off. */
  onUploadAttachment?: (
    file: File,
  ) => Promise<UploadedAttachment | { error: string }>;
  onRemoveAttachment?: (id: string) => Promise<void>;
  /** See `RichTextEditor` — register an image URL as an attachment. */
  onAddLinkAttachment?: (input: {
    url: string;
    name?: string;
    mimeType?: string | null;
  }) => Promise<UploadedAttachment | { error: string }>;
  /** Display labels — so far only the code block. */
  labels?: Partial<RichTextLabels>;
  className?: string;
  /** Display only: no click opens the editor, `onCommit` is never called. */
  readOnly?: boolean;
  /**
   * Makes the editing state controllable from outside — e.g. a kebab menu
   * "Edit" entry that opens the editor without the text having been
   * clicked. If either prop is missing, the state stays internal
   * (`useState`, the previous behavior) — only both together hand control over.
   */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}

export function EditableRichText({
  value,
  onCommit,
  onChange,
  label,
  placeholder,
  saveLabel = "Save",
  cancelLabel = "Cancel",
  actions = true,
  members,
  issues,
  onUploadAttachment,
  onRemoveAttachment,
  onAddLinkAttachment,
  labels,
  className,
  readOnly = false,
  editing: editingProp,
  onEditingChange,
}: EditableRichTextProps) {
  const [draft, setDraft] = useState<PMDoc>(() => toDoc(value));
  const [source, setSource] = useState(value);
  const [internalEditing, setInternalEditing] = useState(false);
  // Controlled as soon as both props are present — otherwise purely internal as before.
  const isEditing = editingProp ?? internalEditing;
  const setIsEditing = onEditingChange ?? setInternalEditing;
  // The comparison runs over the serialized state: two documents are equal
  // if their JSON is equal, and `onUpdate` delivers a new object on every
  // keystroke.
  const committed = useRef(JSON.stringify(toDoc(value)));
  /**
   * Whether the mouse button is currently held down inside the editor.
   *
   * The resize handle isn't a focusable element: dragging takes focus away
   * from the text and doesn't hand it to anyone else — `relatedTarget` is
   * `null`. To `onBlur` below, that looks like a click outside, and the
   * field would collapse in the middle of dragging. This flag keeps it open.
   */
  const pressedInside = useRef(false);

  /**
   * Whether a native file dialog is currently open (uploading an
   * attachment/image).
   *
   * The native dialog sits outside the page — the window loses focus in the
   * process, and `relatedTarget` in the `blur` event is `null`, exactly as
   * with a click into empty space. Without this flag, editing would end
   * itself as soon as the dialog opens, the editor would be torn down, and
   * picking a file would go nowhere. It's reset as soon as the window
   * regains focus — the dialog is closed by then in any case, whether a
   * file was picked or not.
   */
  const filePickerOpen = useRef(false);

  // A new value from outside wins; it's ignored while editing, otherwise an
  // incoming response would overwrite what's being typed. Reconciled during
  // render rather than via an effect.
  if (!isEditing && source !== value) {
    setSource(value);
    setDraft(toDoc(value));
    committed.current = JSON.stringify(toDoc(value));
  }

  const cancel = () => {
    setDraft(toDoc(value));
    setIsEditing(false);
  };

  /**
   * Escape must not bubble up to the modal, or discarding would close the
   * whole panel along with it. Attached to `window` with capture so it runs
   * before the ModalContext handler (on `document`).
   *
   * The suggestion lists already intercept Escape before this and stop its
   * propagation — there it only closes the list.
   */
  useEffect(() => {
    if (!isEditing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setDraft(toDoc(value));
      setIsEditing(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isEditing, value, setIsEditing]);

  useEffect(() => {
    if (!isEditing) return;
    const release = () => {
      pressedInside.current = false;
    };
    window.addEventListener("mouseup", release);
    return () => window.removeEventListener("mouseup", release);
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    const release = () => {
      filePickerOpen.current = false;
    };
    window.addEventListener("focus", release);
    return () => window.removeEventListener("focus", release);
  }, [isEditing]);

  const commit = () => {
    setIsEditing(false);
    const next = JSON.stringify(draft);
    if (next !== committed.current) {
      committed.current = next;
      onCommit(draft);
    }
  };

  if (!isEditing) {
    // Display only: no `role="button"`, no click that opens the editor —
    // otherwise plain text would still look like a field.
    if (readOnly) {
      return (
        <div className={className}>
          <div className={styles.preview} data-readonly>
            {isEmptyDoc(draft) ? (
              <span className={styles.placeholder}>{placeholder}</span>
            ) : (
              <RichText value={draft} labels={labels} />
            )}
          </div>
        </div>
      );
    }

    return (
      <div className={className}>
        {/* biome-ignore lint/a11y/useSemanticElements: contains paragraphs and lists — a <button> would be invalid HTML */}
        <div
          className={styles.preview}
          role="button"
          tabIndex={0}
          aria-label={label}
          // Lets a surrounding field-roving handler (e.g. the issue panel)
          // jump Up/Down to it like any other field. Gone as soon as
          // editing starts — the Tiptap surface below keeps its own arrow
          // keys for actual cursor movement, so it's never marked.
          data-field-nav
          // Whatever is operable within the text itself keeps its click: a
          // link navigates there, the copy button on a code block copies.
          // Only a click on the text in between opens the editor.
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a, button")) return;
            setIsEditing(true);
          }}
          onKeyDown={onActivate(() => setIsEditing(true))}
        >
          {isEmptyDoc(draft) ? (
            <span className={styles.placeholder}>{placeholder}</span>
          ) : (
            <RichText value={draft} labels={labels} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Toolbar and writing surface belong together, hence a `fieldset`.
          With its own buttons (`actions`), plain blur has no meaning — see
          `onBlur` below. */}
      <fieldset
        className={styles.shell}
        onMouseDown={() => {
          pressedInside.current = true;
        }}
        onBlur={
          // With its own buttons, editing stays put no matter where focus
          // wanders — it's only left via save, cancel, or Escape (like
          // Jira). Without buttons (`actions={false}`, e.g. in the
          // create-issue window with its own "Done"), this path doesn't
          // exist, and leaving the field still takes over there.
          actions
            ? undefined
            : (e) => {
                if (e.currentTarget.contains(e.relatedTarget)) return;
                // Pressed down on the resize handle: focus is gone, but the
                // editor hasn't been left. Committed only on the next real
                // blur.
                if (pressedInside.current) return;
                // A native file dialog is open — see `filePickerOpen`.
                if (filePickerOpen.current) return;
                // The suggestion list, date picker, and address bar are
                // attached to `body` via a portal and thus sit outside this
                // tree. Focus has left the text, but the editor hasn't been
                // left — without this exception it would collapse
                // immediately on opening and take the portal down with it.
                // All three carry `data-editor-floating` for this reason.
                if (
                  (e.relatedTarget as HTMLElement | null)?.closest(
                    "[data-editor-floating]",
                  )
                )
                  return;
                commit();
              }
        }
      >
        <RichTextEditor
          value={draft}
          onChange={(doc) => {
            setDraft(doc);
            onChange?.(doc);
          }}
          onSubmit={commit}
          label={label}
          placeholder={placeholder}
          autoFocus
          members={members}
          issues={issues}
          onUploadAttachment={onUploadAttachment}
          onRemoveAttachment={onRemoveAttachment}
          onAddLinkAttachment={onAddLinkAttachment}
          onFilePickerOpen={() => {
            filePickerOpen.current = true;
          }}
        />
      </fieldset>

      {actions && (
        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="sm"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancel}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            size="sm"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
          >
            {saveLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
