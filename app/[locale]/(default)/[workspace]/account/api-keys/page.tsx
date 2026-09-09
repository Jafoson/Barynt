import { notFound } from "next/navigation";
import { AccountApiKeys } from "@/features/account/components/AccountApiKeys/AccountApiKeys";
import { getMyApiKeys } from "@/features/account/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/** Personal access tokens for the public REST API (`app/api/v1`). */
export default async function AccountApiKeysPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  setCurrentWorkspaceId(workspace);

  const view = await getMyApiKeys();
  if (!view) notFound();

  return <AccountApiKeys {...view} />;
}
