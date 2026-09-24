import type {
  HostInfo,
  PluginInfo,
  PluginWorkspace,
  UninstallContext,
  WorkspaceLifecycleContext,
} from "@barynt/plugin-sdk";
import { describe, type PluginHooks, withTimeout } from "./loader";

// Runs a plugin's lifecycle hooks (`onEnable`, `onDisable`, `onUninstall`). Like
// the loader it never throws: a hook is plugin code, and whatever it does is
// caught and given back as an outcome the caller decides on (`onEnable` refuses,
// the other two only warn). A hook that never returns is waited for only so long;
// JavaScript cannot stop it.
//
// Only a plugin that is loaded in the process has hooks (the registry gives them
// with `ActivePlugin.hooks`), so a hook does not run for a plugin the platform did
// not approve, or one that no workspace has switched on: code that is not running
// is not woken up for a lifecycle event.

/** How long a hook may take. The same as `boot`. */
export const HOOK_TIMEOUT_MS = 30_000;

export type HookName = keyof PluginHooks;

export type HookOutcome =
  /** The plugin is not running in the process, or does not have this hook. */
  | { ran: false }
  | { ran: true; ok: true }
  /** It threw, rejected, or took too long. `message` is one short line. */
  | { ran: true; ok: false; message: string };

/**
 * Runs the hook `name` of `plugin` with `context`. `plugin` is the running plugin,
 * or `undefined` if it is not running.
 */
export async function runHook(
  plugin: { hooks: PluginHooks } | undefined,
  name: HookName,
  context: WorkspaceLifecycleContext | UninstallContext,
  timeoutMs: number = HOOK_TIMEOUT_MS,
): Promise<HookOutcome> {
  const hook = plugin?.hooks[name] as
    | ((context: unknown) => void | Promise<void>)
    | undefined;
  if (!hook) return { ran: false };
  try {
    // A hook that throws at once is caught here, one that rejects by the timeout.
    await withTimeout(Promise.resolve(hook(context)), timeoutMs, name);
    return { ran: true, ok: true };
  } catch (error) {
    return { ran: true, ok: false, message: describe(error) };
  }
}

const frozen = <T extends object>(value: T): Readonly<T> =>
  Object.freeze({ ...value });

/** What `onEnable` and `onDisable` get. Copies, so a hook cannot change what the host holds. */
export function workspaceHookContext(
  plugin: PluginInfo,
  host: HostInfo,
  workspace: PluginWorkspace,
): WorkspaceLifecycleContext {
  return Object.freeze({
    plugin: frozen(plugin),
    host: frozen(host),
    workspace: frozen(workspace),
  });
}

/** What `onUninstall` gets. */
export function uninstallHookContext(
  plugin: PluginInfo,
  host: HostInfo,
): UninstallContext {
  return Object.freeze({ plugin: frozen(plugin), host: frozen(host) });
}
