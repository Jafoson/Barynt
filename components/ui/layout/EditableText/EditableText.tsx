"use client";

import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import styles from "./editableText.module.scss";

interface EditableTextProps {
  value: string;
  /** Runs when the field is left — and only if something changed. */
  onCommit: (value: string) => void;
  /** Accessible name: the field looks like text, so it has no visible label. */
  label: string;
  placeholder?: string;
  /**
   * Single line: Enter submits instead of wrapping, and an empty value is
   * discarded — for fields that must not be empty (e.g. a title).
   */
  singleLine?: boolean;
  /**
   * Ready to type as soon as it appears. For fields that only show up on
   * demand (an edit button) — whoever expands one doesn't want to have to
   * click into it first.
   */
  autoFocus?: boolean;
  /** Labels for the two buttons — please pass these localized. */
  saveLabel?: string;
  cancelLabel?: string;
  /** Typography of the surrounding text — the field and its twin inherit it. */
  className?: string;
  /** Read-only: no focus, no buttons, `onCommit` is never called. */
  readOnly?: boolean;
}

/**
 * Text that looks like text and behaves like a field to the touch: no edit
 * mode, no forced save. Committed when the field is left, with Enter (or
 * Cmd/Ctrl+Enter when multi-line), or via the checkmark; discarded with
 * Escape or the cross.
 *
 * Height grows via an invisible twin in the same grid — a pure CSS solution
 * so nobody has to recompute line heights in JavaScript.
 */
export function EditableText({
  value,
  onCommit,
  label,
  placeholder,
  singleLine,
  autoFocus,
  saveLabel = "Save",
  cancelLabel = "Cancel",
  className,
  readOnly = false,
}: EditableTextProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(value);
  const [source, setSource] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  // Discarding always goes through `blur()`, and that fires synchronously —
  // without this flag, the path through the blur handler would end up being
  // treated as a commit.
  const isCanceling = useRef(false);

  // A new value from outside wins (saved, or changed by someone else).
  // Reconciled during render rather than via an effect: React discards the
  // in-progress render and continues directly with the new state. It's
  // ignored while typing — otherwise a response arriving mid-edit would
  // overwrite the next keystrokes.
  if (!isEditing && source !== value) {
    setSource(value);
    setDraft(value);
  }

  const cancel = () => {
    isCanceling.current = true;
    inputRef.current?.blur();
  };

  /**
   * Focus can only be set on the element itself — there's no way to do this
   * through rendering. The cursor lands at the end instead of selecting
   * everything: appending is the more common case than replacing.
   */
  useEffect(() => {
    if (!autoFocus) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [autoFocus]);

  /**
   * Escape must not bubble up to the modal here, or discarding would close
   * the whole panel along with it. Attached to `window` with capture so it
   * runs before the ModalContext handler (on `document`).
   */
  useEffect(() => {
    if (!isEditing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      isCanceling.current = true;
      inputRef.current?.blur();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isEditing]);

  const commit = () => {
    setIsEditing(false);
    if (isCanceling.current) {
      isCanceling.current = false;
      setDraft(value);
      return;
    }
    const next = singleLine ? draft.trim() : draft;
    if (singleLine && !next) {
      setDraft(value);
      return;
    }
    setDraft(next);
    if (next !== value) onCommit(next);
  };

  /**
   * Both buttons work via the same path as the keyboard and clicking
   * elsewhere: `blur()` triggers the commit. The suppressed mousedown keeps
   * focus in the field until the click completes — otherwise the buttons
   * would already be gone before they could trigger anything.
   */
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  // Display only: no textarea, no focus, no cursor on click — a `readonly`
  // attribute alone would still leave the field looking focusable and
  // selectable, as if it could still be entered.
  if (readOnly) {
    return (
      <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
        <div className={styles.field} data-value={value} data-readonly>
          <div className={styles.input}>{value}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
      <div className={styles.field} data-value={draft}>
        <textarea
          ref={inputRef}
          className={styles.input}
          aria-label={label}
          placeholder={placeholder}
          value={draft}
          rows={1}
          // Lets a surrounding field-roving handler (e.g. the issue panel)
          // jump Up/Down to the next field instead of moving the cursor —
          // only for single-line fields, where there's no second line for
          // the cursor to go to anyway. A multi-line field keeps its arrow
          // keys for real cursor movement, so it's never marked.
          data-field-nav={singleLine || undefined}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (singleLine || e.metaKey || e.ctrlKey) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      </div>

      {isEditing && (
        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="sm"
            tabIndex={-1}
            icon={<Icon icon="lucide:x" width={15} />}
            aria-label={cancelLabel}
            title={cancelLabel}
            onMouseDown={keepFocus}
            onClick={cancel}
          />
          <Button
            variant="primary"
            size="sm"
            tabIndex={-1}
            icon={<Icon icon="lucide:check" width={15} />}
            aria-label={saveLabel}
            title={saveLabel}
            onMouseDown={keepFocus}
            onClick={() => inputRef.current?.blur()}
          />
        </div>
      )}
    </div>
  );
}
