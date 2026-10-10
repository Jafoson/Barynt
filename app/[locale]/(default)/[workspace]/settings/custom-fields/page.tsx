import { notFound } from "next/navigation";
import { CustomFields } from "@/features/custom-fields/components/CustomFields/CustomFields";
import { getCustomFieldsView } from "@/features/custom-fields/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/** The workspace's custom fields — they apply in every project. */
export default async function WorkspaceCustomFieldsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  setCurrentWorkspaceId(workspace);

  const view = await getCustomFieldsView({ workspaceId: workspace });
  if (!view) notFound();

  return (
    <CustomFields
      own={view.own}
      inherited={view.inherited}
      workspaceId={workspace}
    />
  );
}
