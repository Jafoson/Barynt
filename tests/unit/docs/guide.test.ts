import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// docs/guide/ is published by barynt-site (Starlight). These checks catch what
// would break there: a page without front matter, a group the sidebar doesn't
// know, a link or image that points nowhere.
const ROOT = resolve(import.meta.dir, "../../../docs/guide");
const groups: Record<string, { en: string; de: string }> = JSON.parse(
  readFileSync(join(ROOT, "_groups.json"), "utf8"),
);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === "assets" ? [] : walk(path);
    return name.endsWith(".md") && name !== "README.md" ? [path] : [];
  });
}
const pages = walk(ROOT).map((path) => {
  const rel = relative(ROOT, path);
  const de = rel.startsWith("de/");
  expect(rel, "pages live in en/ or de/").toMatch(/^(en|de)\//);
  return {
    path,
    rel,
    de,
    inLang: rel.slice(3),
    text: readFileSync(path, "utf8"),
  };
});

const frontMatter = (text: string) =>
  text.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
// Links and images outside code blocks and comments.
const prose = (text: string) =>
  text.replace(/```[\s\S]*?```/g, "").replace(/<!--[\s\S]*?-->/g, "");

describe("docs/guide", () => {
  test("has pages", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  test("every group has an English and a German name", () => {
    for (const [folder, label] of Object.entries(groups)) {
      expect(label.en, folder).toBeTruthy();
      expect(label.de, folder).toBeTruthy();
    }
  });

  for (const page of pages) {
    describe(page.rel, () => {
      test("has a title and a description", () => {
        const fm = frontMatter(page.text);
        expect(fm, "front matter").toBeDefined();
        expect(fm).toMatch(/^title: .+/m);
        expect(fm).toMatch(/^description: .+/m);
      });

      test("sits in a known group", () => {
        const parts = page.inLang.split("/");
        expect(
          parts.length,
          "pages live one folder deep: <group>/<page>.md",
        ).toBe(2);
        expect(Object.keys(groups)).toContain(parts[0]);
      });

      if (page.de) {
        test("has an English original", () => {
          expect(existsSync(join(ROOT, "en", page.inLang))).toBe(true);
        });
      }

      test("links to pages and images that exist", () => {
        const targets = [
          ...prose(page.text).matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g),
        ].map((m) => m[1]);
        for (const target of targets) {
          if (/^(https?:|mailto:|#)/.test(target)) continue;
          const file = target.split("#")[0];
          const exists = (f: string) =>
            existsSync(resolve(dirname(page.path), f));
          // A picture missing in one language may stand in from the other
          // (the site does the same); a warning keeps it from being forgotten.
          const other = file.replace(
            /assets\/(en|de)\//,
            (_, l) => `assets/${l === "en" ? "de" : "en"}/`,
          );
          if (!exists(file) && other !== file && exists(other))
            console.warn(
              `image only in the other language: ${target} in ${page.rel}`,
            );
          else expect(exists(file), `${target} in ${page.rel}`).toBe(true);
        }
      });
    });
  }
});

describe("docs/guide/*/api-reference", () => {
  test("is up to date with the API's reference data (bun run docs:api)", async () => {
    const { generate } = await import("../../../scripts/docs-api/generate");
    const stale = (await generate())
      .filter(
        (file) =>
          !existsSync(join(ROOT, file.path)) ||
          readFileSync(join(ROOT, file.path), "utf8") !== file.text,
      )
      .map((file) => file.path);
    expect(stale, "run `bun run docs:api` and commit the result").toEqual([]);
  }, 30000);
});

// ─── docs/dev ────────────────────────────────────────────────────────────
// Developer docs are read on GitHub, so what has to hold is simple: every
// link points at a file that exists, and a link to a heading in a Markdown
// file points at a heading that is there.

const DEV = resolve(import.meta.dir, "../../../docs/dev");
const REPO = resolve(DEV, "../..");

/** GitHub's anchor for a heading. */
const slug = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[`*]/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");

const anchorsOf = (file: string) =>
  new Set(
    [...prose(readFileSync(file, "utf8")).matchAll(/^#{1,6}\s+(.+)$/gm)].map(
      (m) => slug(m[1]),
    ),
  );

describe("docs/dev", () => {
  const files = readdirSync(DEV).filter((f) => f.endsWith(".md"));

  test("has an index that lists every page", () => {
    const index = readFileSync(join(DEV, "README.md"), "utf8");
    for (const file of files.filter((f) => f !== "README.md"))
      expect(index, `README.md should link ${file}`).toContain(`(${file})`);
  });

  for (const file of files) {
    test(`${file}: links point at files and headings that exist`, () => {
      const path = join(DEV, file);
      const text = prose(readFileSync(path, "utf8"));
      const targets = [...text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)].map(
        (m) => m[1],
      );
      for (const target of targets) {
        if (/^(https?:|mailto:)/.test(target)) continue;
        const [rel, anchor] = target.split("#");
        const dest = rel
          ? resolve(dirname(path), decodeURIComponent(rel))
          : path;
        expect(existsSync(dest), `${target} in docs/dev/${file}`).toBe(true);
        if (anchor && dest.endsWith(".md"))
          expect(
            anchorsOf(dest),
            `#${anchor} in ${relative(REPO, dest)} (linked from docs/dev/${file})`,
          ).toContain(anchor);
      }
    });
  }
});
