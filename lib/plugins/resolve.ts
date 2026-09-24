import { parse, satisfies } from "semver";
import type { PluginManifest, PluginScope } from "./manifest";

// Which installed plugins can load, and in what order.
//
// A plugin cannot load when Barynt is not a version it claims to work with
// (`barynt`), when a plugin it needs (`dependencies`) is missing, the wrong
// version or itself cannot load, or when it sits in a dependency cycle. Every
// such plugin is left out and comes back with its reasons, so the admin UI can
// say why instead of the plugin silently missing.
//
// Pure logic on the manifest fields, no database and no `server-only`: the
// registry runs it on install, on update and at start after a host upgrade
// (BARY-54), tests and tooling run it the same way. The reasons are codes with
// their values; the admin UI turns them into texts in the user's language,
// `describeProblem()` is the English text for logs.

/**
 * The manifest fields that decide. `scope` may be left out, it then counts as
 * `workspace`, as it does in a manifest.
 */
export type PluginCandidate = Pick<
  PluginManifest,
  "id" | "version" | "barynt" | "dependencies"
> & { scope?: PluginScope };

export type Problem =
  /** Barynt is not a version the plugin says it works with. */
  | { code: "host-incompatible"; range: string; host: string }
  /** A plugin it needs is not installed. */
  | { code: "dependency-missing"; dependency: string; range: string }
  /** A plugin it needs is installed, in a version outside the range. */
  | {
      code: "dependency-version";
      dependency: string;
      range: string;
      installed: string;
    }
  /**
   * A platform plugin needs a workspace plugin. A platform plugin applies
   * everywhere, a workspace plugin only where a workspace switched it on.
   */
  | { code: "dependency-scope"; dependency: string }
  /** A plugin it needs is installed in a fitting version but cannot load itself. */
  | { code: "dependency-unavailable"; dependency: string }
  /** It depends on itself through other plugins; `members` are all of them. */
  | { code: "dependency-cycle"; members: string[] };

export interface Resolution {
  /** The plugins that can load, each after the plugins it depends on. */
  order: string[];
  /** Why each plugin that cannot load cannot. A plugin that can has no entry. */
  problems: Map<string, Problem[]>;
}

/**
 * The host's own release, without a pre-release tag: `1.3.0-rc.1` counts as
 * `1.3.0`. Compared as is, `2.0.0-rc.1` would satisfy `<2.0.0` and load plugins
 * written for 1.x into a 2.0 build, and `1.3.0-rc.1` would not satisfy `^1.2.0`.
 */
