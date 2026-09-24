import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_STORE_ENTRIES,
  MAX_STORE_FILE_BYTES,
  readStoreDirectory,
} from "@/lib/plugins/store/reader";

// A local clone of a store is data written by someone else: it is read with schemas, never
// run, and never trusted. What matters: what is good is read exactly, what is bad is that
// entry's problem and the others carry on, and nothing throws, whatever the clone holds.
// The directories are real.

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-store-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const H = "b".repeat(128);
const manifest = (id: string, more: object = {}) => ({
  manifestVersion: 1,
  id,
  name: id,
  version: "1.0.0",
  description: `The ${id} plugin`,
  author: "Someone",
  license: "MIT",
  categories: ["other"],
  barynt: "^0.1.0",
  ...more,
});
const source = (versions: object[] = [{}], more: object = {}) => ({
  versions: versions.map((v) => ({
    version: "1.0.0",
    download: "https://github.com/x/y/releases/download/v1.0.0/y.tgz",
    sha512: H,
    ...v,
  })),
  ...more,
});

async function store(more: object = {}) {
  await writeFile(
    join(root, "store.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "test-store",
      name: "Test store",
      ...more,
    }),
  );
}
async function entry(
  id: string,
  files: { manifest?: object | string; source?: object | string } = {},
) {
  const dir = join(root, "plugins", id);
  await mkdir(dir, { recursive: true });
  const put = (
    name: string,
    value: object | string | undefined,
    fallback: object,
  ) =>
    writeFile(
      join(dir, name),
      typeof value === "string" ? value : JSON.stringify(value ?? fallback),
    );
  await put("barynt-plugin.json", files.manifest, manifest(id));
  await put("source.json", files.source, source());
}

describe("a store that is fine", () => {
  it("gives the store's name and each entry with its manifest and versions, highest first", async () => {
    await store();
    await entry("notes", {
      manifest: manifest("notes", { version: "1.2.0" }),
      source: source(
        [
          { version: "1.0.0" },
          {
            version: "1.10.0",
            released: "2026-09-20",
            changelog: "https://x.com/c",
          },
          { version: "1.2.0" },
        ],
        { repository: "https://github.com/jane/notes" },
      ),
    });
    const result = await readStoreDirectory(root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.store).toEqual({ id: "test-store", name: "Test store" });
    expect(result.problems).toEqual([]);
    expect(result.entries).toHaveLength(1);
    const notes = result.entries[0];
    expect(notes?.id).toBe("notes");
    expect(notes?.manifest.version).toBe("1.2.0");
    expect(notes?.repository).toBe("https://github.com/jane/notes");
    expect(notes?.versions.map((v) => v.version)).toEqual([
      "1.10.0",
      "1.2.0",
      "1.0.0",
    ]);
    expect(notes?.versions[0]).toEqual({
      version: "1.10.0",
      download: "https://github.com/x/y/releases/download/v1.0.0/y.tgz",
      sha512: H,
      released: "2026-09-20",
      changelog: "https://x.com/c",
      revoked: false,
      revokedReason: null,
    });
  });

  it("marks a revoked version, with the reason when there is one", async () => {
    await store();
    await entry("notes", {
      manifest: manifest("notes", { version: "1.1.0" }),
      source: source([
        { version: "1.0.0", revoked: "found a bug" },
        { version: "1.1.0", revoked: true },
        { version: "1.2.0" },
      ]),
    });
    const result = await readStoreDirectory(root);
    if (!result.ok) throw new Error(result.error);
    const byVersion = Object.fromEntries(
      (result.entries[0]?.versions ?? []).map((v) => [
        v.version,
        [v.revoked, v.revokedReason],
      ]),
    );
    expect(byVersion).toEqual({
      "1.0.0": [true, "found a bug"],
      "1.1.0": [true, null],
      "1.2.0": [false, null],
    });
  });

  it("lists entries by id", async () => {
    await store();
    await entry("zeta");
    await entry("alpha");
    const result = await readStoreDirectory(root);
    if (!result.ok) throw new Error(result.error);
    expect(result.entries.map((e) => e.id)).toEqual(["alpha", "zeta"]);
  });

  it("is an empty store when it has no plugins yet, not an error", async () => {
    await store();
    const result = await readStoreDirectory(root);
    expect(result).toMatchObject({ ok: true, entries: [], problems: [] });
  });

  it("ignores directories that start with an underscore or a dot, without a word", async () => {
    await store();
    await entry("notes");
    await entry("_example");
    await mkdir(join(root, "plugins", ".git"), { recursive: true });
    const result = await readStoreDirectory(root);
    if (!result.ok) throw new Error(result.error);
    expect(result.entries.map((e) => e.id)).toEqual(["notes"]);
    expect(result.problems).toEqual([]);
  });

  it("ignores files beside the entries that are not entries", async () => {
    await store();
    await entry("notes");
    await writeFile(join(root, "plugins", "README.md"), "hello");
    const result = await readStoreDirectory(root);
    if (!result.ok) throw new Error(result.error);
    expect(result.entries).toHaveLength(1);
    expect(result.problems.map((p) => p.id)).toEqual(["README.md"]);
  });
});

