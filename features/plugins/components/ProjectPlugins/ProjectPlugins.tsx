"use client";

import {
  disablePluginInProject,
  enablePluginInProject,
} from "@/features/plugins/projectActions";
import type { WorkspacePluginsView } from "@/features/plugins/workspacePlugins";
import { LevelPlugins } from "../LevelPlugins/LevelPlugins";

interface Props {
  projectId: string;
  view: WorkspacePluginsView;
}

/**
 * The plugins a project can use: the ones the platform installed that apply per project, and a
 * switch for each ([`LevelPlugins`](../LevelPlugins/LevelPlugins.tsx)).
 */
export function ProjectPlugins({ projectId, view }: Props) {
  return (
    <LevelPlugins
      level="project"
      view={view}
      enable={(pluginId) => enablePluginInProject(projectId, pluginId)}
      disable={(pluginId) => disablePluginInProject(projectId, pluginId)}
    />
  );
}
