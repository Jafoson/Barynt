"use client";

import type { ReactNode } from "react";
import styles from "../widget.module.scss";

/**
 * Light Markdown for notes — just enough to structure a few lines:
 *
 *   # Heading / ## Smaller
 *   **bold**, *italic*, `code`, ~~struck~~
 *   - item / * item / 1. item
 *   - [ ] open / - [x] done   (a click ticks it)
 *   [text](https://…) and bare https://… links
 *   > quote, --- rule
 *
 * Translated to React by hand — no HTML string, nothing to inject.
 */

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** Inline marks within one line. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Order matters: links before bare URLs, bold before italic.
  const pattern =
    /\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+)|\*\*([^*]+)\*\*|~~([^~]+)~~|`([^`]+)`|\*([^*]+)\*|_([^_]+)_/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${i++}`;
    if (m[1] && m[2]) {
      out.push(
        SAFE_URL.test(m[2]) ? (
          <a key={k} href={m[2]} target="_blank" rel="noreferrer">
            {m[1]}
          </a>
        ) : (
          m[0]
        ),
      );
    } else if (m[3]) {
      out.push(
        <a key={k} href={m[3]} target="_blank" rel="noreferrer">
          {m[3]}
        </a>,
      );
    } else if (m[4]) out.push(<strong key={k}>{inline(m[4], k)}</strong>);
    else if (m[5]) out.push(<s key={k}>{inline(m[5], k)}</s>);
    else if (m[6]) out.push(<code key={k}>{m[6]}</code>);
    else if (m[7] || m[8]) out.push(<em key={k}>{inline(m[7] ?? m[8], k)}</em>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "h"; level: 1 | 2 | 3; text: string }
  | { kind: "p"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | {
      kind: "list";
      ordered: boolean;
      items: { text: string; task: boolean | null; line: number }[];
    };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.split("\n");
  for (const [index, raw] of lines.entries()) {
    const line = raw.trimEnd();
    const item = line.match(
      /^\s*(?:([-*+])|(\d+)[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/,
    );
    if (item) {
      const ordered = !!item[2];
      const task = item[3] === undefined ? null : item[3].toLowerCase() === "x";
      const prev = blocks[blocks.length - 1];
      const entry = { text: item[4], task, line: index };
      if (prev?.kind === "list" && prev.ordered === ordered)
        prev.items.push(entry);
      else blocks.push({ kind: "list", ordered, items: [entry] });
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({
        kind: "h",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2],
      });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      blocks.push({ kind: "quote", text: quote[1] });
      continue;
    }
    if (line.trim() === "") continue;
    blocks.push({ kind: "p", text: line });
  }
  return blocks;
}

/** Tick or untick the task on `line` of `source`. */
export function toggleTask(source: string, line: number): string {
  const lines = source.split("\n");
  lines[line] = lines[line].replace(/\[( |x|X)\]/, (box) =>
    box === "[ ]" ? "[x]" : "[ ]",
  );
  return lines.join("\n");
}

/** A note's first line, without its Markdown — the tab's name. */
export function plainTitle(source: string): string {
  const first = source.split("\n").find((l) => l.trim()) ?? "";
  return first
    .replace(/^\s*(#{1,3}|>|[-*+]|\d+[.)])\s+/, "")
    .replace(/^\[( |x|X)\]\s+/, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim()
    .slice(0, 24);
}

export function NoteMarkdown({
  source,
  onToggle,
}: {
  source: string;
  /** Ticks a task — absent where the note is read-only. */
  onToggle?: (line: number) => void;
}) {
  return (
    <div className={styles.md}>
      {parse(source).map((block, b) => {
        const key = `b${b}`;
        switch (block.kind) {
          case "h": {
            const Tag = (["h3", "h4", "h5"] as const)[block.level - 1];
            return <Tag key={key}>{inline(block.text, key)}</Tag>;
          }
          case "p":
            return <p key={key}>{inline(block.text, key)}</p>;
          case "quote":
            return <blockquote key={key}>{inline(block.text, key)}</blockquote>;
          case "rule":
            return <hr key={key} />;
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List
                key={key}
                data-tasks={
                  block.items.some((i) => i.task !== null) || undefined
                }
              >
                {block.items.map((item) => (
                  <li key={item.line} data-done={item.task || undefined}>
                    {item.task !== null && (
                      <input
                        type="checkbox"
                        checked={item.task}
                        disabled={!onToggle}
                        onChange={() => onToggle?.(item.line)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <span>{inline(item.text, `${key}-${item.line}`)}</span>
                  </li>
                ))}
              </List>
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}
