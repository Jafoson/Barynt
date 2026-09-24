import "server-only";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { errorCode } from "./discovery";
import { INTEGRITY_PREFIX, isIntegrityHash } from "./hashFormat";

// The hash of a plugin's files as they lie on disk. It is computed when a plugin
// is installed and approved, stored in `Plugin.integrity`, and checked again
// before **every** load: what the admin approved is exactly what runs, and a
// file that was changed, added or removed afterwards keeps the plugin from
// loading at all.
//
// It is deliberately strict about what may be in a plugin directory. Only
// regular files and directories: a symlink, a device or a socket anywhere inside
// is refused, because it could make the directory say one thing and load another.
//
// What it does not do: it does not make the code safe, only unchanged. Approved
// code that is malicious is still malicious (docs/plugins/security.md). And a
// file could be swapped between this check and the import; anyone who can write
// to the plugin directory while the app runs can try that.

export { INTEGRITY_PREFIX };

export interface IntegrityLimits {
  maxFiles: number;
  /** Directory levels below the plugin directory. */
  maxDepth: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

/** Generous for a bundled plugin, small enough that a hostile directory cannot make the host hash for minutes. */
export const INTEGRITY_LIMITS: IntegrityLimits = {
  maxFiles: 5000,
  maxDepth: 12,
  maxFileBytes: 32 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
};

export type DirectoryDigest =
  | { ok: true; digest: string; files: number }
  | { ok: false; issue: string };

/** SHA-512 of one file, and how many bytes were read, so a file that changed while being read shows. */
async function hashFile(path: string): Promise<{ hex: string; bytes: number }> {
  const hash = createHash("sha512");
  let bytes = 0;
  for await (const chunk of createReadStream(
    /* turbopackIgnore: true */ path,
  )) {
    const buffer = chunk as Buffer;
    bytes += buffer.length;
    hash.update(buffer);
  }
  return { hex: hash.digest("hex"), bytes };
}

interface Walk {
  lines: { path: string; line: string }[];
  totalBytes: number;
}

/** Returns the first problem it finds, or null. */
async function walk(
  dir: string,
  relative: string,
  depth: number,
  limits: IntegrityLimits,
  state: Walk,
): Promise<string | null> {
  if (depth > limits.maxDepth) {
    return `${relative || "."}: is nested deeper than ${limits.maxDepth} levels`;
  }
  const entries = await readdir(/* turbopackIgnore: true */ dir, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    // The hash lists one file per line, so a name with a line break could forge a line.
    if (/[\r\n]/.test(entry.name)) {
      return `${path}: the name contains a line break`;
    }
    const full = join(/* turbopackIgnore: true */ dir, entry.name);
    if (entry.isSymbolicLink()) return `${path}: is a symlink`;
    if (entry.isDirectory()) {
      const issue = await walk(full, path, depth + 1, limits, state);
      if (issue) return issue;
      continue;
    }
    if (!entry.isFile()) return `${path}: is not a regular file or directory`;

    const info = await lstat(/* turbopackIgnore: true */ full);
    if (!info.isFile()) return `${path}: is not a regular file`;
    if (info.size > limits.maxFileBytes) {
      return `${path}: is larger than ${limits.maxFileBytes} bytes`;
    }
    if (state.lines.length >= limits.maxFiles) {
      return `more than ${limits.maxFiles} files`;
    }
    state.totalBytes += info.size;
    if (state.totalBytes > limits.maxTotalBytes) {
      return `more than ${limits.maxTotalBytes} bytes in total`;
    }
    const { hex, bytes } = await hashFile(full);
    if (bytes !== info.size) return `${path}: changed while it was read`;
    state.lines.push({ path, line: `${hex}  ${info.size}  ${path}\n` });
  }
  return null;
}

/**
 * The hash of every file under `dir`, hidden ones included: one line per file,
 * `<sha512 hex>  <size>  <relative path>`, sorted by path, and the SHA-512 of
 * those lines as `sha512-<base64>`. Content, size, name and place of every file
 * all count; empty directories do not. Never throws.
 */
export async function hashPluginDirectory(
  dir: string,
  limits: IntegrityLimits = INTEGRITY_LIMITS,
): Promise<DirectoryDigest> {
  const state: Walk = { lines: [], totalBytes: 0 };
  try {
    const issue = await walk(dir, "", 0, limits, state);
    if (issue) return { ok: false, issue };
  } catch (error) {
    return { ok: false, issue: `cannot be read (${errorCode(error)})` };
  }
  const sorted = state.lines.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  const digest = createHash("sha512")
    .update(sorted.map((entry) => entry.line).join(""))
    .digest("base64");
  return {
    ok: true,
    digest: `${INTEGRITY_PREFIX}${digest}`,
    files: sorted.length,
  };
}

/**
 * Checks the files on disk against the hash recorded at install. Returns the
 * reason for a refusal, or `null` when they match. A missing or malformed
 * expected hash is a refusal, never a pass: no hash, no load.
 */
export async function verifyPluginIntegrity(
  dir: string,
  expected: string,
  limits: IntegrityLimits = INTEGRITY_LIMITS,
): Promise<string | null> {
  if (!isIntegrityHash(expected)) {
    return "no valid integrity hash is recorded for this plugin";
  }
  const result = await hashPluginDirectory(dir, limits);
  if (!result.ok)
    return `the plugin directory is not acceptable: ${result.issue}`;
  return result.digest === expected
    ? null
    : "the files on disk do not match the hash recorded at install";
}
