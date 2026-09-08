import { modKey } from "@/lib/a11y";

/**
 * Symbols for keys whose event name isn't what should show on screen.
 * Anything not listed here is either already display-ready (`"?"`, `"k"`)
 * or a single letter, uppercased by `keyLabel`.
 */
const SYMBOLS: Record<string, string> = {
  shift: "⇧",
  enter: "↵",
  esc: "Esc",
  escape: "Esc",
  backspace: "⌫",
  tab: "⇥",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

function keyLabel(token: string, mac: boolean): string {
  if (token === "mod") return mac ? "⌘" : "Strg";
  if (token === "alt") return mac ? "⌥" : "Alt";
  const symbol = SYMBOLS[token];
  if (symbol) return symbol;
  return token.length === 1 ? token.toUpperCase() : token;
}

/**
 * Turns a shortcut spec ("mod+enter", "c", "shift+?") into the badges
 * `Shortcut` renders, in press order.
 *
 * `mac` defaults to the live platform check (`modKey()`) — pass it
 * explicitly for a deterministic first server-rendered paint (see
 * `Shortcut`, which corrects it again once mounted) or in tests.
 */
export function formatShortcut(
  spec: string,
  mac: boolean = modKey() === "⌘",
): string[] {
  return spec.split("+").map((token) => keyLabel(token, mac));
}
