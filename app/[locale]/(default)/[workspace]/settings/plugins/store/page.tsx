import { notFound } from "next/navigation";
import { PluginStore } from "@/features/plugins/components/PluginStore/PluginStore";
import { getWorkspaceStore } from "@/features/plugins/workspaceStoreQueries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import { PermissionError } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * The plugin store for a workspace: the plugins that apply per workspace, to add for the
 * workspace or switch on. Needs `plugin.enable` in this workspace, and the platform having given
 * workspaces the store (`SystemSettings`, open by default); otherwise the page is not there.
 */
export default async function WorkspacePluginStorePage({
  params,
}: {
  params: Promise<{ workspace: string; locale: string }>;
}) {
  const { workspace, locale } = await params;
  setCurrentWorkspaceId(workspace);
  try {
    const store = await getWorkspaceStore(workspace, locale);
    if (!store) notFound();
    return <PluginStore view={store.view} workspace={store.workspace} />;
  } catch (error) {
    if (error instanceof PermissionError) notFound();
    throw error;
  }
}
