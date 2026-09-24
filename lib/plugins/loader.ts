import "server-only";
import { realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import type {
  BootContext,
  HostInfo,
  PluginDefinition,
  PluginInfo,
  RegistrationContext,
  ServerContributionPoint,
} from "@barynt/plugin-sdk";
import { parsePluginModule } from "./definition";
import { errorCode } from "./discovery";
import { verifyPluginIntegrity } from "./integrity";
import type { PluginManifest } from "./manifest";

// Turns plugins found on disk into plugins that ran: imports each server module,
// runs `register` for every plugin and only then `boot` (docs/plugins/sdk.md),
// and records what each plugin registered.
//
// Plugin code is loaded into this process with this process's privileges (trust
// tier B, ADR 0001), so nothing here is isolation. What it does do is keep one
// broken plugin from breaking the app or the others: every failure is caught,
// recorded per plugin with the phase it happened in, and whatever the plugin had
// registered is thrown away. A plugin whose dependency failed does not load
// either. What it cannot do is stop code that never returns, such as `while (true)`
// in a top-level statement; a timeout only stops *waiting* for it.
//
// Modules are imported by absolute path with `/* turbopackIgnore: true */` on
// every dynamic path, from a directory outside the app (ADR 0001).

export type FailurePhase =
  /**
   * The files on disk are not what was approved at install: changed, added,
   * removed, or something in the directory that is not allowed (a symlink).
   * Nothing of the plugin is run, not even imported.
   */
  | "integrity"
  /** The `server` file is missing, unreadable, or leads out of the plugin directory. */
  | "entry"
  /** Importing the module threw or took too long. */
  | "import"
  /** The module did not export a plugin (see `parsePluginModule`). */
  | "module"
  /** `register` threw, returned a promise, or registered something it may not. */
  | "register"
  /** `boot` threw or took too long. */
  | "boot"
  /** A plugin it depends on did not load. */
  | "dependency";

export interface PluginFailure {
  phase: FailurePhase;
  /** For an admin to read: the error's message, shortened, never a stack trace. */
  message: string;
}

/** One thing a plugin handed to the host with a `register*` method. */
export interface Registration {
  point: ServerContributionPoint;
  /** The id from the plugin's manifest. */
  id: string;
  definition: unknown;
}

export interface LoadedPlugin {
  id: string;
  version: string;
  /** In the order the plugin registered them. Empty for a plugin without server code. */
  registrations: Registration[];
}

export interface LoadReport {
  /** Plugins that registered and booted, in load order. */
  loaded: LoadedPlugin[];
  /** Plugins that did not, and why. */
  failed: Map<string, PluginFailure>;
}

/** What a plugin found on disk needs to be loaded. `manifest` is the validated one. */
export interface LoadCandidate {
  id: string;
  version: string;
  /** Absolute path of `<plugins>/<id>/<version>`. */
  dir: string;
  manifest: PluginManifest;
  /**
   * The hash of the plugin's files that was approved at install
   * (`hashPluginDirectory()`, `Plugin.integrity`). Without a valid one the
   * plugin does not load.
   */
  integrity: string;
}

/** The host's services for one plugin, so `jobs.enqueue` can be bound to its id. */
export type BootServices = Pick<
  BootContext,
  "storage" | "events" | "jobs" | "user" | "workspace"
>;

export interface LoadOptions {
  host: HostInfo;
  services: (plugin: PluginInfo) => BootServices;
  /** How long importing a module may take. Default 10 seconds. */
  importTimeoutMs?: number;
  /** How long `boot` may take. Default 30 seconds. */
  bootTimeoutMs?: number;
  /**
   * Returns why a plugin's files are not acceptable, or `null`. The default
   * compares them with `candidate.integrity`. Only tests replace it.
   */
  verify?: (candidate: LoadCandidate) => Promise<string | null>;
  /**
   * Whether this plugin already booted in this process. `boot` runs once per
   * process (docs/plugins/sdk.md), so when the registry loads again after a
   * change the ones that booted are registered again, which only declares, and
   * are not booted a second time. Importing the file again gives the module the
   * runtime already holds, with whatever state it kept.
   */
  alreadyBooted?: (candidate: LoadCandidate) => boolean;
}

const MAX_MESSAGE = 300;

/** The message of whatever was thrown, which may not be an Error at all. */
function describe(error: unknown): string {
  let message: string;
  try {
    message =
      error instanceof Error && typeof error.message === "string"
        ? error.message
        : String(error);
  } catch {
    // A message getter or a toString that throws.
    message = "unknown error";
  }
  const oneLine = message.replace(/\s+/g, " ").trim() || "unknown error";
  return oneLine.length > MAX_MESSAGE
    ? `${oneLine.slice(0, MAX_MESSAGE)}…`
    : oneLine;
}

/** Stops waiting after `ms`. The work itself is not stopped, JavaScript cannot do that. */
function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  what: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} took longer than ${ms} ms`)),
      ms,
    );
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/**
 * The absolute path of the `server` file, resolved through symlinks. A symlink
 * inside the plugin directory that points out of it is refused: the manifest
 * validator keeps `..` out of the path, this is the other way to leave.
 */
async function resolveEntry(dir: string, relative: string): Promise<string> {
  let realDir: string;
  let real: string;
  try {
    realDir = await realpath(/* turbopackIgnore: true */ dir);
    real = await realpath(
      /* turbopackIgnore: true */ join(
        /* turbopackIgnore: true */ realDir,
        relative,
      ),
    );
  } catch (error) {
    const code = errorCode(error);
    throw new Error(
      code === "ENOENT"
        ? `${relative} does not exist`
        : `${relative} cannot be read (${code})`,
    );
  }
  if (real !== realDir && !real.startsWith(realDir + sep)) {
    throw new Error(`${relative} leads out of the plugin directory`);
  }
  if (!(await stat(/* turbopackIgnore: true */ real)).isFile()) {
    throw new Error(`${relative} is not a file`);
  }
  return real;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * What `register` gets: one method per point a server module can fulfil. A
 * registration for an id the manifest does not list, or a second one for the
 * same id, is a violation. It is recorded *and* thrown, so a plugin that catches
 * the error to carry on is still refused afterwards.
 */
function registrationContext(
  info: PluginInfo,
  host: HostInfo,
  manifest: PluginManifest,
  registrations: Registration[],
  violations: string[],
): RegistrationContext {
  const seen = new Set<string>();
  const refuse = (message: string): never => {
    violations.push(message);
    throw new Error(message);
  };
  const method =
    (point: ServerContributionPoint) => (id: string, definition: unknown) => {
      const declared = manifest.contributes[point]?.some(
        (item) => item.id === id,
      );
      if (typeof id !== "string" || !declared) {
        refuse(
          `${point} "${String(id)}" is not listed under contributes.${point} in the manifest`,
        );
      }
      if (seen.has(`${point}:${id}`)) {
        refuse(`${point} "${id}" is registered twice`);
      }
      if (typeof definition !== "object" || definition === null) {
        refuse(`${point} "${id}" needs an object as its definition`);
      }
      seen.add(`${point}:${id}`);
      registrations.push({ point, id, definition });
    };

  return Object.freeze({
    plugin: Object.freeze({ ...info }),
    host: Object.freeze({ ...host }),
    registerSetting: method("settings"),
    registerPermission: method("permissions"),
    registerEventListener: method("events"),
    registerJob: method("jobs"),
    registerWebhook: method("webhooks"),
    registerNotification: method("notifications"),
    registerCustomField: method("customFields"),
  });
}

interface Pending {
  candidate: LoadCandidate;
  definition: PluginDefinition | null;
  registrations: Registration[];
}

/**
 * Loads plugins that are already in load order, dependencies first (what
 * `resolvePlugins()` returns). First every plugin is imported and registered,
 * then every plugin is booted, so no plugin's `boot` runs before another's
 * `register`. Never throws: a failure is recorded for its plugin and the others
 * carry on.
 */
export async function loadPlugins(
  candidates: readonly LoadCandidate[],
  options: LoadOptions,
): Promise<LoadReport> {
  const importTimeout = options.importTimeoutMs ?? 10_000;
  const bootTimeout = options.bootTimeoutMs ?? 30_000;
  const verify =
    options.verify ??
    ((candidate: LoadCandidate) =>
      verifyPluginIntegrity(candidate.dir, candidate.integrity));
  const failed = new Map<string, PluginFailure>();
  const pending = new Map<string, Pending>();
  const alive = new Set<string>();

  const fail = (id: string, phase: FailurePhase, error: unknown) => {
    failed.set(id, { phase, message: describe(error) });
    alive.delete(id);
  };
  const missingDependency = (manifest: PluginManifest) =>
    Object.keys(manifest.dependencies).find((dep) => !alive.has(dep));

  // Phase 1: import and register.
  for (const candidate of candidates) {
    const { id, version, manifest } = candidate;
    const missing = missingDependency(manifest);
    if (missing) {
      fail(id, "dependency", `needs ${missing}, which did not load`);
      continue;
    }

    // Before anything of the plugin is read or run.
    let phase: FailurePhase = "integrity";
    try {
      const refusal = await verify(candidate);
      if (refusal) throw new Error(refusal);
      phase = "entry";
      const registrations: Registration[] = [];
      let definition: PluginDefinition | null = null;
      if (manifest.server) {
        const file = await resolveEntry(candidate.dir, manifest.server);
        phase = "import";
        const mod = await withTimeout(
          import(/* turbopackIgnore: true */ file),
          importTimeout,
          "importing the module",
        );
        phase = "module";
        const parsed = parsePluginModule(mod);
        if (!parsed.ok) throw new Error(parsed.issues.join("; "));
        definition = parsed.definition;

        phase = "register";
        const violations: string[] = [];
        const returned: unknown = definition.register?.(
          registrationContext(
            { id, version },
            options.host,
            manifest,
            registrations,
            violations,
          ),
        );
        if (isThenable(returned)) {
          // The rejection would otherwise surface as an unhandled one.
          returned.then(undefined, () => {});
          throw new Error(
            "register returned a promise, it has to be synchronous",
          );
        }
        if (violations.length > 0) throw new Error(violations.join("; "));
      }
      pending.set(id, { candidate, definition, registrations });
      alive.add(id);
    } catch (error) {
      fail(id, phase, error);
    }
  }

  // Phase 2: boot, once every plugin has registered.
  for (const [id, { candidate, definition }] of pending) {
    if (!alive.has(id)) continue;
    const missing = missingDependency(candidate.manifest);
    if (missing) {
      fail(id, "dependency", `needs ${missing}, which did not load`);
      continue;
    }
    if (!definition?.boot) continue;
    try {
      if (options.alreadyBooted?.(candidate)) continue;
      const info: PluginInfo = { id, version: candidate.version };
      const services = options.services(info);
      // Picked one by one: a factory that returns more than the five services
      // must not hand the plugin the rest.
      const context: BootContext = Object.freeze({
        plugin: Object.freeze({ ...info }),
        host: Object.freeze({ ...options.host }),
        storage: services.storage,
        events: services.events,
        jobs: services.jobs,
        user: services.user,
        workspace: services.workspace,
      });
      await withTimeout(
        Promise.resolve(definition.boot(context)),
        bootTimeout,
        "boot",
      );
    } catch (error) {
      fail(id, "boot", error);
    }
  }

  const loaded: LoadedPlugin[] = [];
  for (const [id, { candidate, registrations }] of pending) {
    if (alive.has(id)) {
      loaded.push({ id, version: candidate.version, registrations });
    }
  }
  return { loaded, failed };
}
