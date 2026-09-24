import { notFound } from "next/navigation";
import { WorkspacePlugins } from "@/features/plugins/components/WorkspacePlugins/WorkspacePlugins";
import { getWorkspacePlugins } from "@/features/plugins/workspaceQueries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import { PermissionError } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * The plugins of a workspace: which of the platform's plugins it switches on. Needs
 * `plugin.enable` in this workspace; the query asks for it itself, a layout protects nothing.
 */
export default async function WorkspacePluginsPage({
  params,
}: {
  params: Promise<{ workspace: string; locale: string }>;
}) {
  const { workspace, locale } = await params;
  setCurrentWorkspaceId(workspace);
  try {
    const view = await getWorkspacePlugins(workspace, locale);
    return <WorkspacePlugins workspaceId={workspace} view={view} />;
  } catch (error) {
    // Whoever may not is told the page is not there, like on the other settings pages.
    if (error instanceof PermissionError) notFound();
    throw error;
  }
}
