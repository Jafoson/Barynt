import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listReleaseVersions, readReleaseNotes } from "@/lib/releases";
import { toAppMarkdown } from "@/lib/releases/markdown";

describe("toAppMarkdown", () => {
  const file = [
    "# Barynt 1.0.10",
    "",
    "<!-- Write the highlights here -->",
    "",
    "Big news.",
    "",
    "![Board](assets/1.0.10/board.png)",
    "",
    "<!-- changes:start -->",
    "### New features",
    "- generated",
    "<!-- changes:end -->",
    "",
  ].join("\n");

  test("keeps the hand-written part only, without heading and comments", () => {
    const out = toAppMarkdown(file);
    expect(out).toStartWith("Big news.");
    expect(out).not.toContain("generated");
    expect(out).not.toContain("<!--");
    expect(out).not.toContain("# Barynt");
  });

  test("points relative images at the asset route", () => {
    expect(toAppMarkdown(file)).toContain(
      "![Board](/api/release-assets/1.0.10/board.png)",
    );
    expect(toAppMarkdown("![x](./assets/1.0.10/a.png)")).toBe(
      "![x](/api/release-assets/1.0.10/a.png)",
    );
  });

  test("a nested comment doesn't survive", () => {
    expect(toAppMarkdown("A <!<!-- x -->-- y --> B")).not.toContain("<!--");
  });
});

describe("release notes on disk", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "releases-"));
    await writeFile(
      path.join(dir, "1.0.9.md"),
      "# Barynt 1.0.9\n\nEnglish nine\n",
    );
    await writeFile(
      path.join(dir, "1.0.10.md"),
      "# Barynt 1.0.10\n\nEnglish ten\n",
    );
    await writeFile(
      path.join(dir, "1.0.10.de.md"),
      "# Barynt 1.0.10\n\nDeutsch zehn\n",
    );
    await writeFile(
      path.join(dir, "2.0.0.md"),
      "# Barynt 2.0.0\n\nnot out yet\n",
    );
    await writeFile(path.join(dir, "README.md"), "# Releases\n");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const text = (doc: unknown) => JSON.stringify(doc);

  test("lists versions up to the running one, newest first", async () => {
    expect(await listReleaseVersions("1.0.10", dir)).toEqual([
      "1.0.10",
      "1.0.9",
    ]);
    expect(await listReleaseVersions("0.1.0", dir)).toEqual([]);
  });

  test("a missing folder means no notes", async () => {
    expect(await listReleaseVersions("1.0.10", path.join(dir, "nope"))).toEqual(
      [],
    );
  });

  test("the German file for German, English otherwise and as the fallback", async () => {
    expect(text(await readReleaseNotes("1.0.10", "de", dir))).toContain(
      "Deutsch zehn",
    );
    expect(text(await readReleaseNotes("1.0.10", "en", dir))).toContain(
      "English ten",
    );
    expect(text(await readReleaseNotes("1.0.9", "de", dir))).toContain(
      "English nine",
    );
  });

  test("an unknown or malformed version is null", async () => {
    expect(await readReleaseNotes("9.9.9", "en", dir)).toBeNull();
    expect(await readReleaseNotes("../../etc/passwd", "en", dir)).toBeNull();
  });
});
