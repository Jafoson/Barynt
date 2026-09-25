"use client";

import {
  disablePluginInProject,
  enablePluginInProject,
} from "@/features/plugins/projectActions";
import type { WorkspacePluginsView } from "@/features/plugins/workspacePlugins";
import { pluginSettingsPath } from "@/lib/nav";
import { LevelPlugins } from "../LevelPlugins/LevelPlugins";
import { PluginsTabs } from "../PluginsTabs/PluginsTabs";

interface Props {
  workspaceId: string;
  projectId: string;
  /** The project's address part: where its plugins' settings are (`/<workspace>/plugin/settings/<id>/<slug>`). */
  projectSlug: string;
  view: WorkspacePluginsView;
  /** This page's address: where the Installed tab points, and the Store tab under it. */
  basePath: string;
}

/**
 * The plugins a project can use: the ones the platform installed that apply per project, and a
 * switch for each ([`LevelPlugins`](../LevelPlugins/LevelPlugins.tsx)). The Installed and Store
 * tabs are there when the platform gave projects the store.
 */
export function ProjectPlugins({
  workspaceId,
  projectId,
  projectSlug,
  view,
  basePath,
}: Props) {
  return (
    <LevelPlugins
      level="project"
      view={view}
      enable={(pluginId) => enablePluginInProject(projectId, pluginId)}
      disable={(pluginId) => disablePluginInProject(projectId, pluginId)}
      settingsHref={(pluginId) =>
        pluginSettingsPath(workspaceId, pluginId, projectSlug)
      }
      tabs={
        view.storeAvailable ? (
          <PluginsTabs active="installed" basePath={basePath} />
        ) : undefined
      }
    />
  );
}
