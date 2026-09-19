"use client";

import { useEffect } from "react";

/**
 * Keeps `--kb-inset` (on `<html>`) at the height of the on-screen keyboard,
 * so a fixed layer can lift itself above it.
 *
 * Where the browser resizes the layout for the keyboard (Android Chrome with
 * `interactive-widget=resizes-content`, see the root layout), `innerHeight`
 * already shrinks and the inset stays 0. iOS Safari only resizes the *visual*
 * viewport: `innerHeight` stays, `visualViewport.height` shrinks, and the
 * difference is the keyboard.
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
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--kb-inset");
    };
  }, []);
}
