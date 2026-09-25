import { notFound } from "next/navigation";
import { PluginSettingsOverview } from "@/features/plugins/components/PluginSettingsOverview/PluginSettingsOverview";
import { getPluginSettingsArea } from "@/features/plugins/settingsAreaQueries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/**
 * The start of the plugins' settings: what this workspace has switched on, and the way into each
 * one's settings. Needs `plugin.enable` in the workspace, asked by the query itself; a page for
 * someone who may not is a 404, like the other settings pages.
 */
export default async function PluginSettingsPage({
  params,
}: {
  params: Promise<{ workspace: string; locale: string }>;
}) {
  const { workspace, locale } = await params;
  setCurrentWorkspaceId(workspace);
  const area = await getPluginSettingsArea(workspace, locale);
  if (!area) notFound();
  return <PluginSettingsOverview workspaceId={workspace} area={area} />;
}
