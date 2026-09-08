"use client";

import { Fragment, useEffect, useState } from "react";
import { formatShortcut } from "@/lib/shortcuts/format";
import styles from "./shortcut.module.scss";

interface ShortcutProps {
  /**
   * Spec as passed to `useShortcut`, e.g. "mod+enter", "c", "shift+?" — or
   * several, for a shortcut bound to more than one combo (e.g. "j" and
   * "down" both move the cursor down); shown "/"-separated, in order.
   */
  keys: string | string[];
  className?: string;
}

/**
 * Renders one or more shortcut specs as `<kbd>` badges, platform-aware
 * (⌘ vs Strg).
 *
 * Server-rendered with the non-Mac labels — `formatShortcut`'s platform
 * check needs `navigator`, which doesn't exist yet on the server, and
 * guessing would risk a hydration mismatch on whichever half of visitors
 * it guessed wrong for. Corrected via `useEffect` right after mount
 * instead: one extra render, no mismatch, and the badge is rarely the
 * first thing painted anyway.
 */
export function Shortcut({ keys, className }: ShortcutProps) {
  const specs = Array.isArray(keys) ? keys : [keys];
  // Collapsed into one string: a fresh array literal from an inline caller
  // would otherwise look like a new value on every render and re-run the
  // effect for nothing. JSON, not `join(",")`: a spec can itself contain a
  // comma (the "copy link" shortcut is "mod+shift+,"), which `join`/`split`
  // would misparse as a second, empty spec — with a shorter `combos` than
  // `specs` for exactly one render, i.e. a missing-key warning.
  const specsKey = JSON.stringify(specs);
  const [combos, setCombos] = useState(() =>
    specs.map((spec) => formatShortcut(spec, false)),
  );

  useEffect(() => {
    setCombos(
      (JSON.parse(specsKey) as string[]).map((spec) => formatShortcut(spec)),
    );
  }, [specsKey]);

  return (
    <span className={[styles.shortcut, className].filter(Boolean).join(" ")}>
      {combos.map((labels, ci) => (
        <Fragment key={`${specs[ci]}-${ci}`}>
          {ci > 0 && <span className={styles.or}>/</span>}
          {labels.map((label, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static key sequence, may contain repeats
            <kbd key={`${label}-${i}`} className={styles.kbd}>
              {label}
            </kbd>
          ))}
        </Fragment>
      ))}
    </span>
  );
}
