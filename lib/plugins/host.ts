import "server-only";
import { SDK_VERSION } from "@barynt/plugin-sdk";
import { cache } from "react";
import { db } from "@/lib/db";
import { BARYNT_VERSION } from "@/lib/version";
import { discoverPlugins, pluginsDirSetting } from "./discovery";
import { loadPlugins } from "./loader";
import {
  type ActivePlugin,
  activePluginsIn,
  createPluginRegistry,
  type PluginRegistry,
  type RegistryDeps,
} from "./registry";
import { getRegistryState } from "./registryState";
import { createHostServices } from "./services";
import { getActiveStoreUrls } from "./stores";
import { getAllowUnsignedPlugins } from "./unsigned";

// The registry as the app uses it: the real database, the real disk, the real
// loader and services wired into `createPluginRegistry` (registry.ts), and its
// state kept on `global` (registryState.ts) so every bundled copy of this module
// sees the same one.

const deps: RegistryDeps = {
  pluginsDir: () => pluginsDirSetting(),
  installed: async () => {
    const [rows, enabled] = await Promise.all([
      db.plugin.findMany({
        select: {
          id: true,
          version: true,
          status: true,
          source: true,
          scope: true,
          origin: true,
          integrity: true,
        },
      }),
      db.pluginWorkspace.findMany({
        where: { enabled: true },
        select: { pluginId: true },
        distinct: ["pluginId"],
      }),
    ]);
    return {
      // Nothing records an approval to run code in the process yet (BARY-122),
      // so no plugin with code is approved and none runs there.
      plugins: rows.map((row) => ({ ...row, codeApprovalHash: null })),
      enabledSomewhere: new Set(enabled.map((row) => row.pluginId)),
    };
  },
  discover: discoverPlugins,
  activeStores: getActiveStoreUrls,
  allowUnsigned: getAllowUnsignedPlugins,
  load: loadPlugins,
  host: { barynt: BARYNT_VERSION, sdk: SDK_VERSION },
  services: createHostServices,
  now: () => Date.now(),
  log: (message) => console.error(`[plugins] ${message}`),
};

/** The registry of this process. What a page needs is `getActivePlugins`. */
export function getPluginRegistry(): PluginRegistry {
  return createPluginRegistry(deps, getRegistryState());
}

/**
 * Starts the plugins: reads what is installed, loads what may run and boots it.
 * Called once when the server starts (`instrumentation.ts`), so `boot` runs before
 * the first request and outside any. Never throws, and does not wait for the
 * plugins that load slowly: the app is up either way.
 */
export function startPluginRegistry(): Promise<void> {
  return getPluginRegistry().start();
}

/**
 * The plugins that apply in a workspace, once per request: every platform plugin
 * that is running and each workspace plugin that is running and switched on
 * there. Waits for the registry if it is still building. Fails closed: if the
 * workspace's settings cannot be read, no plugin applies.
 *
 * It does not ask whether the signed-in user may see the workspace: like the other
 * queries that take a workspace id, it leaves that to the caller, which is the
 * workspace layout (`canEnterWorkspace`) for anything rendered under it.
 */
export const getActivePlugins = cache(
  async (workspaceId: string): Promise<ActivePlugin[]> => {
    try {
      const snapshot = await getPluginRegistry().get();
      if (snapshot.active.length === 0) return [];
      const rows = await db.pluginWorkspace.findMany({
        where: { workspaceId, enabled: true },
        select: { pluginId: true },
      });
      return activePluginsIn(snapshot, new Set(rows.map((r) => r.pluginId)));
    } catch (error) {
      console.error(
        "[plugins] The plugins of a workspace could not be read, so none apply:",
        error instanceof Error ? error.message : String(error),
      );
      return [];
    }
  },
);
