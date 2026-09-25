"use client";

import { saveWorkspacePluginSettings } from "@/features/plugins/settingsActions";
import {
  disablePlugin,
  enablePlugin,
} from "@/features/plugins/workspaceActions";
import type { WorkspacePluginsView } from "@/features/plugins/workspacePlugins";
import { LevelPlugins } from "../LevelPlugins/LevelPlugins";
import { PluginsTabs } from "../PluginsTabs/PluginsTabs";

interface Props {
  workspaceId: string;
  view: WorkspacePluginsView;
}

/**
 * The plugins a workspace can use: the ones the platform installed that apply per workspace,
 * and a switch for each ([`LevelPlugins`](../LevelPlugins/LevelPlugins.tsx)). The Installed and
 * Store tabs are there when the platform gave workspaces the store.
 */
export function WorkspacePlugins({ workspaceId, view }: Props) {
  return (
    <LevelPlugins
      level="workspace"
      view={view}
      enable={(pluginId) => enablePlugin(workspaceId, pluginId)}
      disable={(pluginId) => disablePlugin(workspaceId, pluginId)}
      saveSettings={(pluginId, values) =>
        saveWorkspacePluginSettings(workspaceId, pluginId, values)
      }
      tabs={
        view.storeAvailable ? (
          <PluginsTabs active="installed" workspaceId={workspaceId} />
        ) : undefined
      }
    />
  );
}
