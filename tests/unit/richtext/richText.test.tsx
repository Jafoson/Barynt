import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RichText } from "@/components/ui/atoms/RichText/RichText";
import type { PMDoc, PMNode } from "@/lib/richtext/types";

const render = (doc: PMDoc) => renderToStaticMarkup(<RichText value={doc} />);

/** Shortens the test cases: a document from the given blocks. */
const doc = (...content: PMNode[]): PMDoc => ({ type: "doc", content });

/** A paragraph made of a single text node. */
const p = (text: string, marks?: PMNode["marks"]): PMNode => ({
  type: "paragraph",
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
});

describe("RichText", () => {
  test("renders headings at their level", () => {
    expect(
      render(
        doc({
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Eins" }],
        }),
      ),
    ).toContain("<h1>Eins</h1>");

    expect(
      render(
        doc({
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Drei" }],
        }),
      ),
    ).toContain("<h3>Drei</h3>");
  });

  test("clamps nonsensical heading levels to h1–h6", () => {
    const html = render(
      doc({
        type: "heading",
        attrs: { level: 99 },
        content: [{ type: "text", text: "Tief" }],
      }),
    );
    expect(html).toContain("<h6>Tief</h6>");
  });

  test("wraps marks around the text", () => {
    expect(render(doc(p("fett", [{ type: "bold" }])))).toContain(
      "<strong>fett</strong>",
    );
    expect(render(doc(p("kursiv", [{ type: "italic" }])))).toContain(
      "<em>kursiv</em>",
    );
    expect(render(doc(p("weg", [{ type: "strike" }])))).toContain(
      "<del>weg</del>",
    );
    expect(render(doc(p("code", [{ type: "code" }])))).toContain(
      "<code>code</code>",
    );
  });

  test("nests multiple marks inside one another", () => {
    const html = render(
      doc(p("beides", [{ type: "bold" }, { type: "italic" }])),
    );
    expect(html).toContain("<em><strong>beides</strong></em>");
  });

  test("renders both list types", () => {
    const item = (text: string): PMNode => ({
      type: "listItem",
      content: [p(text)],
    });

    expect(
      render(doc({ type: "bulletList", content: [item("a"), item("b")] })),
    ).toContain("<ul><li><p>a</p></li><li><p>b</p></li></ul>");

    expect(
      render(doc({ type: "orderedList", content: [item("a")] })),
    ).toContain("<ol><li><p>a</p></li></ol>");
  });

  test("renders checklists with their state", () => {
    const html = render(
      doc({
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [p("fertig")],
          },
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [p("offen")],
          },
        ],
      }),
    );
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
    // Display only — checking happens in the editor.
    expect(html).toContain("disabled");
  });

  test("renders blockquote, code block, and horizontal rule", () => {
    expect(
      render(doc({ type: "blockquote", content: [p("zitiert")] })),
    ).toContain("<blockquote><p>zitiert</p></blockquote>");

    const code = render(
      doc({
        type: "codeBlock",
        attrs: { language: "ts" },
        content: [{ type: "text", text: "const a = 1" }],
      }),
    );
    expect(code).toContain('data-language="ts"');
    // The code is now split into tokens — checked against the text without
    // markup, so the highlighting doesn't swallow anything.
    expect(textOf(code)).toContain("const a = 1");

    expect(render(doc({ type: "horizontalRule" }))).toContain("<hr/>");
  });

  test("renders the chips with their attributes", () => {
    const html = render(
      doc({
        type: "paragraph",
        content: [
          { type: "mention", attrs: { id: "u1", label: "Anna Weber" } },
          { type: "issueLink", attrs: { id: "i1", identifier: "ORB-42" } },
          { type: "dateChip", attrs: { date: "2026-08-14" } },
          { type: "emoji", attrs: { name: "rocket", emoji: "🚀" } },
        ],
      }),
    );

    expect(html).toContain("@Anna Weber");
    expect(html).toContain("ORB-42");
    expect(html).toContain('href="?issue=ORB-42"');
    // React outputs `dateTime` unchanged; HTML attributes are case-insensitive,
    // so in the browser it's the same attribute.
    expect(html).toContain("<time");
    expect(html).toContain('dateTime="2026-08-14"');
    expect(html).toContain("🚀");
  });

  test("renders panels according to their type", () => {
    const html = render(
      doc({
        type: "panel",
        attrs: { kind: "warning" },
        content: [p("Achtung")],
      }),
    );
    expect(html).toContain('data-kind="warning"');
    expect(html).toContain("<p>Achtung</p>");
  });

  test("renders tables inside a scrolling wrapper", () => {
    const html = render(
      doc({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [p("Kopf")] },
              { type: "tableCell", content: [p("Zelle")] },
            ],
          },
        ],
      }),
    );
    expect(html).toContain("<th><p>Kopf</p></th>");
    expect(html).toContain("<td><p>Zelle</p></td>");
  });

  test("keeps dangerous URLs out of the document", () => {
    const html = render(
      doc(
        p("klick", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
      ),
    );
    // The text stays, the link disappears.
    expect(html).toContain("klick");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a");
  });

  test("lets harmless URLs through and opens them safely", () => {
    const html = render(
      doc(p("hin", [{ type: "link", attrs: { href: "https://example.com" } }])),
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test("discards images with an unsafe source", () => {
    expect(
      render(doc({ type: "image", attrs: { src: "javascript:x", alt: "a" } })),
    ).not.toContain("<img");

    expect(
      render(doc({ type: "image", attrs: { src: "/bild.png", alt: "a" } })),
    ).toContain('src="/bild.png"');
  });

  test("renders an attachment's blob: preview — the create-issue composer's draft image before upload", () => {
    const html = render(
      doc({
        type: "attachment",
        attrs: {
          id: "draft-1",
          url: "blob:https://example.com/deadbeef",
          name: "screenshot.png",
          mimeType: "image/png",
        },
      }),
    );
    expect(html).toContain('src="blob:https://example.com/deadbeef"');
  });

  test("falls back to the removed-attachment placeholder for an unsafe source", () => {
    const html = render(
      doc({
        type: "attachment",
        attrs: {
          id: "draft-1",
          url: "javascript:alert(1)",
          name: "x",
          mimeType: "image/png",
        },
      }),
    );
    expect(html).not.toContain("<img");
  });

  test("survives broken input", () => {
    // Whatever doesn't look like a document becomes an empty document — a
    // single empty paragraph, no crash, and no foreign content.
    for (const bad of [
      null,
      undefined,
      42,
      "kein Doc",
      { type: "paragraph" },
    ]) {
      expect(renderToStaticMarkup(<RichText value={bad} />)).toBe(
        '<div class="richText"><p></p></div>',
      );
    }
    // A `doc` without `content` is valid and stays empty.
    expect(renderToStaticMarkup(<RichText value={{ type: "doc" }} />)).toBe(
      '<div class="richText"></div>',
    );
  });

  test("still shows the content of unknown nodes", () => {
    const html = render(
      doc({ type: "somethingNew", content: [p("bleibt lesbar")] }),
    );
    expect(html).toContain("bleibt lesbar");
  });
});

describe("RichText — Chips", () => {
  const mention = (attrs: Record<string, unknown>) =>
    renderToStaticMarkup(
      <RichText
        value={{
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "mention", attrs }] },
          ],
        }}
      />,
    );

  test("shows an @ before the name for a member", () => {
    const html = mention({ id: "u1", label: "Anna Weber" });
    expect(html).toContain("@");
    expect(html).toContain("Anna Weber");
  });

  test("shows the date in a readable format and keeps the ISO value in the attribute", () => {
    const html = renderToStaticMarkup(
      <RichText
        value={{
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "dateChip", attrs: { date: "2026-08-14" } }],
            },
          ],
        }}
      />,
    );
    expect(html).toContain('dateTime="2026-08-14"');
    // No longer the raw form in the text — the same formatting as in the editor.
    expect(html).not.toMatch(/>2026-08-14</);
    expect(html).toMatch(/2026/);
  });
});

