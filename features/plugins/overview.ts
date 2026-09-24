import { compare, gt } from "semver";
import type { DiscoveredPlugin } from "@/lib/plugins/discovery";
import type { FailurePhase } from "@/lib/plugins/loader";
import { authorName, resolveText } from "@/lib/plugins/localized";
import type { PluginManifest } from "@/lib/plugins/manifest";
import { type BlockedReason, decideExecution } from "@/lib/plugins/policy";
import type { PluginStatus } from "@/lib/plugins/registry";
import type { Problem } from "@/lib/plugins/resolve";

// What the admin page for plugins shows, put together from what is installed (the
// database), what lies in the plugin directory (the disk) and what the registry
// says became of each plugin. Pure: plain values in, plain values out, so it can be
// tested to the last case, and everything in the result can be handed to a client
// component. Nothing secret is in it: the hash is the one the admin approves.

/** A row of `Plugin`, as much of it as the page needs. */
export interface InstalledRow {
  id: string;
  version: string;
  status: "ENABLED" | "DISABLED";
  source: "STORE" | "UPLOAD" | "DIRECTORY";
  scope: "WORKSPACE" | "PLATFORM";
  origin: string | null;
  integrity: string;
  codeApprovalHash: string | null;
  /** The version before the last update or rollback, and the hash of its files. Both or neither. */
  previousVersion: string | null;
  previousIntegrity: string | null;
}

/** What became of an installed plugin, as a code the page turns into a sentence. */
export type RuntimeState =
  | { kind: "running"; mode: "declarative" | "in-process" }
  /** A per-workspace plugin that no workspace has switched on. */
  | { kind: "idle" }
  | { kind: "off" }
  | { kind: "blocked"; reason: BlockedReason }
  | { kind: "failed"; phase: FailurePhase; message: string }
  | { kind: "incompatible"; problems: Problem[] }
  | { kind: "missing" }
  | { kind: "invalid"; issues: string[] }
  /** The registry does not list it: it could not be built. */
  | { kind: "unknown" };

/**
 * Whether the plugin's code may be approved to run in the app.
 * - `none`: no code, nothing to approve.
 * - `approved`: for exactly the files installed now.
 * - `outdated`: approved for other files (an update since).
 * - `open`: it could run if approved, and is not.
 * - `refused`: it could not run whatever is approved, for `reason`.
 */
export type ApprovalState =
  | { kind: "none" }
  | { kind: "approved" }
  | { kind: "outdated" }
  | { kind: "open" }
  | { kind: "refused"; reason: BlockedReason };

export interface InstalledPlugin {
  id: string;
  version: string;
  name: string;
  description: string;
  author: string;
  license: string;
  homepage: string | null;
  repository: string | null;
  categories: string[];
  /** What it asks to be allowed. A promise, not a fence (docs/plugins/security.md). */
  capabilities: string[];
  scope: "WORKSPACE" | "PLATFORM";
  source: "STORE" | "UPLOAD" | "DIRECTORY";
  origin: string | null;
  /** Comes from no store: nothing pins its files and nobody reviewed it. */
  unsigned: boolean;
  hasCode: boolean;
  /** The platform's switch. */
  platformOn: boolean;
  /** In how many workspaces it is on. Always 0 for a platform plugin. */
  workspaces: number;
  state: RuntimeState;
  approval: ApprovalState;
  /** The hash of the installed files: what an approval is for. */
  integrity: string;
  /** A newer version that lies in the plugin directory, if there is one. */
  update: string | null;
  /**
   * The version a rollback goes back to, if the last update left one. Only says it is there:
   * the server checks the files (`rollbackPlugin`) before it brings them back.
   */
  previousVersion: string | null;
  /**
   * For a plugin from a store: the version that store describes now, when that is newer and the
   * plugin fits this Barynt. It is updated in the store (`updateStorePlugin`), where what it asks
   * for is shown; this is only the pointer to it.
   */
  storeUpdate: string | null;
}

/** A plugin in the plugin directory that is not installed. */
export interface AvailablePlugin {
  id: string;
  version: string;
  name: string;
  description: string;
  author: string;
  license: string;
  categories: string[];
  capabilities: string[];
  scope: "WORKSPACE" | "PLATFORM";
  hasCode: boolean;
}

/** Something in the plugin directory that cannot be used. */
export interface DirectoryProblem {
  id: string;
  version: string;
  issues: string[];
}

export interface PluginsOverview {
  /** The plugin directory, or `null` when plugins are off. */
  dir: string | null;
  /** Why plugins are off or could not be loaded, or `null`. */
  problem: string | null;
  /** Problems with the directory itself, not with one plugin. */
  issues: string[];
  /** Whether plugins that come from no store may be installed and run. */
  allowUnsigned: boolean;
  installed: InstalledPlugin[];
  available: AvailablePlugin[];
  /** Versions in the directory that have no valid manifest, for plugins that are not installed. */
  unusable: DirectoryProblem[];
}

export interface OverviewInput {
  rows: readonly InstalledRow[];
  discovered: readonly DiscoveredPlugin[];
  snapshot: {
    dir: string | null;
    problem: string | null;
    discoveryIssues: readonly string[];
    plugins: readonly { id: string; status: PluginStatus }[];
  };
  /** Ids of workspace plugins, and in how many workspaces each is on. */
  workspaceCounts: ReadonlyMap<string, number>;
  activeStores: readonly string[];
  allowUnsigned: boolean;
  /** Plugin id → the version its store offers as an update. Left out where it is not asked. */
  storeUpdates?: ReadonlyMap<string, string>;
  locale: string;
}

