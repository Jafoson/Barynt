import { isIntegrityHash } from "./hashFormat";
import type { PluginManifest } from "./manifest";

// Who may run plugin code in the app's process. Plugin code that runs there has
// the power of the whole app (docs/plugins/security.md), so the rule is strict
// and closed: **code runs in-process only for a plugin from the official store
// that the platform has approved, for the exact files it has now.** Everything
// else with code is blocked, whatever else is true of it. A plugin without code
// runs, because nothing of it does.
//
// Pure logic on plain values, no database and no `server-only`: the registry
// asks it for every installed plugin and hands the loader only those it lets
// through. Wherever a value is missing, unknown or malformed the answer is
// "blocked", never "allowed".

/**
 * The official store. Only this address counts as official. It is a constant on
 * purpose and not a setting: what may run with the full power of the app should
 * not depend on an environment variable. If the store moves, this changes in code.
 */
export const OFFICIAL_STORE_URL =
  "https://github.com/Jafoson/barynt-plugin-store";

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

/** Is this the official store? Anything that is not clearly so is not. */
export function isOfficialStore(origin: unknown): boolean {
  const official = normalizeStoreUrl(OFFICIAL_STORE_URL);
  const given = normalizeStoreUrl(origin);
  return official !== null && given !== null && given === official;
}

export type BlockedReason =
  /** The input is missing or malformed, so it cannot be known whether the plugin has code. */
  | "invalid"
  /** It has code, and code only runs for plugins from the official store. */
  | "not-official-store"
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
 * 2. not from the official store (source is not `STORE`, or the store is not the
 *    official one): blocked.
 * 3. no valid hash on record, or no approval: blocked, not approved.
 * 4. the approval is for another hash than the installed one: blocked, outdated.
 * 5. otherwise in-process.
 *
 * It never throws.
 */
export function decideExecution(input: ExecutionInput): ExecutionDecision {
  try {
    return decide(input);
  } catch {
    // A getter that throws, or anything else nobody expected: not allowed.
    return { mode: "blocked", reason: "invalid" };
  }
}

function decide(input: ExecutionInput): ExecutionDecision {
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

  if (input.source !== "STORE" || !isOfficialStore(input.origin)) {
    return { mode: "blocked", reason: "not-official-store" };
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
    case "not-official-store":
      return "has code, and code only runs for plugins from the official store";
    case "not-approved":
      return "has code, and the platform has not approved running it";
    case "approval-outdated":
      return "was approved for other files than the ones installed now; approve this version to run it";
  }
}
