import { describe, expect, it } from "bun:test";
import {
  issuesOf,
  STORE_PLUGIN_ID,
  sourceFileSchema,
  storeFileSchema,
} from "@/lib/plugins/store/format";

// What a store repository contains. The store's own CI checks the same rules; the
// instance repeats them because it never trusts a clone. Pure logic.

const H = "a".repeat(128);
const version = (more: object = {}) => ({
  version: "1.0.0",
  download: "https://github.com/jane/x/releases/download/v1.0.0/x-1.0.0.tgz",
  sha512: H,
  ...more,
});

describe("store.json", () => {
  const ok = { schemaVersion: 1, id: "barynt-official", name: "Official" };

  it("is accepted with only what it needs, and with the optional parts", () => {
    expect(storeFileSchema.safeParse(ok).success).toBe(true);
    expect(
      storeFileSchema.safeParse({
        ...ok,
        $schema: "./schemas/store.schema.json",
        maintainerKeys: ["ssh-ed25519 AAAA"],
      }).success,
    ).toBe(true);
  });

  it("says that another format needs a newer Barynt", () => {
    const result = storeFileSchema.safeParse({ ...ok, schemaVersion: 2 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(issuesOf(result.error)[0]).toContain("needs a newer Barynt");
    }
  });

  it.each([
    ["an id with capitals", { ...ok, id: "Barynt" }],
    ["an id that starts with a digit", { ...ok, id: "1store" }],
    ["an empty name", { ...ok, name: "" }],
    ["a name that is too long", { ...ok, name: "x".repeat(81) }],
    ["a field it does not know", { ...ok, extra: 1 }],
    ["too many keys", { ...ok, maintainerKeys: Array(21).fill("k") }],
    ["nothing", undefined],
  ])("is refused with %s", (_n, value) => {
    expect(storeFileSchema.safeParse(value).success).toBe(false);
  });
});

describe("source.json", () => {
  const source = (more: object = {}) => ({ versions: [version()], ...more });

  it("is accepted with a version, and with everything a version may carry", () => {
    expect(sourceFileSchema.safeParse(source()).success).toBe(true);
    expect(
      sourceFileSchema.safeParse(
        source({
          repository: "https://github.com/jane/x",
          versions: [
            version({
              released: "2026-09-21",
              changelog: "https://github.com/jane/x/releases/tag/v1.0.0",
              revoked: "found a bug",
            }),
            version({ version: "1.1.0-beta.1+build.5", revoked: true }),
          ],
        }),
      ).success,
    ).toBe(true);
  });

  it.each([
    ["a download that is not https", version({ download: "http://x/y.tgz" })],
    [
      "a download with credentials",
      version({ download: "https://u:p@x.com/y.tgz" }),
    ],
    ["a download that is no URL", version({ download: "y.tgz" })],
    ["a hash in capitals", version({ sha512: H.toUpperCase() })],
    ["a hash that is too short", version({ sha512: "abc" })],
    ["a hash that is not hex", version({ sha512: "z".repeat(128) })],
    ["a version that is not SemVer", version({ version: "1.0" })],
    ["a date that is not a date", version({ released: "yesterday" })],
    ["a changelog that is not https", version({ changelog: "ftp://x/y" })],
    ["revoked as false", version({ revoked: false })],
    ["revoked with an empty reason", version({ revoked: "" })],
    ["a field it does not know", version({ extra: 1 })],
  ])("refuses a version with %s", (_n, entry) => {
    expect(sourceFileSchema.safeParse({ versions: [entry] }).success).toBe(
      false,
    );
  });

  it("refuses a version listed twice and says which", () => {
    const result = sourceFileSchema.safeParse({
      versions: [version(), version()],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(issuesOf(result.error)).toEqual([
        "versions.1.version: version 1.0.0 is listed twice",
      ]);
    }
  });

  it.each([
    ["no versions", { versions: [] }],
    [
      "too many versions",
      {
        versions: Array.from({ length: 201 }, (_, i) =>
          version({ version: `1.0.${i}` }),
        ),
      },
    ],
    [
      "a repository that is not https",
      source({ repository: "git@github.com:a/b" }),
    ],
    ["a field it does not know", source({ extra: 1 })],
  ])("is refused with %s", (_n, value) => {
    expect(sourceFileSchema.safeParse(value).success).toBe(false);
  });

  it("says where a problem is, one line for each", () => {
    const result = sourceFileSchema.safeParse({
      versions: [version({ sha512: "abc", download: "http://x" })],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const lines = issuesOf(result.error);
      expect(lines.some((l) => l.startsWith("versions.0.download:"))).toBe(
        true,
      );
      expect(lines.some((l) => l.startsWith("versions.0.sha512:"))).toBe(true);
    }
  });
});

describe("a plugin id", () => {
  it.each(["notes", "gantt-chart", "a1", "a-b-c"])("accepts %s", (id) => {
    expect(STORE_PLUGIN_ID.test(id)).toBe(true);
  });

  it.each([
    "",
    "a",
    "Notes",
    "1notes",
    "-notes",
    "no tes",
    "../etc",
    "a/b",
    "a".repeat(64),
    "_example",
    ".hidden",
    "notes\n",
  ])("refuses %j", (id) => {
    expect(STORE_PLUGIN_ID.test(id)).toBe(false);
  });
});
