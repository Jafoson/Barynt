"use client";

import { useTranslations } from "next-intl";
import { saveProjectPluginSettings } from "@/features/plugins/settingsActions";
import { pluginSettingsPath } from "@/lib/nav";
import type { SettingsForm } from "@/lib/plugins/settings";
import { PluginSettingsPage } from "./PluginSettingsPage";

interface Props {
  workspaceId: string;
  plugin: { id: string; name: string; description: string; version: string };
  project: { id: string; name: string };
  form: SettingsForm;
}

/**
 * A plugin's settings in one project, as a page of the plugins' settings:
 * [`PluginSettingsPage`](./PluginSettingsPage.tsx) with the project's action bound, and a way back
 * to the projects the plugin can be set up in. The page passes the ids and nothing else, so what
 * is saved where is the server's to decide.
 */
export function ProjectPluginSettings({
  workspaceId,
  plugin,
  project,
  form,
}: Props) {
  const t = useTranslations();
  return (
    <PluginSettingsPage
      name={plugin.name}
      description={plugin.description}
      version={plugin.version}
      note={t("pluginSettings.pageScopeProject", { project: project.name })}
      back={{
        href: pluginSettingsPath(workspaceId, plugin.id),
        label: t("pluginSettings.allProjects"),
      }}
      form={form}
      save={(values) =>
        saveProjectPluginSettings(project.id, plugin.id, values)
      }
    />
  );
}
