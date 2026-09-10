/**
 * ProseMirror documents, as they're stored in the database.
 *
 * Deliberately its own narrow description instead of the types from
 * `@tiptap/pm`: the display (`RichText`) runs server-side and shouldn't
 * even know ProseMirror as a type import. Only the editor pulls in that
 * package.
 */

/** A mark on a text node — bold, italic, link, … */
export interface PMMark {
  type: string;
  attrs?: Record<string, unknown> | null;
}

export interface PMNode {
  type: string;
  attrs?: Record<string, unknown> | null;
  content?: PMNode[];
  marks?: PMMark[];
  /** Only on nodes of type `text`. */
  text?: string;
}

/** Root node. `content` is missing on a freshly cleared document. */
export interface PMDoc {
  type: "doc";
  content?: PMNode[];
}

/**
 * The node types that the editor and the display share knowledge of.
 * Adding one here means touching both sides: the extension in the editor
 * and the branch in `RichText`.
 */
export type ChipNodeType =
  | "mention"
  | "issueLink"
  | "dateChip"
  | "linkChip"
  | "emoji";

/** Attributes of the chips — the display reads them without loading the editor. */
export interface MentionAttrs {
  id: string;
  label: string;
}

export interface IssueLinkAttrs {
  /** Human-readable key, e.g. `ORB-42`. */
  identifier: string;
  /** Internal issue id; can be missing if the issue was deleted. */
  id: string | null;
}

export interface DateChipAttrs {
  /** ISO date without time, e.g. `2026-08-14`. */
  date: string;
}

export interface LinkChipAttrs {
  href: string;
  /** Shown label; falls back to the host name (`hostOf`, `lib/richtext/link.ts`) when empty. */
  label: string;
}

export interface EmojiAttrs {
  /** Short name without colons, e.g. `smile`. */
  name: string;
  /** The character itself — stored alongside so the display needs no lookup table. */
  emoji: string;
}
