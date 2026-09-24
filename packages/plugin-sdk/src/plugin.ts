import type {
  BootContext,
  RegistrationContext,
  UninstallContext,
  WorkspaceLifecycleContext,
} from "./context";

/**
 * What a plugin's server module exports as its default: two optional phases and
 * three optional lifecycle hooks.
 *
 * The hooks run only for a plugin that is loaded in the app's process, and they
 * can run more than once (a plugin is switched on and off again), so they have to
 * be safe to repeat. There is no `onInstall` and no `onUpdate`: the code of a
 * plugin that was just installed or updated is not approved to run yet.
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
  /**
   * A workspace has switched the plugin on. Throwing, or taking longer than the
   * host waits, **refuses** it: the plugin is not switched on, and the admin is
   * told why. Only for plugins that apply per workspace.
   */
  onEnable?(ctx: WorkspaceLifecycleContext): void | Promise<void>;
  /**
   * A workspace has switched the plugin off. It cannot refuse: the plugin is off
   * either way, and a failure is reported to the admin as a warning.
   */
  onDisable?(ctx: WorkspaceLifecycleContext): void | Promise<void>;
  /**
   * The plugin was removed from the platform. It cannot refuse either. What the
   * plugin stored is not the host's to delete yet (BARY-85).
   */
  onUninstall?(ctx: UninstallContext): void | Promise<void>;
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
