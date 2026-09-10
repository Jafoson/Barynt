import { beforeEach, describe, expect, it, mock } from "bun:test";

// ── Mocks ─────────────────────────────────────────────────────────────────────
//
// Mocks `@/lib/db` directly, so this runs in its own `bun test` invocation
// — same reasoning as `route.test.ts`'s own file comment (CLAUDE.md's
// testing section on Bun 1.3's shared module cache within one process).

const mockWorkspaceMemberFindMany = mock();
const mockProjectFindMany = mock();
const mockIssueFindMany = mock();

mock.module("@/lib/db", () => ({
  db: {
    workspaceMember: { findMany: mockWorkspaceMemberFindMany },
    project: { findMany: mockProjectFindMany },
    issue: { findMany: mockIssueFindMany },
  },
}));

import { richTextFromApiMarkdown } from "@/features/api-v1/richtext";
import type { PMDoc } from "@/lib/richtext/types";

function reset() {
  mockWorkspaceMemberFindMany.mockReset().mockResolvedValue([]);
  mockProjectFindMany.mockReset().mockResolvedValue([]);
  mockIssueFindMany.mockReset().mockResolvedValue([]);
}

const firstParagraphNodes = (result: PMDoc) =>
  result.content?.[0]?.content ?? [];

describe("richTextFromApiMarkdown", () => {
  beforeEach(reset);

  it("returns a plain document unchanged when there's no special token", async () => {
    const result = await richTextFromApiMarkdown(
      "Just a normal sentence.",
      "ws-1",
    );
    expect(firstParagraphNodes(result)).toEqual([
      { type: "text", text: "Just a normal sentence." },
    ]);
    expect(mockWorkspaceMemberFindMany).not.toHaveBeenCalled();
    expect(mockProjectFindMany).not.toHaveBeenCalled();
  });

  it("turns a known @handle into a mention chip", async () => {
    mockWorkspaceMemberFindMany.mockResolvedValue([
      {
        user: {
          id: "u-1",
          handle: "jkoehler",
          firstName: "Jan",
          lastName: "Köhler",
        },
      },
    ]);

    const result = await richTextFromApiMarkdown(
      "Hey @jkoehler, take a look.",
      "ws-1",
    );

    expect(mockWorkspaceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-1", user: { handle: { in: ["jkoehler"] } } },
      }),
    );
    expect(firstParagraphNodes(result)).toEqual([
      { type: "text", text: "Hey " },
      { type: "mention", attrs: { id: "u-1", label: "Jan Köhler" } },
      { type: "text", text: ", take a look." },
    ]);
  });

  it("leaves an unknown @handle as plain text", async () => {
    mockWorkspaceMemberFindMany.mockResolvedValue([]);

    const result = await richTextFromApiMarkdown(
      "Hey @nobody, anyone there?",
      "ws-1",
    );

    expect(firstParagraphNodes(result)).toEqual([
      { type: "text", text: "Hey @nobody, anyone there?" },
    ]);
  });

  it("turns a known #PREFIX-123 ref into an issueLink chip, case-insensitively", async () => {
    mockProjectFindMany.mockResolvedValue([{ id: "p-1", prefix: "PAM" }]);
    mockIssueFindMany.mockResolvedValue([
      { id: "i-1", key: 13, projectId: "p-1" },
    ]);

    const result = await richTextFromApiMarkdown(
      "See #pam-13 for context.",
      "ws-1",
    );

    expect(mockProjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-1", prefix: { in: ["PAM"] } },
      }),
    );
    expect(firstParagraphNodes(result)).toEqual([
      { type: "text", text: "See " },
      { type: "issueLink", attrs: { id: "i-1", identifier: "PAM-13" } },
      { type: "text", text: " for context." },
    ]);
  });

  it("leaves a ref from a different workspace's project as plain text", async () => {
    // The prefix exists, but not in this workspace — `project.findMany` is
    // already scoped by `workspaceId`, so a foreign project just doesn't
    // come back.
    mockProjectFindMany.mockResolvedValue([]);

    const result = await richTextFromApiMarkdown(
      "See #PAM-13 for context.",
      "ws-2",
    );

    expect(firstParagraphNodes(result)).toEqual([
      { type: "text", text: "See #PAM-13 for context." },
    ]);
    expect(mockIssueFindMany).not.toHaveBeenCalled();
  });

  it("resolves a mention and an issue link in the same text node", async () => {
    mockWorkspaceMemberFindMany.mockResolvedValue([
      {
        user: {
          id: "u-1",
          handle: "jkoehler",
          firstName: "Jan",
          lastName: "Köhler",
        },
      },
    ]);
    mockProjectFindMany.mockResolvedValue([{ id: "p-1", prefix: "PAM" }]);
    mockIssueFindMany.mockResolvedValue([
      { id: "i-1", key: 13, projectId: "p-1" },
    ]);

    const result = await richTextFromApiMarkdown(
      "@jkoehler can you check #PAM-13?",
      "ws-1",
    );

    expect(firstParagraphNodes(result)).toEqual([
      { type: "mention", attrs: { id: "u-1", label: "Jan Köhler" } },
      { type: "text", text: " can you check " },
      { type: "issueLink", attrs: { id: "i-1", identifier: "PAM-13" } },
      { type: "text", text: "?" },
    ]);
  });

  it("never looks up @/# inside inline code", async () => {
    const result = await richTextFromApiMarkdown(
      "Run `@jkoehler #PAM-13` literally.",
      "ws-1",
    );

    expect(firstParagraphNodes(result)).toEqual([
      { type: "text", text: "Run " },
      { type: "text", text: "@jkoehler #PAM-13", marks: [{ type: "code" }] },
      { type: "text", text: " literally." },
    ]);
    expect(mockWorkspaceMemberFindMany).not.toHaveBeenCalled();
    expect(mockProjectFindMany).not.toHaveBeenCalled();
  });

  it("never looks up @/# inside a fenced code block", async () => {
    const result = await richTextFromApiMarkdown(
      "```\n@jkoehler #PAM-13\n```",
      "ws-1",
    );

    expect(result.content?.[0]).toMatchObject({ type: "codeBlock" });
    expect(mockWorkspaceMemberFindMany).not.toHaveBeenCalled();
    expect(mockProjectFindMany).not.toHaveBeenCalled();
  });

  it("preserves marks on the text surrounding a resolved chip", async () => {
    mockWorkspaceMemberFindMany.mockResolvedValue([
      {
        user: {
          id: "u-1",
          handle: "jkoehler",
          firstName: "Jan",
          lastName: "Köhler",
        },
      },
    ]);

    const result = await richTextFromApiMarkdown(
      "**cc @jkoehler please**",
      "ws-1",
    );

    expect(firstParagraphNodes(result)).toEqual([
      { type: "text", text: "cc ", marks: [{ type: "bold" }] },
      { type: "mention", attrs: { id: "u-1", label: "Jan Köhler" } },
      { type: "text", text: " please", marks: [{ type: "bold" }] },
    ]);
  });

  it("turns a known //date into a dateChip, ISO and day-first alike", async () => {
    const iso = await richTextFromApiMarkdown(
      "Due //2026-08-14 sharp.",
      "ws-1",
    );
    expect(firstParagraphNodes(iso)).toEqual([
      { type: "text", text: "Due " },
      { type: "dateChip", attrs: { date: "2026-08-14" } },
      { type: "text", text: " sharp." },
    ]);

    const dayFirst = await richTextFromApiMarkdown(
      "Due //14.8.2026 soon.",
      "ws-1",
    );
    expect(firstParagraphNodes(dayFirst)).toEqual([
      { type: "text", text: "Due " },
      { type: "dateChip", attrs: { date: "2026-08-14" } },
      { type: "text", text: " soon." },
    ]);
  });

  it("strips a sentence-ending period a date chip would otherwise reject", async () => {
    // "//2026-8-4." — short enough that the trailing "." is captured
    // alongside it, which breaks the (dot-free) ISO form on the first
    // try; `resolveDate` retries with the dot stripped.
    const result = await richTextFromApiMarkdown(
      "Due //2026-8-4. Thanks!",
      "ws-1",
    );
    expect(firstParagraphNodes(result)).toEqual([
      { type: "text", text: "Due " },
      { type: "dateChip", attrs: { date: "2026-08-04" } },
      { type: "text", text: " Thanks!" },
    ]);
  });

  it("leaves an invalid //date as plain text", async () => {
    const result = await richTextFromApiMarkdown(
      "See //not-a-date here.",
      "ws-1",
    );
    expect(firstParagraphNodes(result)).toEqual([
      { type: "text", text: "See //not-a-date here." },
    ]);
  });

  it("turns [label|url] into a linkChip, and bare [url] into one with an empty label", async () => {
    const labeled = await richTextFromApiMarkdown(
      "See [our docs|https://example.com/docs] for more.",
      "ws-1",
    );
    expect(firstParagraphNodes(labeled)).toEqual([
      { type: "text", text: "See " },
      {
        type: "linkChip",
        attrs: { href: "https://example.com/docs", label: "our docs" },
      },
      { type: "text", text: " for more." },
    ]);

    const bare = await richTextFromApiMarkdown(
      "See [https://example.com].",
      "ws-1",
    );
    expect(firstParagraphNodes(bare)).toEqual([
      { type: "text", text: "See " },
      { type: "linkChip", attrs: { href: "https://example.com", label: "" } },
      { type: "text", text: "." },
    ]);
  });

  it("accepts mailto: but leaves an unrecognized scheme's bracket as plain text", async () => {
    const mailto = await richTextFromApiMarkdown(
      "Reach [support|mailto:help@example.com] anytime.",
      "ws-1",
    );
    expect(firstParagraphNodes(mailto)).toEqual([
      { type: "text", text: "Reach " },
      {
        type: "linkChip",
        attrs: { href: "mailto:help@example.com", label: "support" },
      },
      { type: "text", text: " anytime." },
    ]);

    const result = await richTextFromApiMarkdown(
      "Not a link: [just a note].",
      "ws-1",
    );
    expect(firstParagraphNodes(result)).toEqual([
      { type: "text", text: "Not a link: [just a note]." },
    ]);
  });

  it("never turns a bare URL's trailing ] into part of the link mark", async () => {
    // Regression: `fromMarkdown`'s bare-URL rule used to swallow a `]`
    // directly following the URL, which broke `[label|url]` — the `url`
    // half is extracted before `fromMarkdown` ever runs, but this also
    // guards the underlying `fromMarkdown` fix.
    const result = await richTextFromApiMarkdown(
      "See [https://example.com] here.",
      "ws-1",
    );
    expect(firstParagraphNodes(result)).toEqual([
      { type: "text", text: "See " },
      { type: "linkChip", attrs: { href: "https://example.com", label: "" } },
      { type: "text", text: " here." },
    ]);
  });

  it("reverts a [label|url] bracket wrapped in inline code to its original text", async () => {
    // The bracket is only extracted from *outside* any code span in
    // spirit — in practice extraction runs on the raw string before
    // `fromMarkdown` knows where the code spans are, so this exercises
    // the `revertStrayPlaceholders` safety net: the placeholder lands
    // inside the resulting `code`-marked text node, is left alone by the
    // main rewrite (same as `@`/`#` there), and is swapped back to the
    // exact original bracket text rather than leaking as a raw
    // placeholder.
    const result = await richTextFromApiMarkdown(
      "Try `[label|https://example.com]` literally.",
      "ws-1",
    );
    expect(firstParagraphNodes(result)).toEqual([
      { type: "text", text: "Try " },
      {
        type: "text",
        text: "[label|https://example.com]",
        marks: [{ type: "code" }],
      },
      { type: "text", text: " literally." },
    ]);
  });

  it("never looks up a token inside a mark that's already a link", async () => {
    const result = await richTextFromApiMarkdown(
      "https://example.com/@jkoehler",
      "ws-1",
    );
    expect(firstParagraphNodes(result)).toEqual([
      {
        type: "text",
        text: "https://example.com/@jkoehler",
        marks: [
          { type: "link", attrs: { href: "https://example.com/@jkoehler" } },
        ],
      },
    ]);
    expect(mockWorkspaceMemberFindMany).not.toHaveBeenCalled();
  });
});