const hasCode = (manifest: Pick<PluginManifest, "server" | "client">) =>
  Boolean(manifest.server || manifest.client);

function runtimeState(status: PluginStatus | undefined): RuntimeState {
  if (!status) return { kind: "unknown" };
  switch (status.state) {
    case "loaded":
      return { kind: "running", mode: status.mode };
    case "idle":
      return { kind: "idle" };
    case "disabled":
      return { kind: "off" };
    case "missing":
      return { kind: "missing" };
    case "invalid":
      return { kind: "invalid", issues: [...status.issues] };
    case "incompatible":
      return { kind: "incompatible", problems: [...status.problems] };
    case "blocked":
      return { kind: "blocked", reason: status.reason };
    case "failed":
      return {
        kind: "failed",
        phase: status.phase,
        message: status.message,
      };
  }
}

/**
 * Whether the code of the plugin may be approved. Asks the policy the question the
 * approval action asks: would it run in the process if the current hash were
 * approved? If not, why not.
 */
function approvalState(
  row: InstalledRow,
  manifest: PluginManifest | null,
  activeStores: readonly string[],
  allowUnsigned: boolean,
): ApprovalState {
  if (manifest && !hasCode(manifest)) return { kind: "none" };
  if (row.codeApprovalHash === row.integrity) return { kind: "approved" };
  if (!manifest) return { kind: "refused", reason: "invalid" };
  const decision = decideExecution(
    {
      manifest,
      source: row.source,
      origin: row.origin,
      integrity: row.integrity,
      codeApprovalHash: row.integrity,
    },
    activeStores,
    { allowUnsigned },
  );
  if (decision.mode === "blocked") {
    return { kind: "refused", reason: decision.reason };
  }
  return row.codeApprovalHash === null
    ? { kind: "open" }
    : { kind: "outdated" };
}

/** The highest version of each id among the valid manifests. */
function highestValid(
  discovered: readonly DiscoveredPlugin[],
): Map<string, Extract<DiscoveredPlugin, { ok: true }>> {
  const best = new Map<string, Extract<DiscoveredPlugin, { ok: true }>>();
  for (const found of discovered) {
    if (!found.ok) continue;
    const current = best.get(found.id);
    if (
      !current ||
      compare(found.manifest.version, current.manifest.version) > 0
    ) {
      best.set(found.id, found);
    }
  }
  return best;
}

export function buildOverview(input: OverviewInput): PluginsOverview {
  const { rows, discovered, snapshot, locale } = input;
  const statusById = new Map(snapshot.plugins.map((p) => [p.id, p.status]));
  const byKey = new Map(discovered.map((d) => [`${d.id}@${d.version}`, d]));
  const best = highestValid(discovered);

  const installed: InstalledPlugin[] = rows.map((row) => {
    const found = byKey.get(`${row.id}@${row.version}`);
    const manifest = found?.ok ? found.manifest : null;
    const newer = best.get(row.id);
    const update =
      row.source === "DIRECTORY" &&
      newer &&
      gt(newer.manifest.version, row.version) &&
      (newer.manifest.scope === "platform") === (row.scope === "PLATFORM")
        ? newer.manifest.version
        : null;
    return {
      id: row.id,
      version: row.version,
      name: manifest ? resolveText(manifest.name, locale) : row.id,
      description: manifest ? resolveText(manifest.description, locale) : "",
      author: manifest ? authorName(manifest.author) : "",
      license: manifest?.license ?? "",
      homepage: manifest?.homepage ?? null,
      repository: manifest?.repository ?? null,
      categories: manifest ? [...manifest.categories] : [],
      capabilities: manifest ? [...manifest.capabilities] : [],
      scope: row.scope,
      source: row.source,
      origin: row.origin,
      unsigned: row.source !== "STORE",
      hasCode: manifest ? hasCode(manifest) : false,
      platformOn: row.status === "ENABLED",
      workspaces:
        row.scope === "WORKSPACE"
          ? (input.workspaceCounts.get(row.id) ?? 0)
          : 0,
      state: runtimeState(statusById.get(row.id)),
      approval: approvalState(
        row,
        manifest,
        input.activeStores,
        input.allowUnsigned,
      ),
      integrity: row.integrity,
      update,
      previousVersion:
        row.previousVersion && row.previousIntegrity
          ? row.previousVersion
          : null,
      storeUpdate:
        row.source === "STORE"
          ? (input.storeUpdates?.get(row.id) ?? null)
          : null,
    };
  });
  installed.sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );

  const installedIds = new Set(rows.map((row) => row.id));
  const available: AvailablePlugin[] = [];
  for (const [id, found] of best) {
    if (installedIds.has(id)) continue;
    const m = found.manifest;
    available.push({
      id,
      version: m.version,
      name: resolveText(m.name, locale),
      description: resolveText(m.description, locale),
      author: authorName(m.author),
      license: m.license,
      categories: [...m.categories],
      capabilities: [...m.capabilities],
      scope: m.scope === "platform" ? "PLATFORM" : "WORKSPACE",
      hasCode: hasCode(m),
    });
  }
  available.sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );

  // Versions without a valid manifest, of plugins that are not installed: for an
  // installed plugin the same shows as its state.
  const unusable: DirectoryProblem[] = discovered
    .filter((d) => !d.ok && !installedIds.has(d.id))
    .map((d) => ({
      id: d.id,
      version: d.version,
      issues: d.ok ? [] : [...d.issues],
    }))
    .sort(
      (a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version),
    );

  return {
    dir: snapshot.dir,
    problem: snapshot.problem,
    issues: [...snapshot.discoveryIssues],
    allowUnsigned: input.allowUnsigned,
    installed,
    available,
    unusable,
  };
}
