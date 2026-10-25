import { describe, expect, test } from "bun:test";
import { fromMarkdown } from "@/lib/richtext/fromMarkdown";
import { toMarkdown } from "@/lib/richtext/toMarkdown";

const roundTrip = (md: string) => toMarkdown(fromMarkdown(md));

describe("toMarkdown", () => {
  test.each([
    "# Title\n\nSome **bold**, *italic*, ~~gone~~ and `code`.",
    "- one\n- two\n\n1. first\n2. second",
    "- [ ] open\n- [x] done",
    "> quoted\n> text",
    "```ts\nconst a = 1;\n```",
    "---",
    "[docs](https://example.com)",
  ])("round-trips %j", (md) => {
    expect(roundTrip(md)).toBe(md);
  });

  test("writes chips as the tokens the API accepts", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "mention", attrs: { id: "u1", label: "Ada Lovelace" } },
            { type: "text", text: " see " },
            { type: "issueLink", attrs: { id: "i1", identifier: "ENG-4" } },
            { type: "text", text: " by " },
            { type: "dateChip", attrs: { date: "2026-08-14" } },
            { type: "text", text: " " },
            { type: "linkChip", attrs: { href: "https://x.dev", label: "x" } },
          ],
        },
      ],
    };
    expect(toMarkdown(doc, { mentionHandle: () => "ada" })).toBe(
      "@ada see #ENG-4 by //2026-08-14 [x|https://x.dev]",
    );
    expect(toMarkdown(doc)).toStartWith("@Ada Lovelace");
  });

  test("empty or foreign input gives an empty string", () => {
    expect(toMarkdown(null)).toBe("");
    expect(toMarkdown({ nope: true })).toBe("");
  });
});
