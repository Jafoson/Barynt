import { describe, expect, test } from "bun:test";
import {
  bumpFor,
  CHANGES_END,
  CHANGES_START,
  type Commit,
  mergeReleaseFile,
  nextVersion,
  type ParsedCommit,
  parseCommit,
  renderChanges,
  renderReleaseBody,
  rewriteImagePaths,
  unescapeInput,
  withHighlights,
} from "@/scripts/release/notes";

const commit = (subject: string, body = ""): Commit => ({
  sha: "a".repeat(40),
  subject,
  body,
});
const parsed = (subject: string, body = "") =>
  parseCommit(commit(subject, body));

describe("parseCommit", () => {
  test("type, scope, summary", () => {
    expect(parsed("feat(board): swimlanes (BARY-173)")).toMatchObject({
      type: "feat",
      scope: "board",
      breaking: false,
      summary: "swimlanes (BARY-173)",
    });
  });

  test("breaking by ! or by footer", () => {
    expect(parsed("feat(api)!: drop v0").breaking).toBe(true);
    expect(parsed("fix: x", "BREAKING CHANGE: gone").breaking).toBe(true);
  });

  test("anything else is `other`", () => {
    expect(parsed("5 Updates: @prisma/client +2")).toMatchObject({
      type: "other",
      summary: "5 Updates: @prisma/client +2",
    });
  });
});

describe("bumpFor / nextVersion", () => {
  const bump = (subjects: string[], current: string) =>
    bumpFor(
      subjects.map((s) => parsed(s)),
      current,
    );

  test("fix → patch, feat → minor, breaking → major (from 1.0)", () => {
    expect(bump(["fix: a"], "1.2.3")).toBe("patch");
    expect(bump(["fix: a", "feat: b"], "1.2.3")).toBe("minor");
    expect(bump(["feat: b", "fix!: c"], "1.2.3")).toBe("major");
  });

  test("below 1.0 a breaking change only bumps the minor", () => {
    expect(bump(["feat!: a"], "0.4.1")).toBe("minor");
    expect(bump(["fix: a"], "0.4.1")).toBe("patch");
  });

  test("chore, docs and unconventional commits release nothing", () => {
    expect(
      bump(["chore: deps", "docs: x", "5 Updates: y"], "0.1.0"),
    ).toBeNull();
  });

  test("nextVersion", () => {
    expect(nextVersion("0.1.9", "patch")).toBe("0.1.10");
    expect(nextVersion("0.1.9", "minor")).toBe("0.2.0");
    expect(nextVersion("1.4.2", "major")).toBe("2.0.0");
  });
});

describe("renderChanges", () => {
  const ctx = (commits: ParsedCommit[]) => ({
    lang: "en" as const,
    repo: "o/r",
    version: "0.2.0",
    previous: "0.1.0" as string | null,
    commits,
  });

  test("groups by type and names the previous version", () => {
    const text = renderChanges(
      ctx([parsed("feat(a): one"), parsed("fix: two"), parsed("chore: three")]),
    );
    expect(text).toContain("### New features");
    expect(text).toContain("**a:** one");
    expect(text).toContain("### Fixes");
    expect(text).toContain("Maintenance (1)");
    expect(text).toContain(
      "[v0.1.0](https://github.com/o/r/releases/tag/v0.1.0)",
    );
    expect(text).toContain("compare/v0.1.0...v0.2.0");
  });

  test("German headings", () => {
    const text = renderChanges({ ...ctx([parsed("feat: x")]), lang: "de" });
    expect(text).toContain("### Neue Funktionen");
    expect(text).toContain("Vorherige Version");
  });

  test("a long list is folded", () => {
    const many = Array.from({ length: 13 }, (_, i) => parsed(`feat: n${i}`));
    expect(renderChanges(ctx(many))).toContain("All changes (13)");
  });

  test("the first release has no list", () => {
    expect(renderChanges({ ...ctx([]), previous: null })).toBe(
      "First release.",
    );
  });
});

