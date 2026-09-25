import type { HostInfo, PluginInfo } from "@barynt/plugin-sdk";
import type { Discovery, PluginsDirSetting } from "./discovery";
import type {
  BootServices,
  FailurePhase,
  LoadCandidate,
  LoadOptions,
  LoadReport,
  PluginHooks,
  Registration,
} from "./loader";
import type { PluginManifest } from "./manifest";
import { type InstalledPlugin, type PluginPlan, planPlugins } from "./plan";
import { invalidatePluginRegistry, type RegistryState } from "./registryState";
import type { PluginRowScope } from "./scope";

// Which plugins are running, decided once per process and kept until something
// that decides it changes. The registry reads what is installed and what lies on
// disk, asks `planPlugins()` which may load, runs the loader for those, and keeps
// the result as a *snapshot* that the rest of the app reads.
//
// Everything it needs from outside comes in as `RegistryDeps`, so this file
// imports no database and no session and can be tested with plain values. The
// real ones are wired in `host.ts`.
//
// Failing closed is the rule. A build that fails as a whole (the database cannot
// be read, say) is a snapshot with no plugins, tried again after a while, never
// the last good one: a plugin that was allowed a moment ago and may not be now
// must not be handed out because the answer could not be found. And a change that
// happens while a build runs is not served from that build.

/** How long after a failed build the next request tries again. */
export const RETRY_AFTER_FAILURE_MS = 10_000;

/** How often a build is started again because something changed while it ran. */
const MAX_ATTEMPTS = 4;

export interface RegistryDeps {
  /** Where plugins live: the default, or what the environment names. `null` if there is no usable one. */
  pluginsDir(): PluginsDirSetting;
  /** What is installed, and which workspace plugins some workspace has switched on. */
  installed(): Promise<{
    plugins: InstalledPlugin[];
    enabledSomewhere: ReadonlySet<string>;
  }>;
  discover(dir: string): Promise<Discovery>;
  /** The stores that are on. Fails closed, an empty list when it cannot be read. */
  activeStores(): Promise<string[]>;
  /** Whether plugins from no store are allowed. Fails closed. */
  allowUnsigned(): Promise<boolean>;
  load(
    candidates: readonly LoadCandidate[],
    options: LoadOptions,
  ): Promise<LoadReport>;
  host: HostInfo;
  services(plugin: PluginInfo, manifest: PluginManifest): BootServices;
  now(): number;
  /** One line for the server log. */
  log(message: string): void;
}

/** What is the case for an installed plugin after the loader has run. */
export type PluginStatus =
  | Exclude<PluginPlan, { state: "planned" }>
  /** It registered and booted. `mode` says how it may run. */
  | { state: "loaded"; mode: "declarative" | "in-process" }
  /** The loader refused it, or it failed in the phase named. */
  | { state: "failed"; phase: FailurePhase; message: string };

export interface PluginState {
  id: string;
  version: string;
  scope: PluginRowScope;
  source: string;
  origin: string | null;
  status: PluginStatus;
}

/** A plugin that is running, with what it registered. */
export interface ActivePlugin {
  id: string;
  version: string;
  scope: PluginRowScope;
  mode: "declarative" | "in-process";
  registrations: Registration[];
  /** The lifecycle hooks it has, for `docs/plugins/lifecycle.md`. */
  hooks: PluginHooks;
}

export interface RegistrySnapshot {
  builtAt: number;
  /** The plugin directory, or `null` when plugins are off. */
  dir: string | null;
  /** Why plugins are off or could not be loaded, for an admin. `null` when all is well. */
  problem: string | null;
  /** Problems with the plugin directory itself or entries in it that are no plugin. */
  discoveryIssues: string[];
  /** Every installed plugin, by id, with what became of it. */
  plugins: PluginState[];
  /** The ones that are running, in load order, dependencies first. */
  active: ActivePlugin[];
}

