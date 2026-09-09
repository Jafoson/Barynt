import { AccountMcp } from "@/features/account/components/AccountMcp/AccountMcp";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import { accountPath } from "@/lib/nav";

export const dynamic = "force-dynamic";

/** How to connect an AI assistant to this workspace via MCP (`app/api/mcp`). */
export default async function AccountMcpPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  setCurrentWorkspaceId(workspace);

  return <AccountMcp apiKeysHref={accountPath(workspace, "api-keys")} />;
}
