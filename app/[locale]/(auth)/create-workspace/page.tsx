import { redirect } from "next/navigation";
import { CreateWorkspaceForm } from "@/features/workspaces/components/CreateWorkspaceForm/CreateWorkspaceForm";
import { canCreateWorkspace, getSystemSettings } from "@/lib/system-settings";

export default async function CreateWorkspacePage() {
  // Locale-free path — the client navigates via next-intl (auto-prefix), same
  // convention as the redirects in `createWorkspace()`.
  if (!canCreateWorkspace(await getSystemSettings())) redirect("/");
  return <CreateWorkspaceForm />;
}
