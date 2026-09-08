import {
  getCurrentWorkspace,
  getWorkspaceProjects,
} from "@/features/workspaces/queries";
import { GoToShortcutsClient } from "./GoToShortcutsClient";

// Server Component: resolves the workspace (and its projects, for "["/"]"
// cycling), hands both to the client logic — same split as `TabBar.tsx`,
// which already loads the identical list for the same reason (its own
// switcher). Admin routes have no workspace, so there's nothing to jump
// to; without an active workspace elsewhere (shouldn't happen inside the
// workspace shell), the shortcuts stay silent rather than pointing at a
// route that would 404.
export async function GoToShortcuts({
  isAdminRoute = false,
}: {
  isAdminRoute?: boolean;
}) {
  if (isAdminRoute) return null;

  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const projects = await getWorkspaceProjects();

  return (
    <GoToShortcutsClient
      workspaceId={workspace.id}
      projectSlugs={projects.map((p) => p.slug)}
    />
  );
}
