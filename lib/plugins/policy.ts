import { isIntegrityHash } from "./hashFormat";
import type { PluginManifest } from "./manifest";
import { normalizeStoreUrl, OFFICIAL_STORE_URL } from "./storeUrl";

// Kept importable from here: the address logic moved to `storeUrl.ts`.
export { normalizeStoreUrl, OFFICIAL_STORE_URL };

// Who may run plugin code in the app's process. Plugin code that runs there has
// the power of the whole app (docs/plugins/security.md), so the rule is strict
// and closed: **code runs in-process only for a plugin from a store the platform
// has switched on that the platform has also approved, for the exact files it has
// now.** Everything else with code is blocked, whatever else is true of it. A
// plugin without code runs, because nothing of it does.
//
// A plugin that comes from no store (an upload, a directory, a repository address
// entered by hand) is "unsigned": nobody has reviewed it. It is not loaded at all
// unless the platform has allowed such plugins, a setting that is off by default
// and that an admin can only switch on after a warning. Allowing them lets one
// without code run; one with code stays blocked, because unreviewed code does not
// get to run in the app's process, whatever the setting says (BARY-120). It will
// run isolated, in a sandbox or as a service of its own, when those exist.
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

/** The stores that are on until a platform admin changes them. */
export const DEFAULT_ACTIVE_STORES: readonly string[] = [OFFICIAL_STORE_URL];

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
  /** It comes from no store, and the platform has not allowed plugins that do. */
  | "unsigned-not-allowed"
  /** It comes from no store and has code. Allowing such plugins does not let unreviewed code run in the process. */
  | "unsigned-code"
  /** It has code, and it is from a store that is not switched on. */
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

export interface ExecutionOptions {
  /**
   * The platform's setting for plugins from no store. Only the value `true`
   * allows them; anything else, or leaving it out, does not.
   */
  allowUnsigned?: boolean;
}

/**
 * What may become of an installed plugin. Rules, in this order:
 *
 * 0. input that is missing or malformed, or a source that is not text: blocked,
 *    invalid. Not knowing whether a plugin has code is not the same as it
 *    having none.
 * 1. not from a store (`source` is not `STORE`, whatever else it says): blocked,
 *    unsigned, unless `allowUnsigned` is `true`. With it, a plugin without code
 *    is declarative and runs, and one with code is blocked, unsigned code.
 * 2. no `server` and no `client`: declarative, it runs. A value that is there
 *    counts as code, even an empty one.
 * 3. from a store that is not among `activeStores`: blocked.
 * 4. no valid hash on record, or no approval: blocked, not approved.
 * 5. the approval is for another hash than the installed one: blocked, outdated.
 * 6. otherwise in-process.
 *
 * It never throws.
 */
export function decideExecution(
  input: ExecutionInput,
  activeStores: readonly string[],
  options: ExecutionOptions = {},
): ExecutionDecision {
  try {
    return decide(input, activeStores, options);
  } catch {
    // A getter that throws, or anything else nobody expected: not allowed.
    return { mode: "blocked", reason: "invalid" };
  }
}

function decide(
  input: ExecutionInput,
  activeStores: readonly string[],
  options: ExecutionOptions | null | undefined,
): ExecutionDecision {
  const manifest = (input as ExecutionInput | null | undefined)?.manifest;
  if (
    typeof input !== "object" ||
    input === null ||
    typeof manifest !== "object" ||
    manifest === null ||
    typeof input.source !== "string"
  ) {
    return { mode: "blocked", reason: "invalid" };
  }
  const hasCode = manifest.server != null || manifest.client != null;

  // From no store: unreviewed. Only the literal `true` allows these plugins, so a
  // setting that is missing, misread or a text such as "true" never does.
  if (input.source !== "STORE") {
    if (options?.allowUnsigned !== true) {
      return { mode: "blocked", reason: "unsigned-not-allowed" };
    }
    return hasCode
      ? { mode: "blocked", reason: "unsigned-code" }
      : { mode: "declarative" };
  }

  if (!hasCode) return { mode: "declarative" };

  if (!isActiveStore(input.origin, activeStores)) {
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
    case "unsigned-not-allowed":
      return "comes from no store, and the platform has not allowed plugins that do";
    case "unsigned-code":
      return "comes from no store and has code, which stays blocked: unreviewed code does not run in the app's process";
    case "store-not-active":
      return "has code, and code only runs for plugins from a store that is switched on";
    case "not-approved":
      return "has code, and the platform has not approved running it";
    case "approval-outdated":
      return "was approved for other files than the ones installed now; approve this version to run it";
  }
}