function emptySnapshot(
  now: number,
  dir: string | null,
  problem: string | null,
): RegistrySnapshot {
  return {
    builtAt: now,
    dir,
    problem,
    discoveryIssues: [],
    plugins: [],
    active: [],
  };
}

const bootKey = (candidate: Pick<LoadCandidate, "id" | "version">) =>
  `${candidate.id}@${candidate.version}`;

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const oneLine = message.replace(/\s+/g, " ").trim() || "unknown error";
  return oneLine.length > 300 ? `${oneLine.slice(0, 300)}…` : oneLine;
}

async function buildSnapshot(
  deps: RegistryDeps,
  state: RegistryState,
): Promise<RegistrySnapshot> {
  const setting = deps.pluginsDir();
  if (setting.dir === null) {
    return emptySnapshot(deps.now(), null, setting.problem ?? null);
  }

  const [installed, discovery, activeStores, allowUnsigned] = await Promise.all(
    [
      deps.installed(),
      deps.discover(setting.dir),
      deps.activeStores(),
      deps.allowUnsigned(),
    ],
  );

  const plan = planPlugins({
    installed: installed.plugins,
    discovered: discovery.plugins,
    enabledSomewhere: installed.enabledSomewhere,
    activeStores,
    allowUnsigned,
    hostVersion: deps.host.barynt,
  });

  let report: LoadReport = { loaded: [], failed: new Map() };
  if (plan.candidates.length > 0) {
    // The host's services say `null` while plugins load, so a `boot` that runs
    // inside a request never sees who made it.
    state.loading += 1;
    try {
      report = await deps.load(plan.candidates, {
        host: deps.host,
        services: (plugin, manifest) => deps.services(plugin, manifest),
        alreadyBooted: (candidate) => state.booted.has(bootKey(candidate)),
      });
    } finally {
      state.loading -= 1;
    }
  }

  const loadedById = new Map(report.loaded.map((entry) => [entry.id, entry]));
  const scopeOf = new Map(installed.plugins.map((p) => [p.id, p.scope]));
  const plugins: PluginState[] = [];
  for (const plugin of installed.plugins) {
    const planned: PluginPlan = plan.plans.get(plugin.id) ?? {
      state: "missing",
    };
    let status: PluginStatus;
    if (planned.state === "planned") {
      const failure = report.failed.get(plugin.id);
      if (loadedById.has(plugin.id)) {
        status = { state: "loaded", mode: planned.mode };
      } else {
        // Refused by the loader. If it says nothing, that is still a refusal.
        status = {
          state: "failed",
          phase: failure?.phase ?? "dependency",
          message: failure?.message ?? "did not load",
        };
      }
    } else {
      status = planned;
    }
    plugins.push({
      id: plugin.id,
      version: plugin.version,
      scope: plugin.scope,
      source: plugin.source,
      origin: plugin.origin,
      status,
    });
  }
  plugins.sort((a, b) => a.id.localeCompare(b.id));

  const active: ActivePlugin[] = [];
  for (const entry of report.loaded) {
    const mode = plan.modes.get(entry.id);
    const scope = scopeOf.get(entry.id);
    if (!mode || !scope) continue;
    active.push({
      id: entry.id,
      version: entry.version,
      scope,
      mode,
      registrations: entry.registrations,
      hooks: entry.hooks,
    });
    state.booted.add(bootKey(entry));
  }

  return {
    builtAt: deps.now(),
    dir: setting.dir,
    problem: null,
    // A default directory that is not there is not a problem, there are no
    // plugins yet. One that was named and is missing is. Plugins that are
    // installed but lost with the directory still show as missing, above.
    discoveryIssues:
      setting.implicit && discovery.rootMissing ? [] : discovery.issues,
    plugins,
    active,
  };
}

