import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hashPluginDirectory,
  INTEGRITY_LIMITS,
  INTEGRITY_PREFIX,
  verifyPluginIntegrity,
} from "@/lib/plugins/integrity";

// The hash decides whether a plugin's files are the ones the admin approved, so
// it has to change with every way a directory can change, and it has to refuse
// what could make a directory say one thing and load another. Real temporary
// directories, no database.

let root: string;
let other: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-integrity-"));
  other = await mkdtemp(join(tmpdir(), "barynt-integrity-other-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(other, { recursive: true, force: true });
});

async function put(dir: string, path: string, content: string) {
  const file = join(dir, path);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, content);
}

async function digest(dir = root): Promise<string> {
  const result = await hashPluginDirectory(dir);
  if (!result.ok) throw new Error(`expected a digest: ${result.issue}`);
  return result.digest;
}

async function issue(dir = root, limits = INTEGRITY_LIMITS): Promise<string> {
  const result = await hashPluginDirectory(dir, limits);
  if (result.ok) throw new Error("expected the directory to be refused");
  return result.issue;
}

const sha512 = (text: string, encoding: "hex" | "base64") =>
  createHash("sha512").update(text).digest(encoding);

describe("the hash of a directory", () => {
  it("is the SHA-512 of one line per file, sorted by path", async () => {
    // Worked out by hand here, so the algorithm in the docs is the one that runs.
    await put(root, "sub/b.txt", "world");
    await put(root, "a.txt", "hello");
    const lines =
      `${sha512("hello", "hex")}  5  a.txt\n` +
      `${sha512("world", "hex")}  5  sub/b.txt\n`;
    const result = await hashPluginDirectory(root);
    expect(result).toEqual({
      ok: true,
      digest: `${INTEGRITY_PREFIX}${sha512(lines, "base64")}`,
      files: 2,
    });
  });

  it("looks like sha512-<88 characters of base64>", async () => {
    await put(root, "a.txt", "x");
    expect(await digest()).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/);
  });

  it("does not depend on where the directory is or in what order files were made", async () => {
    await put(root, "b.js", "two");
    await put(root, "a.js", "one");
    await put(root, "lib/z.js", "deep");
    await put(other, "lib/z.js", "deep");
    await put(other, "a.js", "one");
    await put(other, "b.js", "two");
    expect(await digest(root)).toBe(await digest(other));
  });

  it("treats an empty directory as the hash of nothing, and empty subdirectories as nothing", async () => {
    const empty = await digest();
    expect(empty).toBe(`${INTEGRITY_PREFIX}${sha512("", "base64")}`);
    await mkdir(join(root, "empty", "deeper"), { recursive: true });
    expect(await digest()).toBe(empty);
  });

  it("changes with a single byte of content", async () => {
    await put(root, "server.js", "export default {};");
    const before = await digest();
    await put(root, "server.js", "export default {}:");
    expect(await digest()).not.toBe(before);
  });

  it("changes when a file is added, and hidden files count", async () => {
    await put(root, "server.js", "x");
    const before = await digest();
    await put(root, "extra.js", "y");
    const withExtra = await digest();
    expect(withExtra).not.toBe(before);
    await put(root, ".env", "SECRET=1");
    expect(await digest()).not.toBe(withExtra);
  });

  it("changes when a file is removed, renamed or moved", async () => {
    await put(root, "a.js", "same");
    await put(root, "b.js", "other");
    const before = await digest();
    await rename(join(root, "a.js"), join(root, "c.js"));
    const renamed = await digest();
    expect(renamed).not.toBe(before);
    await mkdir(join(root, "sub"));
    await rename(join(root, "c.js"), join(root, "sub", "c.js"));
    expect(await digest()).not.toBe(renamed);
    await rm(join(root, "b.js"));
    expect(await digest()).not.toBe(renamed);
  });

  it("tells apart two files with the same content under different names", async () => {
    await put(root, "a.js", "same");
    await put(other, "b.js", "same");
    expect(await digest(root)).not.toBe(await digest(other));
  });
});

