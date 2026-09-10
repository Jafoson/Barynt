import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canCreateWorkspace, getSystemSettings } from "@/lib/system-settings";
import { joinWorkspaceAsMember } from "@/lib/user-provisioning";

export default async function LocaleRootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Locale validation is handled by app/[locale]/layout.tsx (hasLocale → notFound).
  const { locale } = await params;

  const session = await getSession();
  if (!session) redirect(`/${locale}/login`);

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, onboardedAt: true },
  });
  if (!user) redirect(`/api/logout?to=/${locale}/login`);

  // Just signed up themselves (passkey/magic link/OAuth), no account set up
  // yet — invited accounts already had this done at invitation time
  // (`onboardedAt` is set immediately there).
  if (!user.onboardedAt) redirect(`/${locale}/onboarding`);

  const membership = await db.workspaceMember.findFirst({
    where: { userId: session.userId },
    select: { workspaceId: true },
  });

  if (membership) redirect(`/${locale}/${membership.workspaceId}`);

  // No membership, and workspace creation is off with a default configured
  // (`lib/system-settings.ts`) — join that workspace instead of sending the
  // account to a creation form it isn't allowed to use.
  const settings = await getSystemSettings();
  if (!canCreateWorkspace(settings) && settings.defaultWorkspaceId) {
    const defaultWorkspace = await db.workspace.findUnique({
      where: { id: settings.defaultWorkspaceId },
      select: { id: true, suspended: true },
    });
    if (defaultWorkspace && !defaultWorkspace.suspended) {
      await joinWorkspaceAsMember(db, {
        workspaceId: defaultWorkspace.id,
        userId: session.userId,
      });
      redirect(`/${locale}/${defaultWorkspace.id}`);
    }
  }

  redirect(`/${locale}/create-workspace`);
}
