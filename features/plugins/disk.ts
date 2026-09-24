import "server-only";
import {
  type DiscoveredPlugin,
  discoverPlugins,
  pluginsDirSetting,
} from "@/lib/plugins/discovery";
import { hashPluginDirectory } from "@/lib/plugins/integrity";
import type { PluginManifest } from "@/lib/plugins/manifest";
import {
  type ChangePreview,
  describeProblem,
  type PluginCandidate,
} from "@/lib/plugins/resolve";
import { manifestScopeOf, type PluginRowScope } from "@/lib/plugins/scope";

// What lies in the plugin directory, for the actions that install and update. The
// directory is outside the host's control, so everything read from it is checked
// here and reported as text, never thrown.

export type PluginDirectory =
  | { ok: true; plugins: DiscoveredPlugin[] }
  | { ok: false; error: string };

/** Every plugin version in the plugin directory, valid or not. */
export async function readPluginDirectory(): Promise<PluginDirectory> {
  const setting = pluginsDirSetting();
  if (setting.dir === null) {
    return {
      ok: false,
      error: setting.problem ?? "Plugins have no directory to read from.",
    };
  }
  return { ok: true, plugins: (await discoverPlugins(setting.dir)).plugins };
}

export type Staged =
  | { ok: true; manifest: PluginManifest; integrity: string }
  | { ok: false; error: string };

/**
 * The plugin `id` in `version`, as it lies in the directory now: its manifest, and
 * the hash of all its files. The hash is computed before and after the manifest is
 * read, and has to be the same, so the manifest that is used is one of the files
 * the hash covers and not one that changed in between.
 */
export async function stagePlugin(
  directory: DiscoveredPlugin[],
  id: string,
  version: string,
): Promise<Staged> {
  const found = directory.find((p) => p.id === id && p.version === version);
  if (!found) {
    return {
      ok: false,
      error: `There is no ${id} ${version} in the plugin directory.`,
    };
  }
  if (!found.ok) {
    return {
      ok: false,
      error: `Its manifest is not valid: ${found.issues.join("; ")}.`,
    };
  }
  const before = await hashPluginDirectory(found.dir);
  if (!before.ok) {
    return {
      ok: false,
      error: `The plugin's files are not acceptable: ${before.issue}.`,
    };
  }
  const after = await hashPluginDirectory(found.dir);
  if (!after.ok || after.digest !== before.digest) {
    return {
      ok: false,
      error: "The plugin's files changed while they were read.",
    };
  }
  return { ok: true, manifest: found.manifest, integrity: before.digest };
}

/** A manifest as the resolver reads it, where the plugin applies taken from `scope`. */
export function toCandidate(
  manifest: PluginManifest,
  scope: PluginRowScope,
): PluginCandidate {
  return {
    id: manifest.id,
    version: manifest.version,
    barynt: manifest.barynt,
    dependencies: manifest.dependencies,
    scope: manifestScopeOf(scope),
  };
}

/**
 * The installed plugins as the resolver reads them. A plugin whose manifest cannot be
 * read from the directory (it is missing, or invalid) is left out: it cannot load,
 * so nothing depends on it in a way that can be checked. Where a plugin applies is
 * the row's, not the file's.
 */
export function installedCandidates(
  rows: { id: string; version: string; scope: PluginRowScope }[],
  directory: DiscoveredPlugin[],
): PluginCandidate[] {
  const candidates: PluginCandidate[] = [];
  for (const row of rows) {
    const found = directory.find(
      (p) => p.id === row.id && p.version === row.version,
    );
    if (found?.ok) candidates.push(toCandidate(found.manifest, row.scope));
  }
  return candidates;
}

/** Why a change cannot be made, as one sentence, or `null` if it can. */
export function refuseChange(preview: ChangePreview): string | null {
  const reasons: string[] = [];
  if (preview.problems.length > 0) {
    reasons.push(
      `The plugin ${preview.problems.map(describeProblem).join("; ")}.`,
    );
  }
  if (preview.breaks.length > 0) {
    reasons.push(`It would stop ${preview.breaks.join(", ")} from loading.`);
  }
  return reasons.length > 0 ? `Not done. ${reasons.join(" ")}` : null;
}