export interface PluginRegistry {
  /** The current snapshot. Builds it if there is none, and waits for a build that is running. */
  get(): Promise<RegistrySnapshot>;
  /** The plugins changed: the next `get()` builds again. */
  invalidate(): void;
  /** Builds the snapshot now. Never throws. */
  start(): Promise<void>;
}

/** What one build made, and which generation of the settings it was made for. */
interface Built {
  snapshot: RegistrySnapshot;
  generation: number;
  /** The build failed as a whole, not one plugin. */
  failed: boolean;
}

export function createPluginRegistry(
  deps: RegistryDeps,
  state: RegistryState,
): PluginRegistry {
  const build = (): Promise<Built> => {
    const generation = state.generation;
    const running = (async (): Promise<Built> => {
      try {
        const snapshot = await buildSnapshot(deps, state);
        return { snapshot, generation, failed: false };
      } catch (error) {
        deps.log(`the plugins could not be loaded: ${describe(error)}`);
        const snapshot = emptySnapshot(
          deps.now(),
          null,
          `The plugins could not be loaded: ${describe(error)}`,
        );
        return { snapshot, generation, failed: true };
      }
    })().then((built) => {
      // Only a build that is still the current one is kept.
      if (state.generation === built.generation) {
        state.snapshot = built.snapshot;
        state.failedAt = built.failed ? deps.now() : null;
      }
      return built;
    });
    const tracked: Promise<Built> = running.finally(() => {
      if (state.building === tracked) state.building = null;
    });
    return tracked;
  };

  /** The snapshot, unless there is none or it is a failure old enough to try again. */
  const usable = (): RegistrySnapshot | null => {
    if (!state.snapshot) return null;
    if (
      state.failedAt !== null &&
      deps.now() - state.failedAt >= RETRY_AFTER_FAILURE_MS
    ) {
      return null;
    }
    return state.snapshot;
  };

  const get = async (): Promise<RegistrySnapshot> => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const cached = usable();
      if (cached) return cached;
      state.building ??= build();
      const { snapshot, generation } = await state.building;
      if (generation === state.generation) return snapshot;
      // Something changed while it was building: what it found may be out of date.
    }
    // It kept changing. Nothing runs rather than something that may be stale.
    return emptySnapshot(
      deps.now(),
      null,
      "The plugin settings kept changing while the plugins were being loaded.",
    );
  };

  return {
    get,
    invalidate: () => invalidatePluginRegistry(state),
    async start() {
      try {
        await get();
      } catch (error) {
        deps.log(`the plugins could not be started: ${describe(error)}`);
      }
    },
  };
}

/**
 * The plugins that apply in a workspace: every platform plugin that is running,
 * and each workspace plugin that is running and switched on there. A plugin that
 * is loaded because another one needs it, but that this workspace did not switch
 * on, is not among them.
 */
export function activePluginsIn(
  snapshot: RegistrySnapshot,
  enabledInWorkspace: ReadonlySet<string>,
): ActivePlugin[] {
  // By what a plugin is, not by what it is not: one that applies per project is never a
  // workspace's, whatever ends up in `enabledInWorkspace`.
  return activePluginsInProject(snapshot, enabledInWorkspace, new Set());
}

/**
 * The plugins that apply in a project: what applies in its workspace (every platform plugin
 * that is running and each workspace plugin switched on there), and each project plugin that
 * is running and switched on in the project. A plugin that is loaded because another one
 * needs it, but that this project did not switch on, is not among them.
 */
export function activePluginsInProject(
  snapshot: RegistrySnapshot,
  enabledInWorkspace: ReadonlySet<string>,
  enabledInProject: ReadonlySet<string>,
): ActivePlugin[] {
  return snapshot.active.filter(
    (plugin) =>
      plugin.scope === "PLATFORM" ||
      (plugin.scope === "WORKSPACE" && enabledInWorkspace.has(plugin.id)) ||
      (plugin.scope === "PROJECT" && enabledInProject.has(plugin.id)),
  );
}
