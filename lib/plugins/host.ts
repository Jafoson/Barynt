import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { discoverPlugins, pluginsDirSetting } from "./discovery";
import { HOST_INFO } from "./hostInfo";
import { loadPlugins } from "./loader";
import {
  type ActivePlugin,
  activePluginsIn,
  activePluginsInProject,
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
    const [rows, inWorkspaces, inProjects] = await Promise.all([
      db.plugin.findMany({
        select: {
          id: true,
          version: true,
          status: true,
          source: true,
          scope: true,
          origin: true,
          integrity: true,
          codeApprovalHash: true,
        },
      }),
      // A workspace's row counts for a plugin that applies per workspace, and a
      // project's for one that applies per project: a stray row of the other kind
      // (there is none, the actions refuse it) would not get a plugin loaded.
      db.pluginWorkspace.findMany({
        where: { enabled: true, plugin: { scope: "WORKSPACE" } },
        select: { pluginId: true },
        distinct: ["pluginId"],
      }),
      db.pluginProject.findMany({
        where: { enabled: true, plugin: { scope: "PROJECT" } },
        select: { pluginId: true },
        distinct: ["pluginId"],
      }),
    ]);
    return {
      // The approval to run code in the process, for the exact hash: without one a
      // plugin with code does not run there (`features/plugins/actions.ts`).
      plugins: rows,
      enabledSomewhere: new Set(
        [...inWorkspaces, ...inProjects].map((row) => row.pluginId),
      ),
    };
  },
  discover: discoverPlugins,
  activeStores: getActiveStoreUrls,
  allowUnsigned: getAllowUnsignedPlugins,
  load: loadPlugins,
  host: HOST_INFO,
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

/**
 * The plugins that apply in a project, once per request: every platform plugin that is
 * running, each workspace plugin that is running and switched on in the project's
 * workspace, and each project plugin that is running and switched on in the project.
 * Waits for the registry if it is still building. Fails closed: if the settings cannot
 * be read, or the project is not there, no plugin applies.
 *
 * Like `getActivePlugins` it does not ask whether the signed-in user may see the project:
 * that is the caller's, which is the project's layout for anything rendered under it.
 */
export const getActivePluginsInProject = cache(
  async (projectId: string): Promise<ActivePlugin[]> => {
    try {
      const snapshot = await getPluginRegistry().get();
      if (snapshot.active.length === 0) return [];
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { workspaceId: true },
      });
      if (!project) return [];
      const [inWorkspace, inProject] = await Promise.all([
        db.pluginWorkspace.findMany({
          where: { workspaceId: project.workspaceId, enabled: true },
          select: { pluginId: true },
        }),
        db.pluginProject.findMany({
          where: { projectId, enabled: true },
          select: { pluginId: true },
        }),
      ]);
      return activePluginsInProject(
        snapshot,
        new Set(inWorkspace.map((r) => r.pluginId)),
        new Set(inProject.map((r) => r.pluginId)),
      );
    } catch (error) {
      console.error(
        "[plugins] The plugins of a project could not be read, so none apply:",
        error instanceof Error ? error.message : String(error),
      );
      return [];
    }
  },
);
