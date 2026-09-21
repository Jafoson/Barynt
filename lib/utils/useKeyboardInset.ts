"use client";

import { useEffect } from "react";

/** Text-entry targets: fields, and the rich-text editor's `contenteditable`. */
const TEXT_FIELD =
  'textarea, input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="file"], [type="range"], [type="color"]), [contenteditable="true"]';

function revealFocusedField() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.matches(TEXT_FIELD)) return;
  // A long editor is one element: follow the cursor, not the whole box.
  let target: Element = active;
  if (active.isContentEditable) {
    const node = window.getSelection()?.focusNode;
    const el = node instanceof Element ? node : node?.parentElement;
    if (el && active.contains(el)) target = el;
  }
  target.scrollIntoView({ block: "center", behavior: "smooth" });
}

/**
 * Keeps `--kb-inset` (on `<html>`) at the height of the on-screen keyboard,
 * so a fixed layer can lift itself above it.
 *
 * Where the browser resizes the layout for the keyboard (Android Chrome with
 * `interactive-widget=resizes-content`, see the root layout), `innerHeight`
 * already shrinks and the inset stays 0. iOS Safari only resizes the *visual*
 * viewport: `innerHeight` stays, `visualViewport.height` shrinks, and the
 * difference is the keyboard.
 *
 * Also keeps the focused text field in sight: the keyboard opens *after* the
 * focus, and a field inside a scroller (or a fixed layer) isn't always
 * brought along by the browser — so on a touch device it's scrolled to the
 * middle of what's left once the keyboard has taken its space.
 */

export function useKeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      root.style.setProperty("--kb-inset", `${Math.round(inset)}px`);
    };
    update();

    // Touch only: with a mouse and a physical keyboard nothing covers the field.
    const touch = window.matchMedia("(pointer: coarse)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reveal = (delay: number) => {
      if (!touch.matches) return;
      clearTimeout(timer);
      timer = setTimeout(revealFocusedField, delay);
    };
    // The keyboard is still sliding in right after the focus; the resize it
    // causes is the moment the space really is gone.
    const onFocusIn = () => reveal(300);
    const onResize = () => {
      update();
      reveal(50);
    };

    document.addEventListener("focusin", onFocusIn);
    viewport.addEventListener("resize", onResize);
    viewport.addEventListener("scroll", update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("focusin", onFocusIn);
      viewport.removeEventListener("resize", onResize);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--kb-inset");
    };
  }, []);
}
