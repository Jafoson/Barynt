import { describe, expect, test } from "bun:test";
import { fromMarkdown } from "@/lib/richtext/fromMarkdown";
import type { PMNode } from "@/lib/richtext/types";

/**
 * The conversion that both the seed and the one-off migration of existing
 * data run through. Tested against the same constructs the retired Markdown
 * editor could produce — whatever people wrote before has to still be there
 * afterwards.
 */

const blocks = (source: string): PMNode[] => fromMarkdown(source).content ?? [];
const first = (source: string): PMNode => blocks(source)[0];

/** Collects the text of a subtree, without the marks. */
function text(node: PMNode): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(text).join("");
}

describe("fromMarkdown", () => {
  test("turns empty text into an empty document with one paragraph", () => {
    expect(fromMarkdown("")).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
    expect(fromMarkdown("   \n  ")).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });

  test("recognizes headings by the number of hashes", () => {
    expect(first("# Eins")).toMatchObject({
      type: "heading",
      attrs: { level: 1 },
    });
    expect(first("### Drei")).toMatchObject({
      type: "heading",
      attrs: { level: 3 },
    });
    // Without a space it's not a heading, just text.
    expect(first("#kein Titel")).toMatchObject({ type: "paragraph" });
  });

  test("recognizes the marks within a paragraph", () => {
    const marks = (source: string) =>
      (first(source).content ?? []).flatMap((n) =>
        (n.marks ?? []).map((m) => m.type),
      );

    expect(marks("Ein **fetter** Text")).toContain("bold");
    expect(marks("Ein __fetter__ Text")).toContain("bold");
    expect(marks("Ein *kursiver* Text")).toContain("italic");
    expect(marks("Ein _kursiver_ Text")).toContain("italic");
    expect(marks("Ein ~~alter~~ Text")).toContain("strike");
    expect(marks("Ein `Code` Text")).toContain("code");
  });

  test("nests marks inside one another", () => {
    const node = first("**fett und *kursiv* zugleich**");
    const nested = (node.content ?? []).find((n) =>
      (n.marks ?? []).some((m) => m.type === "italic"),
    );
    expect(nested?.marks?.map((m) => m.type).sort()).toEqual([
      "bold",
      "italic",
    ]);
  });

  test("turns single line breaks into hard line breaks", () => {
    // The old renderer made them visible via `pre-wrap`.
    const node = first("Erste Zeile\nZweite Zeile");
    expect(node.content?.some((n) => n.type === "hardBreak")).toBe(true);
    expect(blocks("Erste\n\nZweite")).toHaveLength(2);
  });

  test("recognizes both list types", () => {
    expect(first("- eins\n- zwei")).toMatchObject({ type: "bulletList" });
    expect(first("1. eins\n2. zwei")).toMatchObject({ type: "orderedList" });
    expect(first("- eins\n- zwei").content).toHaveLength(2);
  });

  test("recognizes checklists along with their state", () => {
    const list = first("- [ ] offen\n- [x] erledigt");
    expect(list.type).toBe("taskList");
    expect(list.content?.[0]).toMatchObject({ attrs: { checked: false } });
    expect(list.content?.[1]).toMatchObject({ attrs: { checked: true } });
    expect(text(list)).toBe("offenerledigt");
  });

  test("distinguishes a checklist from a plain bullet list", () => {
    const result = blocks("- normal\n- [ ] eine Aufgabe");
    expect(result.map((b) => b.type)).toEqual(["bulletList", "taskList"]);
  });

  test("recognizes blockquote, code block, and horizontal rule", () => {
    expect(first("> zitiert")).toMatchObject({ type: "blockquote" });

    const code = first("```ts\nconst a = 1\n```");
    expect(code).toMatchObject({
      type: "codeBlock",
      attrs: { language: "ts" },
    });
    expect(text(code)).toBe("const a = 1");

    expect(first("---")).toMatchObject({ type: "horizontalRule" });
  });

  test("turns links into a text node with a link mark", () => {
    const node = first("[Orbit](https://example.com)");
    const link = node.content?.[0];
    expect(link?.marks?.[0]).toMatchObject({
      type: "link",
      attrs: { href: "https://example.com" },
    });
    expect(text(node)).toBe("Orbit");
  });

  test("recognizes bare URLs", () => {
    const node = first("Siehe https://example.com dort");
    expect(
      node.content?.some((n) => (n.marks ?? []).some((m) => m.type === "link")),
    ).toBe(true);
  });

  test("a bare URL doesn't swallow a following ]", () => {
    // Same reasoning as the existing `()` exclusion: a URL directly
    // followed by a closing bracket (e.g. `features/api-v1/richtext.ts`'s
    // `[label|url]` syntax, or an ordinary citation-style "See https://x
    // [1]") must stop at the bracket, not fold it into the href.
    const node = first("Siehe [Text|https://example.com] dort");
    const linked = node.content?.find((n) =>
      (n.marks ?? []).some((m) => m.type === "link"),
    );
    expect(linked?.marks?.[0]?.attrs?.href).toBe("https://example.com");
    expect(text(node)).toContain("]");
  });

  test("turns images into their own node", () => {
    const node = first("![Alt-Text](/bild.png)");
    expect(node.content?.[0]).toMatchObject({
      type: "image",
      attrs: { src: "/bild.png", alt: "Alt-Text" },
    });
  });

  test("leaves dangerous URLs as plain text", () => {
    const node = first("[klick](javascript:alert(1))");
    // No link mark, no image — just the original text.
    expect(node.content?.some((n) => (n.marks ?? []).length > 0)).toBe(false);
    expect(text(node)).toContain("klick");
  });

  test("separates consecutive blocks without a blank line", () => {
    const result = blocks("# Titel\n- eins\n> zitat");
    expect(result.map((b) => b.type)).toEqual([
      "heading",
      "bulletList",
      "blockquote",
    ]);
  });

  test("creates paragraphs without an empty content array", () => {
    // ProseMirror rejects `content: []` — an empty paragraph has no field at all.
    const node = fromMarkdown("");
    expect(node.content?.[0]).not.toHaveProperty("content");
  });
});
