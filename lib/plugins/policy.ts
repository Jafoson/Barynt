import { isIntegrityHash } from "./hashFormat";
import type { PluginManifest } from "./manifest";

// Who may run plugin code in the app's process. Plugin code that runs there has
// the power of the whole app (docs/plugins/security.md), so the rule is strict
// and closed: **code runs in-process only for a plugin from a store the platform
// has switched on that the platform has also approved, for the exact files it has
// now.** Everything else with code is blocked, whatever else is true of it. A
// plugin without code runs, because nothing of it does.
//
// Which stores are on is the platform admin's choice: the official store is on by
// default, and the admin can add stores, or switch the official one off and use
// only their own. Connecting a store means trusting what its authors publish, but
// it never runs anything by itself: every plugin with code still needs its own
// approval for its exact hash.
//
// Pure logic on plain values, no database and no `server-only`: the registry
// asks it for every installed plugin and hands the loader only those it lets
// through. Wherever a value is missing, unknown or malformed the answer is
// "blocked", never "allowed".

/**
 * The official store, managed by the project. It is the one store that is on by
 * default. Whether it stays on is the platform admin's choice, so this is the
 * *default entry* of the list of active stores, not a rule of its own. If the
 * store moves, this changes in code.
 */
export const OFFICIAL_STORE_URL =
  "https://github.com/Jafoson/barynt-plugin-store";

/** The stores that are on until a platform admin changes them. */
export const DEFAULT_ACTIVE_STORES: readonly string[] = [OFFICIAL_STORE_URL];

/**
 * A store address in one form for comparing: `host/path`, lowercase, without
 * `.git` and a trailing slash. Only a plain `https://host/path` qualifies. Anything
 * else (another scheme, credentials, a port, a query or fragment, the `git@host:`
 * form, text that is no URL) gives `null`, which is never equal to anything.
 */
export function normalizeStoreUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }
  const path = parsed.pathname.replace(/\/+$/, "").replace(/\.git$/i, "");
  return path ? `${parsed.hostname}${path}`.toLowerCase() : null;
}

/**
 * Is `origin` one of the active stores? Both sides are compared in normalised
 * form, and an entry that does not normalise (garbage in the list) matches
 * nothing. A list that is missing, not a list, or empty matches nothing, so no
 * configuration means no code.
 */
export function isActiveStore(
  origin: unknown,
  activeStores: readonly unknown[],
): boolean {
  const given = normalizeStoreUrl(origin);
  if (given === null || !Array.isArray(activeStores)) return false;
  return activeStores.some((store) => normalizeStoreUrl(store) === given);
}

/** Is this the official store? For marking it as such, not for deciding what runs. */
export function isOfficialStore(origin: unknown): boolean {
  return isActiveStore(origin, [OFFICIAL_STORE_URL]);
}

export type BlockedReason =
  /** The input is missing or malformed, so it cannot be known whether the plugin has code. */
  | "invalid"
  /** It has code, and it is not from a store that is switched on (or not from a store at all). */
  | "store-not-active"
  /** It has code, and the platform has not approved running it (or there is no valid hash to approve). */
  | "not-approved"
  /** The approval is for other files than the ones installed now, for example after an update. */
  | "approval-outdated";

export type ExecutionDecision =
  /** Nothing of the plugin runs; the host renders what it declares. */
  | { mode: "declarative" }
  /** Its code may run in the app's process. */
  | { mode: "in-process" }
  | { mode: "blocked"; reason: BlockedReason };

export interface ExecutionInput {
  /** Whether the plugin has code: a server module, a client bundle, or both. */
  manifest: Pick<PluginManifest, "server" | "client">;
  /** `Plugin.source`. */
  source: string;
  /** `Plugin.origin`, the store the plugin came from. */
  origin: string | null;
  /** `Plugin.integrity`, the hash of the files installed now. */
  integrity: string;
  /** The hash the platform approved for running code, or null if it approved none. */
  codeApprovalHash: string | null;
}

/**
 * What may become of an installed plugin. Rules, in this order:
 *
 * 0. input that is missing or malformed: blocked, invalid. Not knowing whether a
 *    plugin has code is not the same as it having none.
 * 1. no `server` and no `client`: declarative, it runs. A value that is there
 *    counts as code, even an empty one.
 * 2. not from an active store (source is not `STORE`, or its store is not among
 *    `activeStores`): blocked.
 * 3. no valid hash on record, or no approval: blocked, not approved.
 * 4. the approval is for another hash than the installed one: blocked, outdated.
 * 5. otherwise in-process.
 *
 * It never throws.
 */
export function decideExecution(
  input: ExecutionInput,
  activeStores: readonly string[],
): ExecutionDecision {
  try {
    return decide(input, activeStores);
  } catch {
    // A getter that throws, or anything else nobody expected: not allowed.
    return { mode: "blocked", reason: "invalid" };
  }
}

function decide(
  input: ExecutionInput,
  activeStores: readonly string[],
): ExecutionDecision {
  const manifest = (input as ExecutionInput | null | undefined)?.manifest;
  if (
    typeof input !== "object" ||
    input === null ||
    typeof manifest !== "object" ||
    manifest === null
  ) {
    return { mode: "blocked", reason: "invalid" };
  }
  if (manifest.server == null && manifest.client == null) {
    return { mode: "declarative" };
  }

  if (input.source !== "STORE" || !isActiveStore(input.origin, activeStores)) {
    return { mode: "blocked", reason: "store-not-active" };
  }
  if (!isIntegrityHash(input.integrity) || !input.codeApprovalHash) {
    return { mode: "blocked", reason: "not-approved" };
  }
  if (input.codeApprovalHash !== input.integrity) {
    return { mode: "blocked", reason: "approval-outdated" };
  }
  return { mode: "in-process" };
}

/** English text for logs and errors; the admin UI builds its own from the reason. */
export function describeDecision(decision: ExecutionDecision): string {
  if (decision.mode === "declarative")
    return "has no code, so nothing of it runs";
  if (decision.mode === "in-process") {
    return "runs in the app's process, approved for exactly these files";
  }
  switch (decision.reason) {
    case "invalid":
      return "could not be checked, so it is blocked";
    case "store-not-active":
      return "has code, and code only runs for plugins from a store that is switched on";
    case "not-approved":
      return "has code, and the platform has not approved running it";
    case "approval-outdated":
      return "was approved for other files than the ones installed now; approve this version to run it";
  }
}
