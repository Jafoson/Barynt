"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SelectEmpty } from "./atoms/SelectAction";
import SelectItem from "./atoms/SelectItem";
import styles from "./SelectMenu.module.scss";

export interface ISelectItem {
  value: string | number | null;
  label: string;
  icon?: React.ReactNode;
  hint?: string;
}

interface SelectMenuProps {
  items: ISelectItem[];
  value: (string | number | null) | (string | number | null)[];
  onPick: (value: string | number | null) => void;
  onClose?: () => void;
  searchable?: boolean;
  placeholder?: string;
  multi?: boolean;
  /**
   * Trailing content inside the same scrollable list (`.content`) as the
   * items — not a separate area below it, so it shares their Up/Down
   * roving and, for a long list, scrolls with them rather than always
   * floating in view (same reasoning as `Table`'s own `footer`, e.g. a
   * "Create new issue" row after a search's results).
   */
  footer?: React.ReactNode;
  /**
   * Replaces the default "no matches" row. Gets the live query so callers can
   * offer to create whatever was typed.
   */
  emptyState?: (query: string) => React.ReactNode;
}

export function SelectMenu({
  items,
  value,
  onPick,
  onClose,
  searchable,
  placeholder,
  multi,
  footer,
  emptyState,
}: SelectMenuProps) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Something always has focus the moment the menu opens — the search
    // field where there is one (already filters as you type), otherwise
    // the first item, so Up/Down below have somewhere to start from
    // without an initial Tab press first.
    if (searchable) inputRef.current?.focus();
    else
      contentRef.current
        ?.querySelector<HTMLElement>("[data-select-item]")
        ?.focus();
  }, [searchable]);

  const filtered = items.filter((it) =>
    it.label.toLowerCase().includes(q.toLowerCase()),
  );

  const isSel = (v: string | number | null) =>
    multi ? (value as (string | number | null)[]).includes(v) : value === v;

  /**
   * Up/Down between items. Wraps at the ends (last → first and back),
   * except Up from the very first item goes to the search field where
   * there is one instead of wrapping — that's the list's real "top". From
   * the search field itself, Up has nowhere further to go and is left
   * alone; only Down enters the list, at its first item. Enter/Space
   * picking an item and closing, and Escape closing the whole menu, both
   * come for free: items are real `<button>`s (native Enter/Space →
   * click, see `SelectItem`'s `onClick`), and `Popover.tsx` already closes
   * on Escape.
   *
   * `onKeyDownCapture`, not `onKeyDown`: the menu is portaled straight
   * onto `document.body` (`Popover.tsx`), so a bubble-phase handler here
   * races the issue panel's own field-roving — also a `document`-level
   * keydown listener (`IssueDetailView.tsx`) — and which of the two fires
   * first, or whether focus has already moved by the time the other one
   * runs, isn't this component's to depend on. Capture always runs first,
   * so stopping propagation here is unconditional: nothing further down
   * the line ever sees this keypress at all.
   */
  const step = (event: React.KeyboardEvent, forward: boolean) => {
    const itemEls = Array.from(
      contentRef.current?.querySelectorAll<HTMLElement>("[data-select-item]") ??
        [],
    );
    if (itemEls.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const index = itemEls.indexOf(document.activeElement as HTMLElement);
    if (index === -1) {
      if (forward) itemEls[0].focus();
      return;
    }
    if (forward) {
      itemEls[(index + 1) % itemEls.length].focus();
    } else if (index === 0 && inputRef.current) {
      inputRef.current.focus();
    } else {
      itemEls[(index - 1 + itemEls.length) % itemEls.length].focus();
    }
  };

  const onKeyDownCapture = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") step(event, true);
    else if (event.key === "ArrowUp") step(event, false);
  };

  return (
    <>
      {searchable && (
        <Input
          ref={inputRef}
          variant="search"
          size="sm"
          placeholder={placeholder ?? "Search…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDownCapture={onKeyDownCapture}
          style={{ marginBottom: 4 }}
        />
      )}
      <div
        className={styles.content}
        ref={contentRef}
        onKeyDownCapture={onKeyDownCapture}
        role="listbox"
        aria-multiselectable={multi}
      >
        {filtered.map((it) => (
          <SelectItem
            key={String(it.value)}
            it={it}
            isSel={isSel}
            onPick={onPick}
            onClose={onClose}
            multi={multi}
          />
        ))}
        {filtered.length === 0 &&
          (emptyState ? emptyState(q) : <SelectEmpty>No matches</SelectEmpty>)}
        {footer}
      </div>
    </>
  );
}
