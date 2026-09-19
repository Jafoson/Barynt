"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether there's a keyboard to press shortcuts on.
 *
 * The browser has no "keyboard attached" flag, so this is a guess from two
 * signals:
 * - a mouse or trackpad (`any-pointer: fine`) means a desktop-style setup —
 *   a phone or a bare tablet only has a touch screen (`coarse`);
 * - a keypress a soft keyboard can't produce: a chord with Ctrl/Meta/Alt, or
 *   Tab, Escape, an arrow or a function key. That catches a tablet with a
 *   Bluetooth or cover keyboard and no pointer — from that moment on, and
 *   until the tab is closed, shortcuts show. Ordinary letters don't count:
 *   the on-screen keyboard sends them too.
 *
 * `false` on the server and during hydration's first render.
 */
const POINTER_QUERY = "(any-pointer: fine)";
const STORAGE_KEY = "has-keyboard";

const listeners = new Set<() => void>();
let sawKeyboard = readStored();

function readStored() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function isPhysicalKey(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  const { key } = event;
  return (
    key === "Tab" ||
    key === "Escape" ||
    key.startsWith("Arrow") ||
    /^F\d{1,2}$/.test(key)
  );
}

function onKeyDown(event: KeyboardEvent) {
  if (sawKeyboard || !isPhysicalKey(event)) return;
  sawKeyboard = true;
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Without storage the guess just starts over on the next visit.
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia(POINTER_QUERY);
  query.addEventListener("change", onChange);
  if (listeners.size === 0) {
    sawKeyboard = sawKeyboard || readStored();
    window.addEventListener("keydown", onKeyDown, true);
  }
  listeners.add(onChange);
  return () => {
    query.removeEventListener("change", onChange);
    listeners.delete(onChange);
    if (listeners.size === 0) {
      window.removeEventListener("keydown", onKeyDown, true);
    }
  };
}

export function useHasKeyboard() {
  return useSyncExternalStore(
    subscribe,
    () => sawKeyboard || window.matchMedia(POINTER_QUERY).matches,
    () => false,
  );
}
