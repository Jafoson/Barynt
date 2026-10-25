import { toDoc } from "./doc";
import type { PMDoc, PMMark, PMNode } from "./types";

/**
 * ProseMirror JSON → Markdown — the read-path counterpart to
 * `fromMarkdown` (and `richTextFromApiMarkdown`, which adds the chip
 * tokens on top). What the public API/MCP accepts as `description`/`body`
 * is what it hands back, so a caller can read, edit and write the text
 * again without losing its formatting.
 *
 * Chips come out as the tokens `richTextFromApiMarkdown` resolves:
 * `@handle`, `#PREFIX-123`, `//2026-08-14`, `[label|https://…]`. A mention
 * needs the member's handle, which the document doesn't carry (only id and
 * display name); the caller passes a lookup, without one the display name
 * stays as plain `@name`.
 *
 * Runs everywhere, no dependencies — like the rest of `lib/richtext`.
 */

export interface ToMarkdownOptions {
  /** Member id → `handle`. */
  mentionHandle?: (id: string) => string | undefined;
}

function attr(node: PMNode, key: string): string {
  const value = node.attrs?.[key];
  return typeof value === "string" ? value : "";
}

function hasMark(marks: PMMark[] | undefined, type: string): boolean {
  return !!marks?.some((m) => m.type === type);
}

/** Longest backtick run in `value` plus one — a fence/span that can't be closed early. */
function fenceFor(value: string, min: number): string {
  const longest = Math.max(
    0,
    ...(value.match(/`+/g) ?? []).map((r) => r.length),
  );
  return "`".repeat(Math.max(min, longest + 1));
}

function inlineText(node: PMNode): string {
  const value = node.text ?? "";
  const marks = node.marks;
  if (!value) return "";

  if (hasMark(marks, "code")) {
    const fence = fenceFor(value, 1);
    const pad = value.startsWith("`") || value.endsWith("`") ? " " : "";
    return `${fence}${pad}${value}${pad}${fence}`;
  }

  // Keep the surrounding whitespace outside the markers — `** bold **` isn't bold.
  const core = value.trim();
  const lead = value.slice(0, value.indexOf(core));
  const trail = value.slice(lead.length + core.length);
  if (!core) return value;

  let out = core;
  const link = marks?.find((m) => m.type === "link");
  if (hasMark(marks, "bold")) out = `**${out}**`;
  if (hasMark(marks, "italic")) out = `*${out}*`;
  if (hasMark(marks, "strike")) out = `~~${out}~~`;
  const href = link?.attrs?.href;
  if (typeof href === "string" && href) out = `[${out}](${href})`;
  return `${lead}${out}${trail}`;
}

function inline(
  nodes: PMNode[] | undefined,
  options: ToMarkdownOptions,
): string {
  return (nodes ?? [])
    .map((node) => {
      switch (node.type) {
        case "text":
          return inlineText(node);
        case "hardBreak":
          return "\n";
        case "mention": {
          const handle = options.mentionHandle?.(attr(node, "id"));
          return `@${handle ?? attr(node, "label")}`;
        }
        case "issueLink":
          return `#${attr(node, "identifier")}`;
        case "dateChip":
          return `//${attr(node, "date")}`;
        case "linkChip": {
          const label = attr(node, "label");
          const href = attr(node, "href");
          return label ? `[${label}|${href}]` : `[${href}]`;
        }
        case "emoji":
          return attr(node, "emoji");
        case "image":
          return `![${attr(node, "alt")}](${attr(node, "src")})`;
        case "attachment": {
          const name = attr(node, "name");
          const url = attr(node, "url");
          return url ? `[${name || url}](${url})` : name;
        }
        default:
          return inline(node.content, options);
      }
    })
    .join("");
}

function indent(text: string, prefix: string, firstPrefix = prefix): string {
  return text
    .split("\n")
    .map((line, i) => (line ? (i === 0 ? firstPrefix : prefix) + line : line))
    .join("\n");
}

function list(
  node: PMNode,
  options: ToMarkdownOptions,
  marker: (index: number, item: PMNode) => string,
): string {
  return (node.content ?? [])
    .map((item, index) => {
      const first = marker(index, item);
      const body = blocks(item.content, options).trimEnd();
      return indent(body, " ".repeat(first.length), first);
    })
    .join("\n");
}

function table(node: PMNode, options: ToMarkdownOptions): string {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) =>
      blocks(cell.content, options)
        .trim()
        .replace(/\n+/g, " ")
        .replace(/\|/g, "\\|"),
    ),
  );
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  return [
    line(rows[0]),
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...rows.slice(1).map(line),
  ].join("\n");
}

function block(node: PMNode, options: ToMarkdownOptions): string {
  switch (node.type) {
    case "paragraph":
      return inline(node.content, options);
    case "heading": {
      const level = node.attrs?.level;
      const n = typeof level === "number" ? Math.min(Math.max(level, 1), 6) : 1;
      return `${"#".repeat(n)} ${inline(node.content, options)}`;
    }
    case "bulletList":
      return list(node, options, () => "- ");
    case "orderedList": {
      const start = node.attrs?.start;
      const from = typeof start === "number" ? start : 1;
      return list(node, options, (i) => `${from + i}. `);
    }
    case "taskList":
      return list(node, options, (_, item) =>
        item.attrs?.checked === true ? "- [x] " : "- [ ] ",
      );
    case "blockquote":
    case "panel":
      return indent(blocks(node.content, options), "> ").replace(/^$/gm, ">");
    case "codeBlock": {
      const code = (node.content ?? []).map((n) => n.text ?? "").join("");
      const fence = fenceFor(code, 3);
      return `${fence}${attr(node, "language")}\n${code}\n${fence}`;
    }
    case "horizontalRule":
      return "---";
    case "table":
      return table(node, options);
    case "image":
    case "attachment":
      return inline([node], options);
    default:
      return inline(node.content, options);
  }
}

function blocks(
  nodes: PMNode[] | undefined,
  options: ToMarkdownOptions,
): string {
  return (nodes ?? [])
    .map((node) => block(node, options))
    .filter((text, i, all) => text !== "" || all.length === 1)
    .join("\n\n");
}

export function toMarkdown(
  value: PMDoc | unknown,
  options: ToMarkdownOptions = {},
): string {
  return blocks(toDoc(value).content, options).trim();
}