describe("mergeReleaseFile", () => {
  const ctx = (version: string, commits: ParsedCommit[]) => ({
    lang: "en" as const,
    repo: "o/r",
    version,
    previous: "0.1.0",
    commits,
  });

  test("a new file has a heading, a hint and the block", () => {
    const file = mergeReleaseFile(null, ctx("0.2.0", [parsed("feat: x")]));
    expect(file).toStartWith("# Barynt 0.2.0\n");
    expect(file).toContain(CHANGES_START);
    expect(file).toContain(CHANGES_END);
  });

  test("a re-run only rewrites the block, the prose stays", () => {
    const first = mergeReleaseFile(null, ctx("0.2.0", [parsed("feat: x")]));
    const edited = first.replace(
      /<!-- Write[\s\S]*?-->/,
      "Big news.\n\n![shot](assets/0.2.0/a.png)",
    );
    const again = mergeReleaseFile(
      edited,
      ctx("0.2.0", [parsed("feat: x"), parsed("fix: y")]),
    );
    expect(again).toContain("Big news.");
    expect(again).toContain("![shot](assets/0.2.0/a.png)");
    expect(again).toContain("### Fixes");
  });

  test("a bumped version renames heading and image paths", () => {
    const edited = "# Barynt 0.1.1\n\n![s](assets/0.1.1/a.png)\n\nx\n";
    const moved = mergeReleaseFile(
      edited,
      ctx("0.2.0", [parsed("feat: x")]),
      "0.1.1",
    );
    expect(moved).toContain("# Barynt 0.2.0");
    expect(moved).toContain("assets/0.2.0/a.png");
    expect(moved).not.toContain("0.1.1");
  });

  test("a file without markers gets the block appended, nothing lost", () => {
    const out = mergeReleaseFile(
      "# Barynt 0.2.0\n\nMy text\n",
      ctx("0.2.0", [parsed("feat: x")]),
    );
    expect(out).toContain("My text");
    expect(out).toContain(CHANGES_START);
  });
});

describe("release body", () => {
  test("relative image paths point at the tag's raw files", () => {
    const md =
      '![a](assets/1.0.0/a.png) <img src="./assets/1.0.0/b.png" width="300"> ![ext](https://x.dev/c.png)';
    const out = rewriteImagePaths(md, "o/r", "v1.0.0");
    expect(out).toContain(
      "(https://raw.githubusercontent.com/o/r/v1.0.0/releases/assets/1.0.0/a.png)",
    );
    expect(out).toContain(
      'src="https://raw.githubusercontent.com/o/r/v1.0.0/releases/assets/1.0.0/b.png"',
    );
    expect(out).toContain("(https://x.dev/c.png)");
  });

  test("English first, German folded below; heading, hint and markers gone", () => {
    const en = `# Barynt 1.0.0\n\n<!-- hint -->\n\nHello\n\n${CHANGES_START}\n### Fixes\n${CHANGES_END}\n`;
    const de = `# Barynt 1.0.0\n\nHallo\n`;
    const out = renderReleaseBody({ en, de, repo: "o/r", tag: "v1.0.0" });
    expect(out).toStartWith("Hello");
    expect(out).toContain("<summary>Deutsch</summary>");
    expect(out).toContain("Hallo");
    expect(out).not.toContain("hint");
    expect(out).not.toContain("changes:");
    expect(out).not.toContain("# Barynt");
  });

  test("without a German file the body is just the English one", () => {
    const out = renderReleaseBody({
      en: "# B 1.0.0\n\nHello\n",
      de: null,
      repo: "o/r",
      tag: "v1.0.0",
    });
    expect(out).toBe("Hello\n");
  });
});

describe("withHighlights", () => {
  const fresh = mergeReleaseFile(null, {
    lang: "en",
    repo: "o/r",
    version: "0.2.0",
    previous: "0.1.0",
    commits: [parsed("feat: x")],
  });

  test("replaces the template hint", () => {
    const out = withHighlights(fresh, "Big news.");
    expect(out).toContain("Big news.");
    expect(out).not.toContain("Write the highlights");
    expect(out).toContain(CHANGES_START);
  });

  test("goes above existing prose when the hint is gone", () => {
    const out = withHighlights("# Barynt 0.2.0\n\nOld prose\n", "New text");
    expect(out.indexOf("New text")).toBeLessThan(out.indexOf("Old prose"));
    expect(out).toStartWith("# Barynt 0.2.0");
  });

  test("empty input leaves the file alone", () => {
    expect(withHighlights(fresh, "  ")).toBe(fresh);
  });

  test("\\n in a one-line input becomes a line break", () => {
    expect(unescapeInput("Line one\\n\\n- a\\n- b")).toBe(
      "Line one\n\n- a\n- b",
    );
  });
});
