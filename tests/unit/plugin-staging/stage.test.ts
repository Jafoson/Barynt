import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// What is read from the plugin directory before an install or an update: the
// manifest that is used has to be one of the files the hash covers. The hash is
// taken before and after the manifest is read, and a plugin whose files changed in
// between is refused. That needs a hash that can be made to differ between two
// calls, so `hashPluginDirectory` is replaced here and this file has its own process
// (`tests/unit/plugins/integrity.test.ts` tests the real one).

const actual = await import("@/lib/plugins/integrity");
const digests: string[] = [];
const mockHash = mock(async (_dir: string) => {
  const digest = digests.shift();
  return digest === undefined
    ? ({ ok: false, issue: "no digest" } as const)
    : ({ ok: true, digest, files: 1 } as never);
});
mock.module("@/lib/plugins/integrity", () => ({
  ...actual,
  hashPluginDirectory: mockHash,
}));

import {
  installedCandidates,
  refuseChange,
  stagePlugin,
  toCandidate,
} from "@/features/plugins/disk";
import { discoverPlugins } from "@/lib/plugins/discovery";

const A = `sha512-${"A".repeat(86)}==`;
const B = `sha512-${"B".repeat(86)}==`;

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-staging-"));
  digests.length = 0;
  mockHash.mockClear();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function write(
  id: string,
  version: string,
  more: Record<string, unknown> = {},
) {
  const dir = join(root, id, version);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "barynt-plugin.json"),
    JSON.stringify({
      manifestVersion: 1,
      id,
      name: id,
      version,
      description: "A test plugin",
      author: "Someone",
      license: "MIT",
      categories: ["other"],
      barynt: "^0.1.0",
      ...more,
    }),
  );
}

const listed = async () => (await discoverPlugins(root)).plugins;

describe("staging a plugin", () => {
  it("gives the manifest and the hash when the files did not change while they were read", async () => {
    await write("calendar", "1.0.0");
    digests.push(A, A);
    const staged = await stagePlugin(await listed(), "calendar", "1.0.0");
    expect(staged).toMatchObject({ ok: true, integrity: A });
    expect(staged.ok && staged.manifest.id).toBe("calendar");
    expect(mockHash).toHaveBeenCalledTimes(2);
  });

  it("is refused when the files are not the same the second time", async () => {
    await write("calendar", "1.0.0");
    digests.push(A, B);
    expect(await stagePlugin(await listed(), "calendar", "1.0.0")).toEqual({
      ok: false,
      error: "The plugin's files changed while they were read.",
    });
  });

  it("is refused when the files cannot be hashed the second time", async () => {
    await write("calendar", "1.0.0");
    digests.push(A);
    expect(await stagePlugin(await listed(), "calendar", "1.0.0")).toEqual({
      ok: false,
      error: "The plugin's files changed while they were read.",
    });
  });

  it("is refused when the files cannot be hashed at all, and says why", async () => {
    await write("calendar", "1.0.0");
    const result = await stagePlugin(await listed(), "calendar", "1.0.0");
    expect(result).toEqual({
      ok: false,
      error: "The plugin's files are not acceptable: no digest.",
    });
    expect(mockHash).toHaveBeenCalledTimes(1);
  });

  it("does not hash anything for a plugin that is not there or has no valid manifest", async () => {
    await write("broken", "1.0.0", { license: 42 });
    const plugins = await listed();
    expect((await stagePlugin(plugins, "nope", "1.0.0")).ok).toBe(false);
    expect((await stagePlugin(plugins, "broken", "1.0.0")).ok).toBe(false);
    expect((await stagePlugin(plugins, "broken", "2.0.0")).ok).toBe(false);
    expect(mockHash).not.toHaveBeenCalled();
  });

  it("picks the version asked for, not another one of the same plugin", async () => {
    await write("calendar", "1.0.0");
    await write("calendar", "1.1.0");
    digests.push(A, A);
    const staged = await stagePlugin(await listed(), "calendar", "1.1.0");
    expect(staged.ok && staged.manifest.version).toBe("1.1.0");
    expect(mockHash.mock.calls[0]?.[0]).toBe(join(root, "calendar", "1.1.0"));
  });
});

describe("the installed plugins as the resolver reads them", () => {
  it("takes where a plugin applies from the row, not from the file", async () => {
    await write("calendar", "1.0.0", { scope: "platform" });
    const candidates = installedCandidates(
      [{ id: "calendar", version: "1.0.0", scope: "WORKSPACE" }],
      await listed(),
    );
    expect(candidates).toEqual([
      {
        id: "calendar",
        version: "1.0.0",
        barynt: "^0.1.0",
        dependencies: {},
        scope: "workspace",
      },
    ]);
  });

  it("leaves out a plugin whose manifest cannot be read, and one in another version", async () => {
    await write("broken", "1.0.0", { license: 42 });
    await write("calendar", "2.0.0");
    const candidates = installedCandidates(
      [
        { id: "broken", version: "1.0.0", scope: "WORKSPACE" },
        { id: "calendar", version: "1.0.0", scope: "WORKSPACE" },
        { id: "gone", version: "1.0.0", scope: "WORKSPACE" },
      ],
      await listed(),
    );
    expect(candidates).toEqual([]);
  });

  it("reads a candidate from a manifest", async () => {
    await write("board", "1.0.0", { dependencies: { notes: "^1" } });
    const found = (await listed())[0];
    if (!found?.ok) throw new Error("not valid");
    expect(toCandidate(found.manifest, "PLATFORM")).toEqual({
      id: "board",
      version: "1.0.0",
      barynt: "^0.1.0",
      dependencies: { notes: "^1" },
      scope: "platform",
    });
  });
});

describe("saying why a change is refused", () => {
  it("says nothing when there is nothing in the way", () => {
    expect(refuseChange({ problems: [], breaks: [] })).toBeNull();
  });

  it("says what is wrong with the plugin itself", () => {
    expect(
      refuseChange({
        problems: [
          { code: "dependency-missing", dependency: "notes", range: "^1" },
        ],
        breaks: [],
      }),
    ).toBe(
      "Not done. The plugin needs the plugin notes (^1), which is not installed.",
    );
  });

  it("says what it would break", () => {
    expect(refuseChange({ problems: [], breaks: ["board", "wiki"] })).toBe(
      "Not done. It would stop board, wiki from loading.",
    );
  });

  it("says both, the plugin's own problems first", () => {
    expect(
      refuseChange({
        problems: [
          { code: "dependency-missing", dependency: "notes", range: "^1" },
          { code: "dependency-unavailable", dependency: "tags" },
        ],
        breaks: ["board"],
      }),
    ).toBe(
      "Not done. The plugin needs the plugin notes (^1), which is not installed; needs tags, which cannot load. It would stop board from loading.",
    );
  });
});
