import { notFound, redirect } from "next/navigation";
import { passkeyLoginEnabled } from "@/auth.config";
import { AppShell } from "@/components/ui/layout/AppShell/AppShell";
import { getMySecurity } from "@/features/account/queries";
import { PasskeyNudge } from "@/features/auth/components/PasskeyNudge/PasskeyNudge";
import { GlobalUpdateBanner } from "@/features/issues/components/UpdateBanner/GlobalUpdateBanner";
import { getCurrentWorkspace } from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import { accountPath } from "@/lib/nav";
import { canEnterWorkspace } from "@/lib/permissions";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace: workspaceId } = await params;

  // Store the active workspace ID request-scoped so nested Server Components
  // can read it via getCurrentWorkspace() (analogous to the session).
  setCurrentWorkspaceId(workspaceId);

  const session = await getSession();
  if (!session) redirect(`/${locale}/login`);

  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();

  // A valid session isn't admission by itself: the workspace ID is in the URL,
  // so any signed-in person could type someone else's slug. `notFound` instead
  // of a redirect, so the workspace's existence doesn't reveal who's in it.
  // The queries below additionally check for themselves — this layout only
  // protects the pages beneath it.
  if (!(await canEnterWorkspace(session.userId, workspace.id))) notFound();

  const security = await getMySecurity();

  return (
    <AppShell>
      {passkeyLoginEnabled && security && security.passkeys.length === 0 && (
        <PasskeyNudge securityHref={accountPath(workspaceId, "security")} />
      )}
      <GlobalUpdateBanner workspaceId={workspace.id} />
      {children}
    </AppShell>
  );
}
