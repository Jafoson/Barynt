import { notFound } from "next/navigation";
import { CustomFields } from "@/features/custom-fields/components/CustomFields/CustomFields";
import { getCustomFieldsView } from "@/features/custom-fields/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/**
 * The workspace's custom fields: what every issue in it is asked besides what it has anyway.
 * Needs `customfield.manage` in the workspace (asked by the query itself; a page for someone who
 * may not is a 404). The fields of a single project are managed in that project's settings.
 */
export default async function WorkspaceFieldsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  setCurrentWorkspaceId(workspace);

  const view = await getCustomFieldsView({ workspaceId: workspace });
  if (!view) notFound();

  return <CustomFields view={view} />;
}
