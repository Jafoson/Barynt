import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LEFTOVER_MS,
  realDirectory,
  removeLeftovers,
} from "@/lib/plugins/store/workdir";

// The directories inside the plugin directory where fresh things are made: a real directory of
// ours, never a symlink, and what a run that was cut off left behind is cleared when it is old.

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-workdir-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("a directory of ours", () => {
  it("is made when it is not there, with what is above it", async () => {
    const path = join(root, "a", "b", ".staging");
    expect(await realDirectory(path)).toBe(path);
    expect(await readdir(join(root, "a", "b"))).toEqual([".staging"]);
  });

  it("is the same directory when it is there already", async () => {
    const path = join(root, ".stores");
    await mkdir(path);
    await writeFile(join(path, "keep"), "x");
    expect(await realDirectory(path)).toBe(path);
    expect(await readdir(path)).toEqual(["keep"]);
  });

  it("is nothing when a symlink is there, even one to a directory", async () => {
    await mkdir(join(root, "elsewhere"));
    await symlink(join(root, "elsewhere"), join(root, ".stores"));
    expect(await realDirectory(join(root, ".stores"))).toBeNull();
  });

  it("is an error, for the caller to answer, when a file is there", async () => {
    await writeFile(join(root, ".stores"), "x");
    await expect(realDirectory(join(root, ".stores"))).rejects.toThrow();
  });
});

describe("what a run that was cut off left", () => {
  const age = async (path: string, ms: number) => {
    const when = new Date(Date.now() - ms);
    await utimes(path, when, when);
  };

  it("is an hour", () => {
    expect(LEFTOVER_MS).toBe(60 * 60 * 1000);
  });

  it("is removed when it is over an hour old, and only what the caller says is a leftover", async () => {
    for (const name of ["tmp-old", "tmp-recent", "keep-old"]) {
      await mkdir(join(root, name));
      await writeFile(join(root, name, "file"), "x");
    }
    await age(join(root, "tmp-old"), LEFTOVER_MS + 60_000);
    await age(join(root, "tmp-recent"), LEFTOVER_MS - 60_000);
    await age(join(root, "keep-old"), LEFTOVER_MS + 60_000);
    await removeLeftovers(root, (name) => name.startsWith("tmp-"), Date.now());
    expect((await readdir(root)).sort()).toEqual(["keep-old", "tmp-recent"]);
  });

  it("does not throw when there is nothing to look in", async () => {
    await expect(
      removeLeftovers(join(root, "not-there"), () => true, Date.now()),
    ).resolves.toBeUndefined();
    await writeFile(join(root, "file"), "x");
    await expect(
      removeLeftovers(join(root, "file"), () => true, Date.now()),
    ).resolves.toBeUndefined();
  });

  it("does not follow a symlink that is named like a leftover, and leaves what it points to alone", async () => {
    await mkdir(join(root, "target"));
    await writeFile(join(root, "target", "keep"), "x");
    await age(join(root, "target"), 2 * LEFTOVER_MS);
    await symlink(join(root, "target"), join(root, "tmp-link"));
    await removeLeftovers(root, (name) => name.startsWith("tmp-"), Date.now());
    expect(await readdir(join(root, "target"))).toEqual(["keep"]);
  });
});
