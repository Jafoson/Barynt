import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fromMarkdown } from "@/lib/richtext/fromMarkdown";
import type { PMDoc } from "@/lib/richtext/types";
import { compareVersions } from "@/scripts/release/notes";
import { toAppMarkdown } from "./markdown";

/**
 * The release notes the app ships with: `releases/<version>.md` (English)
 * and `<version>.de.md` (German), written for the GitHub release
 * (`.github/workflows/release.yml`) and shown again in the app's window
 * (`features/releases`). `releases/` travels with the build
 * (`outputFileTracingIncludes`, `next.config.ts`).
 */

export const RELEASES_DIR = path.join(process.cwd(), "releases");

/** The one shape a version may have — it ends up in a file name. */
export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** Every version with notes up to `upTo` (the running one), newest first.
 *  Notes of a version that isn't out yet stay hidden. */
export async function listReleaseVersions(
  upTo: string,
  dir = RELEASES_DIR,
): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  return names
    .map((name) => name.match(/^(\d+\.\d+\.\d+)\.md$/)?.[1])
    .filter((v): v is string => !!v && compareVersions(v, upTo) <= 0)
    .sort((a, b) => compareVersions(b, a));
}

/** The notes of one version as a document, in the viewer's language when
 *  that file exists, otherwise in English. `null` for an unknown version. */
export async function readReleaseNotes(
  version: string,
  locale: string,
  dir = RELEASES_DIR,
): Promise<PMDoc | null> {
  if (!VERSION_PATTERN.test(version)) return null;
  const candidates = [
    ...(locale === "de" ? [`${version}.de.md`] : []),
    `${version}.md`,
  ];
  for (const name of candidates) {
    try {
      const markdown = await readFile(path.join(dir, name), "utf8");
      return fromMarkdown(toAppMarkdown(markdown));
    } catch {
      // try the next one
    }
  }
  return null;
}