describe("what a plugin directory must not contain", () => {
  it("refuses a symlink to a file, to a directory, and one that stays inside", async () => {
    await put(other, "evil.js", "x");
    await symlink(join(other, "evil.js"), join(root, "link.js"));
    expect(await issue()).toBe("link.js: is a symlink");
    await rm(join(root, "link.js"));

    await symlink(other, join(root, "dir-link"));
    expect(await issue()).toBe("dir-link: is a symlink");
    await rm(join(root, "dir-link"));

    await put(root, "real.js", "x");
    await symlink(join(root, "real.js"), join(root, "inside.js"));
    expect(await issue()).toBe("inside.js: is a symlink");
  });

  it("finds a symlink deep inside", async () => {
    await put(root, "a/b/c.js", "x");
    await symlink(other, join(root, "a", "b", "link"));
    expect(await issue()).toBe("a/b/link: is a symlink");
  });

  it("refuses a file that is not a regular file", async () => {
    const made = Bun.spawnSync(["mkfifo", join(root, "pipe")]);
    if (made.exitCode !== 0) return; // no mkfifo here, nothing to test
    expect(await issue()).toBe("pipe: is not a regular file or directory");
  });

  it("refuses a name with a line break, it could forge a line of the list", async () => {
    await put(root, "a\nb.js", "x");
    expect(await issue()).toContain("the name contains a line break");
  });

  it("refuses too many files", async () => {
    for (const name of ["a", "b", "c"]) await put(root, `${name}.js`, name);
    expect(await issue(root, { ...INTEGRITY_LIMITS, maxFiles: 2 })).toBe(
      "more than 2 files",
    );
  });

  it("refuses nesting that is too deep", async () => {
    await put(root, "a/b/c/d.js", "x");
    expect(await issue(root, { ...INTEGRITY_LIMITS, maxDepth: 2 })).toContain(
      "nested deeper than 2 levels",
    );
  });

  it("refuses a file that is too large, and a total that is too large", async () => {
    await put(root, "big.js", "x".repeat(10));
    expect(await issue(root, { ...INTEGRITY_LIMITS, maxFileBytes: 5 })).toBe(
      "big.js: is larger than 5 bytes",
    );
    await put(root, "other.js", "y".repeat(10));
    expect(
      await issue(root, {
        ...INTEGRITY_LIMITS,
        maxFileBytes: 10,
        maxTotalBytes: 15,
      }),
    ).toBe("more than 15 bytes in total");
  });

  it("does not throw for a directory that does not exist or is a file", async () => {
    expect(await issue(join(root, "nope"))).toBe("cannot be read (ENOENT)");
    await put(root, "afile", "x");
    expect(await issue(join(root, "afile"))).toBe("cannot be read (ENOTDIR)");
  });
});

describe("checking a directory against a recorded hash", () => {
  it("passes when the files are as they were", async () => {
    await put(root, "server.js", "export default {};");
    expect(await verifyPluginIntegrity(root, await digest())).toBeNull();
  });

  it("refuses when a file changed, was added or was removed", async () => {
    await put(root, "server.js", "a");
    const recorded = await digest();
    const mismatch =
      "the files on disk do not match the hash recorded at install";

    await put(root, "server.js", "b");
    expect(await verifyPluginIntegrity(root, recorded)).toBe(mismatch);
    await put(root, "server.js", "a");
    expect(await verifyPluginIntegrity(root, recorded)).toBeNull();

    await put(root, "extra.js", "x");
    expect(await verifyPluginIntegrity(root, recorded)).toBe(mismatch);
    await rm(join(root, "extra.js"));
    await rm(join(root, "server.js"));
    expect(await verifyPluginIntegrity(root, recorded)).toBe(mismatch);
  });

  it.each([
    ["nothing recorded", ""],
    ["text that is no hash", "trust me"],
    ["the wrong prefix", `sha256-${"A".repeat(86)}==`],
    ["a hash of the wrong length", `${INTEGRITY_PREFIX}${"A".repeat(20)}`],
    [
      "a hash with characters outside base64",
      `${INTEGRITY_PREFIX}${"!".repeat(86)}==`,
    ],
    ["not even a string", undefined as unknown as string],
  ])(
    "refuses to pass when %s is recorded: no hash, no load",
    async (_name, recorded) => {
      await put(root, "server.js", "x");
      expect(await verifyPluginIntegrity(root, recorded)).toBe(
        "no valid integrity hash is recorded for this plugin",
      );
    },
  );

  it("refuses a directory with a symlink even if the hash matches what was there before", async () => {
    await put(root, "server.js", "x");
    const recorded = await digest();
    await symlink(other, join(root, "link"));
    expect(await verifyPluginIntegrity(root, recorded)).toBe(
      "the plugin directory is not acceptable: link: is a symlink",
    );
  });

  it("does not put the recorded hash into its message", async () => {
    await put(root, "server.js", "x");
    const recorded = await digest();
    await put(root, "server.js", "y");
    expect(await verifyPluginIntegrity(root, recorded)).not.toContain(
      recorded.slice(INTEGRITY_PREFIX.length, 20),
    );
  });
});