function releaseOf(version: string): string {
  const parsed = parse(version);
  if (!parsed) {
    // Not untrusted input: the host's own version is a build defect if it is not SemVer.
    throw new TypeError(
      `the host version "${version}" is not a SemVer version`,
    );
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

/**
 * Whether this Barynt is one the `range` allows. Judged on the release, as for a
 * plugin that is installed (see `releaseOf`). A range that is no range does not match.
 * Throws only for a host version that is not SemVer.
 */
export function satisfiesHost(range: string, hostVersion: string): boolean {
  return satisfies(releaseOf(hostVersion), range);
}

/**
 * Decides for a set of installed plugins which can load and in what order.
 *
 * Pass the plugins the host would load. Ids are unique; if one appears twice
 * the later entry wins. The result does not depend on the order of the input:
 * dependencies come first, and plugins with no order between them are sorted
 * by id.
 *
 * Throws only for a host version that is not SemVer, never for a plugin.
 */
export function resolvePlugins(
  plugins: readonly PluginCandidate[],
  hostVersion: string,
): Resolution {
  const release = releaseOf(hostVersion);
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const ids = [...byId.keys()].sort();

  const problems = new Map<string, Problem[]>();
  const add = (id: string, problem: Problem) => {
    const list = problems.get(id);
    if (list) list.push(problem);
    else problems.set(id, [problem]);
  };

  // Dependencies that exist, for finding cycles, and those that exist in a
  // fitting version, for availability and order.
  const present = new Map<string, string[]>();
  const usable = new Map<string, string[]>();

  for (const id of ids) {
    const plugin = byId.get(id);
    if (!plugin) continue;
    if (!satisfies(release, plugin.barynt)) {
      add(id, {
        code: "host-incompatible",
        range: plugin.barynt,
        host: hostVersion,
      });
    }
    const presentDeps: string[] = [];
    const usableDeps: string[] = [];
    for (const [dependency, range] of Object.entries(plugin.dependencies)) {
      const target = byId.get(dependency);
      if (!target) {
        add(id, { code: "dependency-missing", dependency, range });
        continue;
      }
      presentDeps.push(dependency);
      let fits = true;
      if (!satisfies(target.version, range)) {
        add(id, {
          code: "dependency-version",
          dependency,
          range,
          installed: target.version,
        });
        fits = false;
      }
      // A platform plugin runs everywhere, so it may only lean on plugins that
      // are on everywhere too. A workspace plugin may lean on either kind.
      if (
        plugin.scope === "platform" &&
        (target.scope ?? "workspace") !== "platform"
      ) {
        add(id, { code: "dependency-scope", dependency });
        fits = false;
      }
      if (fits) usableDeps.push(dependency);
    }
    present.set(id, presentDeps);
    usable.set(id, usableDeps);
  }

  // Cycles.
  const cycleOf = new Map<string, string>();
  for (const members of findCycles(present)) {
    members.sort();
    for (const id of members) {
      cycleOf.set(id, members[0] ?? id);
      add(id, { code: "dependency-cycle", members: [...members] });
    }
  }

  // A plugin whose dependency cannot load cannot load either, however deep.
  const unavailable = new Set(problems.keys());
  for (let changed = true; changed; ) {
    changed = false;
    for (const [id, deps] of usable) {
      if (!unavailable.has(id) && deps.some((dep) => unavailable.has(dep))) {
        unavailable.add(id);
        changed = true;
      }
    }
  }
  for (const [id, deps] of usable) {
    for (const dependency of deps) {
      // Members of one cycle already say so; do not blame each other as well.
      const sameCycle =
        cycleOf.has(id) && cycleOf.get(id) === cycleOf.get(dependency);
      if (unavailable.has(dependency) && !sameCycle) {
        add(id, { code: "dependency-unavailable", dependency });
      }
    }
  }

  return { order: loadOrder(ids, usable, unavailable), problems };
}

/** Dependencies before dependents; between plugins with no order, by id. */
function loadOrder(
  ids: readonly string[],
  usable: ReadonlyMap<string, readonly string[]>,
  unavailable: ReadonlySet<string>,
): string[] {
  const waiting = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const id of ids) {
    if (unavailable.has(id)) continue;
    const deps = usable.get(id) ?? [];
    waiting.set(id, deps.length);
    for (const dep of deps) {
      const list = dependents.get(dep);
      if (list) list.push(id);
      else dependents.set(dep, [id]);
    }
  }
  const ready = ids.filter((id) => waiting.get(id) === 0);
  const order: string[] = [];
  for (let next = ready.shift(); next !== undefined; next = ready.shift()) {
    order.push(next);
    for (const dependent of dependents.get(next) ?? []) {
      const left = (waiting.get(dependent) ?? 0) - 1;
      waiting.set(dependent, left);
      if (left === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }
  return order;
}

/**
 * The groups of plugins that depend on each other in a loop (strongly
 * connected components, Tarjan), plus a plugin that depends on itself.
 */
function findCycles(graph: ReadonlyMap<string, readonly string[]>): string[][] {
  const nodes = new Map<string, { index: number; low: number }>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];
  let counter = 0;

  const visit = (id: string) => {
    const node = { index: counter, low: counter };
    counter += 1;
    nodes.set(id, node);
    stack.push(id);
    onStack.add(id);
    for (const next of graph.get(id) ?? []) {
      const seen = nodes.get(next);
      if (!seen) {
        visit(next);
        node.low = Math.min(node.low, nodes.get(next)?.low ?? node.low);
      } else if (onStack.has(next)) {
        node.low = Math.min(node.low, seen.index);
      }
    }
    if (node.low === node.index) {
      const members: string[] = [];
      for (
        let member = stack.pop();
        member !== undefined;
        member = stack.pop()
      ) {
        onStack.delete(member);
        members.push(member);
        if (member === id) break;
      }
      const selfLoop = members.length === 1 && graph.get(id)?.includes(id);
      if (members.length > 1 || selfLoop) cycles.push(members);
    }
  };

  for (const id of graph.keys()) if (!nodes.has(id)) visit(id);
  return cycles;
}

// ─── Before a change ────────────────────────────────────────────────────────

export interface ChangePreview {
  /** Why the changed plugin itself could not load afterwards; empty if it can. */
  problems: Problem[];
  /** Plugins that load today and would stop loading because of the change. */
  breaks: string[];
}

/** Plugins that load in `before` and do not in `after`, apart from `except`. */
function newlyBroken(
  before: Resolution,
  after: Resolution,
  except: string,
): string[] {
  return [...before.order]
    .filter((id) => id !== except && after.problems.has(id))
    .sort();
}

/**
 * What installing `candidate` would do, or updating to it if a plugin with its
 * id is installed: whether it could load, and which installed plugins it would
 * break (an update can leave a dependent's version range behind).
 */
export function previewInstall(
  installed: readonly PluginCandidate[],
  candidate: PluginCandidate,
  hostVersion: string,
): ChangePreview {
  const before = resolvePlugins(installed, hostVersion);
  const after = resolvePlugins(
    [...installed.filter((plugin) => plugin.id !== candidate.id), candidate],
    hostVersion,
  );
  return {
    problems: after.problems.get(candidate.id) ?? [],
    breaks: newlyBroken(before, after, candidate.id),
  };
}

/** The installed plugins that would stop loading if `id` were removed. */
export function previewUninstall(
  installed: readonly PluginCandidate[],
  id: string,
  hostVersion: string,
): string[] {
  const before = resolvePlugins(installed, hostVersion);
  const after = resolvePlugins(
    installed.filter((plugin) => plugin.id !== id),
    hostVersion,
  );
  return newlyBroken(before, after, id);
}

// ─── Text ───────────────────────────────────────────────────────────────────

/** English text for logs and errors. The admin UI builds its own from the code. */
export function describeProblem(problem: Problem): string {
  switch (problem.code) {
    case "host-incompatible":
      return `works with Barynt ${problem.range}, this is ${problem.host}`;
    case "dependency-missing":
      return `needs the plugin ${problem.dependency} (${problem.range}), which is not installed`;
    case "dependency-version":
      return `needs ${problem.dependency} ${problem.range}, but ${problem.installed} is installed`;
    case "dependency-scope":
      return `applies to the whole platform but needs ${problem.dependency}, which is switched on per workspace`;
    case "dependency-unavailable":
      return `needs ${problem.dependency}, which cannot load`;
    case "dependency-cycle":
      return `is part of a dependency cycle: ${problem.members.join(", ")}`;
  }
}
