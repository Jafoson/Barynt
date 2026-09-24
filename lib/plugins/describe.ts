import type { BlockedReason } from "./policy";
import type { PluginStatus } from "./registry";
import { describeProblem } from "./resolve";

// English text for what became of a plugin, for the sentences an action gives
// back to an admin. The admin page builds its own, translated, from the same
// codes; this is what a caller that has no page gets. Pure: no database, no disk.

/** Why the policy does not let a plugin run, as a sentence. */
export function describeBlocked(reason: BlockedReason): string {
  switch (reason) {
    case "invalid":
      return "Its files could not be checked.";
    case "unsigned-not-allowed":
      return "It comes from no store, and the platform has not allowed plugins from no store.";
    case "unsigned-code":
      return "It comes from no store and has code, and code from no store does not run in the app.";
    case "store-not-active":
      return "It has code and comes from a store that is not switched on.";
    case "not-approved":
      return "The platform has not approved its code to run.";
    case "approval-outdated":
      return "The platform approved the code of another version. This version has to be approved on its own.";
  }
}

/** What became of a plugin in the registry, as a sentence. `undefined` is a plugin the registry does not list. */
export function describeStatus(status: PluginStatus | undefined): string {
  if (!status) return "The registry does not know it.";
  switch (status.state) {
    case "loaded":
      return "It is running.";
    case "disabled":
      return "The platform has switched it off.";
    case "idle":
      return "No workspace has it switched on.";
    case "missing":
      return "Its files are not in the plugin directory.";
    case "invalid":
      return `Its manifest is not valid: ${status.issues.join("; ")}.`;
    case "incompatible":
      return `The plugin ${status.problems.map(describeProblem).join("; ")}.`;
    case "blocked":
      return describeBlocked(status.reason);
    case "failed":
      return `It failed to load (${status.phase}): ${status.message}`;
  }
}
