import type { BootContext, RegistrationContext } from "./context";

/**
 * What a plugin's server module exports as its default: two optional phases.
 * The lifecycle hooks (`onInstall`, `onEnable`, …) come with the lifecycle
 * actions (BARY-60).
 */
export interface PluginDefinition {
  /**
   * Declare what the plugin contributes. Synchronous on purpose: it only hands
   * over code, so there is nothing to wait for. The host refuses a `register`
   * that returns a promise.
   */
  register?(ctx: RegistrationContext): void;
  /** Start the plugin's work, after every plugin has registered. */
  boot?(ctx: BootContext): void | Promise<void>;
}

/**
 * Marks the default export of a plugin's server module and checks its shape:
 *
 * ```ts
 * import { definePlugin } from "@barynt/plugin-sdk";
 *
 * export default definePlugin({
 *   register(ctx) {
 *     ctx.registerJob("sync", { … });
 *   },
 * });
 * ```
 *
 * It returns its argument unchanged and touches nothing of the host, so a
 * plugin can bundle this file into its own build without changing how it works.
 */
export function definePlugin(definition: PluginDefinition): PluginDefinition {
  return definition;
}
