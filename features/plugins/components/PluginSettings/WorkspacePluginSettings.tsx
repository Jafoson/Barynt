"use client";

import { useTranslations } from "next-intl";
import { saveWorkspacePluginSettings } from "@/features/plugins/settingsActions";
import type { SettingsForm } from "@/lib/plugins/settings";
import { PluginSettingsPage } from "./PluginSettingsPage";

interface Props {
  workspaceId: string;
  plugin: { id: string; name: string; description: string; version: string };
  form: SettingsForm;
}

/**
 * A workspace plugin's settings page: [`PluginSettingsPage`](./PluginSettingsPage.tsx) with the
 * workspace's action bound. The page passes the ids and nothing else, so what is saved where is
 * the server's to decide.
 */
export function WorkspacePluginSettings({ workspaceId, plugin, form }: Props) {
  const t = useTranslations();
  return (
    <PluginSettingsPage
      name={plugin.name}
      description={plugin.description}
      version={plugin.version}
      note={t("pluginSettings.pageScope")}
      form={form}
      save={(values) =>
        saveWorkspacePluginSettings(workspaceId, plugin.id, values)
      }
    />
  );
}