describe("RichText — URL on hover", () => {
  const render = (node: PMNode) =>
    renderToStaticMarkup(
      <RichText
        value={{
          type: "doc",
          content: [{ type: "paragraph", content: [node] }],
        }}
      />,
    );

  test("the inline link carries its URL as the title", () => {
    // Otherwise you can't tell from the word alone where it leads.
    const html = render({
      type: "text",
      text: "hier",
      marks: [{ type: "link", attrs: { href: "https://example.com/tief" } }],
    });
    expect(html).toContain('title="https://example.com/tief"');
  });

  test("the link chip too — it only shows the name after all", () => {
    const html = render({
      type: "linkChip",
      attrs: { href: "https://example.com/a", label: "Mein Link" },
    });
    expect(html).toContain('title="https://example.com/a"');
    expect(html).toContain("Mein Link");
  });

  test("without a valid URL, no title is created either", () => {
    expect(
      render({ type: "linkChip", attrs: { href: "javascript:alert(1)" } }),
    ).not.toContain("javascript:");
  });
});

/** The visible text without markup — entities translated back. */
const textOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&#x27;", "'");

describe("RichText — Codeblock", () => {
  const codeBlock = (text: string, language?: string) =>
    renderToStaticMarkup(
      <RichText
        value={{
          type: "doc",
          content: [
            {
              type: "codeBlock",
              ...(language ? { attrs: { language } } : {}),
              content: [{ type: "text", text }],
            },
          ],
        }}
      />,
    );

  test("names the programming language in the header", () => {
    expect(codeBlock("x", "ts")).toContain("TypeScript");
    expect(codeBlock("x", "py")).toContain("Python");
    // Found via an alternate spelling.
    expect(codeBlock("x", "golang")).toContain("Go");
  });

  test("passes an unknown language through instead of discarding it", () => {
    // It may have come from pasted Markdown — the information is worth more
    // than a clean list.
    expect(codeBlock("x", "brainfuck")).toContain("brainfuck");
  });

  test("simply calls it Plain when nothing is specified", () => {
    expect(codeBlock("x")).toContain("Plain");
  });

  test("gives each line its own element for the line number", () => {
    const html = codeBlock("eins\nzwei\ndrei");
    expect(html.match(/class="codeLine"/g)).toHaveLength(3);
  });

  test("does not count a trailing line break as another line", () => {
    // Otherwise there'd be an empty line number under the last character.
    expect(codeBlock("eins\nzwei\n").match(/class="codeLine"/g)).toHaveLength(
      2,
    );
  });

  test("keeps line numbers out of the text", () => {
    // They live in CSS (`::before`) — otherwise they'd get copied along with
    // the code. Checked against the plain text: nothing may appear there but
    // the code itself.
    const html = codeBlock("eins\nzwei\ndrei", "ts");
    expect(textOf(html)).toContain("einszweidrei");
    expect(textOf(html)).not.toMatch(/1.*2.*3/);
  });

  test("applies coloring without changing the code", () => {
    const quelle = 'const a = "hallo" // hi';
    const html = codeBlock(quelle, "ts");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("hljs-string");
    expect(html).toContain("hljs-comment");
    // The crucial part: the text stays the same character for character.
    expect(textOf(html)).toContain(quelle);
  });
});
