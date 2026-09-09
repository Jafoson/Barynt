import { notFound } from "next/navigation";
import { WorkspaceWebhooks } from "@/features/webhooks/components/WorkspaceWebhooks/WorkspaceWebhooks";
import { getWorkspaceWebhooks } from "@/features/webhooks/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/** Webhook endpoints of the workspace — `webhook.manage` only. */
export default async function WorkspaceWebhooksPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  setCurrentWorkspaceId(workspace);

  const view = await getWorkspaceWebhooks(workspace);
  if (!view) notFound();

  return <WorkspaceWebhooks {...view} workspaceId={workspace} />;
}
