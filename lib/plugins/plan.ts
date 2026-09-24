import type { DiscoveredPlugin } from "./discovery";
import type { LoadCandidate } from "./loader";
import type { PluginManifest } from "./manifest";
import {
  type BlockedReason,
  decideExecution,
  type ExecutionInput,
} from "./policy";
import { type Problem, resolvePlugins } from "./resolve";

// Which installed plugins the registry hands to the loader, and why the others
// are not. Pure logic on plain values, no database, disk or `server-only`: the
// registry reads the inputs and runs the loader, this decides in between, so it
// can be tested to the last case.
//
// The steps, in this order:
//
// 1. Each installed plugin needs its manifest on disk, in the installed version,
//    and valid. Otherwise: `missing` or `invalid`.
// 2. `resolvePlugins()` says which can load with this Barynt and each other
//    (host range, dependencies, cycles). The others: `incompatible`.
// 3. Which are wanted. A platform plugin is wanted whenever it is switched on; a
//    workspace plugin only when a workspace has it on, because code nobody asked
//    for has no reason to run. What they depend on is wanted too. A plugin the
//    platform switched off is never loaded, even as a dependency (its dependents
//    then fail, and the loader says so). The rest: `disabled` or `idle`.
// 4. `decideExecution()` for each wanted plugin. Blocked ones stay out: `blocked`.
// 5. What is left goes to the loader, in the order of step 2.
//
// Where the manifest is read from disk before the loader has checked the files
// against the approved hash, it only decides *whether to try*: the loader checks
// every plugin before any of it is read or run, so a manifest that was changed
// after install makes that plugin fail there and never runs anything.

/** A row of `Plugin`, plus the approval this step cannot read yet. */
export interface InstalledPlugin {
  id: string;
  version: string;
  /** `Plugin.status`: the platform's switch for the whole plugin. */
  status: "ENABLED" | "DISABLED";
  source: string;
  scope: "WORKSPACE" | "PLATFORM";
  origin: string | null;
  /** The hash of the plugin directory approved at install. */
  integrity: string;
  /**
   * The hash the platform approved for running the plugin's code, or `null`.
   * Nothing records an approval yet (BARY-122), so the registry passes `null`
   * and no plugin with code runs in the process.
   */
  codeApprovalHash: string | null;
}

/** What is known about an installed plugin before the loader runs. */
export type PluginPlan =
  /** The platform switched the plugin off. It is not loaded. */
  | { state: "disabled" }
  /** A workspace plugin that no workspace has switched on. It is not loaded. */
  | { state: "idle" }
  /** Its manifest is not on disk in the installed version. */
  | { state: "missing" }
  /** Its manifest is there and not valid. */
  | { state: "invalid"; issues: string[] }
  /** It cannot load with this Barynt or with the plugins it needs. */
  | { state: "incompatible"; problems: Problem[] }
  /** The policy does not let it run. */
  | { state: "blocked"; reason: BlockedReason }
  /** It goes to the loader. `mode` is how the policy lets it run. */
  | { state: "planned"; mode: "declarative" | "in-process" };

export interface PlanInput {
  installed: readonly InstalledPlugin[];
  /** What discovery found on disk, every version. */
  discovered: readonly DiscoveredPlugin[];
  /** Ids of workspace plugins that at least one workspace has switched on. */
  enabledSomewhere: ReadonlySet<string>;
  /** The stores that are on, for the policy. */
  activeStores: readonly string[];
  /** The platform's setting for plugins from no store, for the policy. */
  allowUnsigned: boolean;
  /** The running Barynt, SemVer. */
  hostVersion: string;
}

export interface Plan {
  /** One entry for every installed plugin. */
  plans: Map<string, PluginPlan>;
  /** For the loader, dependencies first. Only plugins planned as `planned`. */
  candidates: LoadCandidate[];
  /** How each candidate may run, by id. */
  modes: Map<string, "declarative" | "in-process">;
}

export function planPlugins(input: PlanInput): Plan {
  const plans = new Map<string, PluginPlan>();
  const modes = new Map<string, "declarative" | "in-process">();
  const byKey = new Map<string, DiscoveredPlugin>();
  for (const found of input.discovered) {
    byKey.set(`${found.id}@${found.version}`, found);
  }

  // 1. The manifest on disk, in the installed version.
  const manifests = new Map<string, PluginManifest>();
  const dirs = new Map<string, string>();
  for (const plugin of input.installed) {
    const found = byKey.get(`${plugin.id}@${plugin.version}`);
    if (!found) {
      plans.set(plugin.id, { state: "missing" });
    } else if (!found.ok) {
      plans.set(plugin.id, { state: "invalid", issues: found.issues });
    } else {
      manifests.set(plugin.id, found.manifest);
      dirs.set(plugin.id, found.dir);
    }
  }
  const installed = new Map(input.installed.map((p) => [p.id, p]));

  // 2. Which of them can load at all.
  const resolution = resolvePlugins(
    [...manifests].map(([id, manifest]) => ({
      id,
      version: manifest.version,
      barynt: manifest.barynt,
      dependencies: manifest.dependencies,
      // The database says where a plugin applies, taken from the manifest at
      // install; the file on disk has not been checked against its hash yet.
      scope:
        installed.get(id)?.scope === "PLATFORM"
          ? ("platform" as const)
          : ("workspace" as const),
    })),
    input.hostVersion,
  );
  for (const [id, problems] of resolution.problems) {
    plans.set(id, { state: "incompatible", problems });
  }

  // 3. Which are wanted, and what they need.
  const wanted = new Set<string>();
  for (const id of resolution.order) {
    const plugin = installed.get(id);
    if (!plugin || plugin.status !== "ENABLED") continue;
    if (plugin.scope === "PLATFORM" || input.enabledSomewhere.has(id)) {
      wanted.add(id);
    }
  }
  // Dependencies come first in `order`, so walking it backwards reaches every
  // dependency of a wanted plugin after the plugin itself.
  for (const id of [...resolution.order].reverse()) {
    if (!wanted.has(id)) continue;
    for (const dependency of Object.keys(
      manifests.get(id)?.dependencies ?? {},
    )) {
      wanted.add(dependency);
    }
  }
  const toLoad: string[] = [];
  for (const id of resolution.order) {
    const plugin = installed.get(id);
    if (!plugin) continue;
    if (plugin.status !== "ENABLED") {
      plans.set(id, { state: "disabled" });
    } else if (!wanted.has(id)) {
      plans.set(id, { state: "idle" });
    } else {
      toLoad.push(id);
    }
  }

  // 4. The policy, for each of them.
  const candidates: LoadCandidate[] = [];
  for (const id of toLoad) {
    const plugin = installed.get(id);
    const manifest = manifests.get(id);
    const dir = dirs.get(id);
    if (!plugin || !manifest || !dir) continue;
    const executionInput: ExecutionInput = {
      manifest,
      source: plugin.source,
      origin: plugin.origin,
      integrity: plugin.integrity,
      codeApprovalHash: plugin.codeApprovalHash,
    };
    const decision = decideExecution(executionInput, input.activeStores, {
      allowUnsigned: input.allowUnsigned,
    });
    if (decision.mode === "blocked") {
      plans.set(id, { state: "blocked", reason: decision.reason });
      continue;
    }
    plans.set(id, { state: "planned", mode: decision.mode });
    modes.set(id, decision.mode);
    // 5. To the loader, with the hash approved at install.
    candidates.push({
      id,
      version: plugin.version,
      dir,
      manifest,
      integrity: plugin.integrity,
    });
  }

  return { plans, candidates, modes };
}
