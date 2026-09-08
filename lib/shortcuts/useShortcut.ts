"use client";

import { useEffect, useRef } from "react";

const KEY_EVENT_NAMES: Record<string, string> = {
  enter: "Enter",
  esc: "Escape",
  escape: "Escape",
  backspace: "Backspace",
  tab: "Tab",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};

interface ParsedShortcut {
  /** `KeyboardEvent.key` to match, e.g. "k", "Enter", "?". */
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

function parseShortcut(spec: string): ParsedShortcut {
  const tokens = spec.toLowerCase().split("+");
  const last = tokens[tokens.length - 1];
  return {
    key: KEY_EVENT_NAMES[last] ?? last,
    mod: tokens.includes("mod"),
    shift: tokens.includes("shift"),
    alt: tokens.includes("alt"),
  };
}

/**
 * Exact modifier match, not "at least" — a bare "c" must stay silent on
 * Cmd+C (copy), and "shift+?" must stay silent on plain "/". Letter keys
 * compare case-insensitively (Shift already tracked separately above);
 * everything else (`Enter`, `Escape`, `?`, …) compares as `event.key` gives it.
 */
function eventMatches(e: KeyboardEvent, parsed: ParsedShortcut): boolean {
  const eventKey = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const wantKey =
    parsed.key.length === 1 ? parsed.key.toLowerCase() : parsed.key;
  if (eventKey !== wantKey) return false;
  if ((e.metaKey || e.ctrlKey) !== parsed.mod) return false;
  if (e.shiftKey !== parsed.shift) return false;
  if (e.altKey !== parsed.alt) return false;
  return true;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

interface UseShortcutOptions {
  enabled?: boolean;
  /**
   * Fire even while typing in an input/textarea/contentEditable element.
   * Off by default: a bare letter like "c" must not hijack typing — only
   * combinations that can't collide with normal text entry (e.g.
   * "mod+enter" to submit a form) make sense in there.
   */
  allowInEditable?: boolean;
}

/**
 * Binds a keyboard shortcut to `handler` for as long as the calling
 * component is mounted and `enabled`.
 *
 * `spec` is a "+"-joined combo in press order, e.g. `"c"`, `"mod+enter"`,
 * `"shift+?"`. Recognized modifier tokens: `mod` (⌘ on Mac, Ctrl
 * elsewhere — never `metaKey`/`ctrlKey` individually, so the same spec
 * works on every platform), `shift`, `alt`. Everything else is a
 * `KeyboardEvent.key` value (case-insensitive for single letters); see
 * `KEY_EVENT_NAMES` for the handful of named keys ("enter", "esc", …).
 *
 * One `document` listener per call, matching `useSubmitShortcut` — this is
 * a handful of shortcuts per page at most, not enough to justify a shared
 * dispatcher. The handler lives in a ref and is refreshed after every
 * render so the listener itself never needs to be re-attached.
 */
export function useShortcut(
  spec: string,
  handler: (e: KeyboardEvent) => void,
  { enabled = true, allowInEditable = false }: UseShortcutOptions = {},
) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    const parsed = parseShortcut(spec);

    const onKeyDown = (e: KeyboardEvent) => {
      if (!allowInEditable && isEditableTarget(e.target)) return;
      if (!eventMatches(e, parsed)) return;
      e.preventDefault();
      handlerRef.current(e);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [spec, enabled, allowInEditable]);
}

/**
 * Fires a bare key (no modifiers) as if it had been pressed — for a button
 * that should do exactly what its keyboard equivalent already does,
 * reusing that `useShortcut` handler instead of a second copy of its
 * logic (e.g. the issue detail header's prev/next arrows triggering the
 * same "j"/"k" the board and list already bind). `target` is `document`,
 * same as a real keypress reaching the listener above without going
 * through any particular element — `isEditableTarget` sees a `Document`,
 * not an `HTMLElement`, so it never mistakes this for typing.
 *
 * Only meaningful for plain letters/named keys: `mod` reflects a real
 * platform modifier actually held down, which a synthetic event can't
 * fake in a way worth relying on.
 */
export function dispatchShortcut(key: string) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}
