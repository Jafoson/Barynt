"use client";

import {
  disablePluginInProject,
  enablePluginInProject,
} from "@/features/plugins/projectActions";
import { saveProjectPluginSettings } from "@/features/plugins/settingsActions";
import type { WorkspacePluginsView } from "@/features/plugins/workspacePlugins";
import { LevelPlugins } from "../LevelPlugins/LevelPlugins";
import { PluginsTabs } from "../PluginsTabs/PluginsTabs";

interface Props {
  projectId: string;
  view: WorkspacePluginsView;
  /** This page's address: where the Installed tab points, and the Store tab under it. */
  basePath: string;
}

/**
 * The plugins a project can use: the ones the platform installed that apply per project, and a
 * switch for each ([`LevelPlugins`](../LevelPlugins/LevelPlugins.tsx)). The Installed and Store
 * tabs are there when the platform gave projects the store.
 */
export function ProjectPlugins({ projectId, view, basePath }: Props) {
  return (
    <LevelPlugins
      level="project"
      view={view}
      enable={(pluginId) => enablePluginInProject(projectId, pluginId)}
      disable={(pluginId) => disablePluginInProject(projectId, pluginId)}
      saveSettings={(pluginId, values) =>
        saveProjectPluginSettings(projectId, pluginId, values)
      }
      tabs={
        view.storeAvailable ? (
          <PluginsTabs active="installed" basePath={basePath} />
        ) : undefined
      }
    />
  );
}