describe("a clone that is not a store", () => {
  it("says it has not been fetched yet when the directory is not there", async () => {
    expect(await readStoreDirectory(join(root, "nope"))).toEqual({
      ok: false,
      error: "The store has not been fetched yet.",
    });
  });

  it("says it cannot be read, and why, when something other than a missing directory is wrong", async () => {
    await writeFile(join(root, "afile"), "x");
    expect(await readStoreDirectory(join(root, "afile", "inside"))).toEqual({
      ok: false,
      error: "The store cannot be read (ENOTDIR).",
    });
  });

  it("is refused when the clone is a file, or a symlink", async () => {
    await writeFile(join(root, "afile"), "x");
    expect(await readStoreDirectory(join(root, "afile"))).toEqual({
      ok: false,
      error: "The store is not a directory.",
    });
    await mkdir(join(root, "real"));
    await symlink(join(root, "real"), join(root, "link"));
    expect((await readStoreDirectory(join(root, "link"))).ok).toBe(false);
  });

  it.each([
    ["without store.json", async () => {}, "store.json is missing"],
    [
      "with a store.json that is not JSON",
      async () => writeFile(join(root, "store.json"), "{ nope"),
      "is not valid JSON",
    ],
    [
      "with a store.json of another format",
      async () => store({ schemaVersion: 2 }),
      "needs a newer Barynt",
    ],
    [
      "with a store.json without a name",
      async () =>
        writeFile(
          join(root, "store.json"),
          JSON.stringify({ schemaVersion: 1, id: "x-store" }),
        ),
      "name",
    ],
  ])("says why, %s", async (_n, arrange, reason) => {
    await arrange();
    const result = await readStoreDirectory(root);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Not a store");
      expect(result.error).toContain(reason);
    }
  });

  it("does not follow a store.json that is a symlink", async () => {
    await writeFile(
      join(tmpdir(), "barynt-outside.json"),
      JSON.stringify({ schemaVersion: 1, id: "out-side", name: "Outside" }),
    );
    await symlink(
      join(tmpdir(), "barynt-outside.json"),
      join(root, "store.json"),
    );
    const result = await readStoreDirectory(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("symlink");
    await rm(join(tmpdir(), "barynt-outside.json"), { force: true });
  });

  it("does not read a store.json that is too large", async () => {
    await writeFile(
      join(root, "store.json"),
      "x".repeat(MAX_STORE_FILE_BYTES + 1),
    );
    const result = await readStoreDirectory(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("larger than");
  });
});

describe("an entry that is bad", () => {
  const problemsOf = async () => {
    const result = await readStoreDirectory(root);
    if (!result.ok) throw new Error(result.error);
    return result;
  };

  it("is that entry's problem: the good ones are still listed", async () => {
    await store();
    await entry("good");
    await entry("bad", { source: "{ nope" });
    const result = await problemsOf();
    expect(result.entries.map((e) => e.id)).toEqual(["good"]);
    expect(result.problems).toEqual([
      {
        id: "bad",
        issues: [expect.stringContaining("source.json is not valid JSON")],
      },
    ]);
  });

  it("says which file is missing", async () => {
    await store();
    await mkdir(join(root, "plugins", "empty"), { recursive: true });
    const result = await problemsOf();
    expect(result.problems[0]?.issues).toEqual([
      "barynt-plugin.json is missing",
      "source.json is missing",
    ]);
  });

  it("says what is wrong with the manifest, with the path of each problem", async () => {
    await store();
    await entry("notes", {
      manifest: manifest("notes", { license: 42, categories: [] }),
    });
    const [problem] = (await problemsOf()).problems;
    expect(problem?.id).toBe("notes");
    expect(
      problem?.issues.every((l) => l.startsWith("barynt-plugin.json ")),
    ).toBe(true);
    expect(problem?.issues.some((l) => l.includes("license"))).toBe(true);
  });

  it("says what is wrong with the source, with the path of each problem", async () => {
    await store();
    await entry("notes", {
      source: source([{ sha512: "abc", download: "http://x" }]),
    });
    const [problem] = (await problemsOf()).problems;
    expect(
      problem?.issues.some((l) =>
        l.startsWith("source.json versions.0.sha512:"),
      ),
    ).toBe(true);
    expect(
      problem?.issues.some((l) =>
        l.startsWith("source.json versions.0.download:"),
      ),
    ).toBe(true);
  });

  it("is refused when the manifest names another plugin than the directory does", async () => {
    await store();
    await entry("notes", { manifest: manifest("other-plugin") });
    const [problem] = (await problemsOf()).problems;
    expect(problem?.issues).toEqual([
      'barynt-plugin.json: the id "other-plugin" is not the directory name "notes"',
    ]);
  });

  it("is refused when the source does not list the version the manifest is for", async () => {
    await store();
    await entry("notes", {
      manifest: manifest("notes", { version: "2.0.0" }),
      source: source([{ version: "1.0.0" }]),
    });
    const [problem] = (await problemsOf()).problems;
    expect(problem?.issues).toEqual([
      "source.json does not list the version 2.0.0 that the manifest is for",
    ]);
  });

  it.each(["Notes", "1notes", "a", "no tes", "notes.old"])(
    "is refused for a directory named %j",
    async (name) => {
      await store();
      await mkdir(join(root, "plugins", name), { recursive: true });
      const result = await problemsOf();
      expect(result.entries).toEqual([]);
      expect(result.problems).toEqual([
        { id: name, issues: ["the directory name is not a plugin id"] },
      ]);
    },
  );

  it("is refused when the entry is a symlink, and the target is not read", async () => {
    await store();
    await entry("real-one");
    await symlink(
      join(root, "plugins", "real-one"),
      join(root, "plugins", "linked"),
    );
    const result = await problemsOf();
    expect(result.entries.map((e) => e.id)).toEqual(["real-one"]);
    expect(result.problems).toEqual([
      { id: "linked", issues: ["is a symlink"] },
    ]);
  });

  it("is refused when one of its files is a symlink", async () => {
    await store();
    await entry("notes");
    await rm(join(root, "plugins", "notes", "source.json"));
    await writeFile(
      join(tmpdir(), "barynt-outside-source.json"),
      JSON.stringify(source()),
    );
    await symlink(
      join(tmpdir(), "barynt-outside-source.json"),
      join(root, "plugins", "notes", "source.json"),
    );
    const [problem] = (await problemsOf()).problems;
    expect(problem?.issues).toEqual(["source.json is a symlink"]);
    await rm(join(tmpdir(), "barynt-outside-source.json"), { force: true });
  });

  it("is refused when one of its files is too large", async () => {
    await store();
    await entry("notes", { source: "x".repeat(MAX_STORE_FILE_BYTES + 1) });
    const [problem] = (await problemsOf()).problems;
    expect(problem?.issues[0]).toContain("source.json is larger than");
  });

  it("is refused for a file that has a plugin's name but is not a directory", async () => {
    await store();
    await mkdir(join(root, "plugins"), { recursive: true });
    await writeFile(join(root, "plugins", "readme"), "hello");
    const result = await problemsOf();
    expect(result.entries).toEqual([]);
    expect(result.problems).toEqual([
      { id: "readme", issues: ["is not a directory"] },
    ]);
  });

  it("is refused when a file is a directory", async () => {
    await store();
    await entry("notes");
    await rm(join(root, "plugins", "notes", "source.json"));
    await mkdir(join(root, "plugins", "notes", "source.json"));
    const [problem] = (await problemsOf()).problems;
    expect(problem?.issues).toEqual(["source.json is not a file"]);
  });

  it("does not throw for a file that holds something that is not an object", async () => {
    await store();
    await entry("aa", { manifest: "null", source: "[]" });
    await entry("bb", { manifest: "42", source: '"text"' });
    await entry("cc", { manifest: "﻿{}", source: "" });
    const result = await problemsOf();
    expect(result.entries).toEqual([]);
    expect(result.problems.map((p) => p.id)).toEqual(["aa", "bb", "cc"]);
  });
});

describe("a store with too many entries", () => {
  it("is read up to the limit, and says so", async () => {
    await store();
    await mkdir(join(root, "plugins"), { recursive: true });
    for (let i = 0; i < MAX_STORE_ENTRIES + 3; i++) {
      await mkdir(join(root, "plugins", `p${String(i).padStart(5, "0")}`));
    }
    const result = await readStoreDirectory(root);
    if (!result.ok) throw new Error(result.error);
    expect(result.entries.length + result.problems.length).toBe(
      MAX_STORE_ENTRIES + 1,
    );
    expect(result.problems.at(-1)).toEqual({
      id: "(more)",
      issues: [
        `the store has more than ${MAX_STORE_ENTRIES} entries; the rest is not read`,
      ],
    });
  }, 30000);
});
