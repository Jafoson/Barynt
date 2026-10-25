import { cookies } from "next/headers";
import { auth } from "@/auth";
import type { PersonAvatarData } from "@/components/ui/atoms/Avatar/Avatar";
import { getUnreadNotificationCount } from "@/features/notifications/queries";
import { SEEN_RELEASE_COOKIE } from "@/features/releases/constants";
import { getMyWorkspaces } from "@/features/workspaces/queries";
import { APP_VERSION, GITHUB_URL } from "@/lib/app-info";
import { getCurrentWorkspaceId } from "@/lib/current-workspace";
import { db } from "@/lib/db";
import { accountPath, adminPath, workspacePath } from "@/lib/nav";
import { getAccess, PLATFORM } from "@/lib/permissions";
import { listReleaseVersions } from "@/lib/releases";
import { resolveAvatarUrl } from "@/lib/storage";
import { getAvailableUpdate } from "@/lib/update-check";
import UserMenuClient from "./UserMenuClient";

export async function UserMenu() {
  const session = await auth();
  let me: PersonAvatarData;

  if (!session?.user) {
    me = { firstName: "", lastName: "", color: "var(--secondary)" };
  } else {
    // `handle` isn't in the token (see `global.d.ts`) — name and handle are
    // both optional (`features/onboarding`), and a fresh account with
    // neither needs the username as the only reliably available display value.
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { handle: true, avatarKey: true },
    });
    me = {
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      color: session.user.color || "var(--primary)",
      handle: user?.handle,
      image: (await resolveAvatarUrl(user?.avatarKey)) ?? undefined,
    };
  }

  // Account settings live under a workspace — they need the shell around
  // them (sidebar, tabs, back path), not that workspace's data. In the
  // admin area there is no active workspace; then the entry leads into the
  // first one the user is in. Whoever isn't in any workspace at all doesn't
  // get the entry — a link into nowhere is worse than no link.
  const workspaceId =
    getCurrentWorkspaceId() ?? (await getMyWorkspaces())[0]?.id ?? null;

  const unreadCount = workspaceId
    ? await getUnreadNotificationCount(workspaceId)
    : 0;

  // The path into platform administration — only for those who carry
  // `platform.access`. For everyone else it doesn't exist: the layout
  // under `/admin` responds to a request without this permission with
  // `notFound`, so the mere existence of the section doesn't reveal who is
  // allowed to open it. A visible entry leading to nothing would be
  // exactly that leak.
  const access = await getAccess(PLATFORM);
  const adminHref = access.has("platform.access") ? adminPath("") : null;

  // Only for those who can act on it, like the admin entry above.
  const update = adminHref ? await getAvailableUpdate() : null;

  // The release notes up to the running version. The window opens on its own
  // when the running version has notes this browser hasn't seen yet.
  const releaseVersions = await listReleaseVersions(APP_VERSION);
  const seenRelease = (await cookies()).get(SEEN_RELEASE_COOKIE)?.value;
  const showReleaseNotes =
    releaseVersions.includes(APP_VERSION) && seenRelease !== APP_VERSION;

  return (
    <UserMenuClient
      me={me}
      settingsHref={workspaceId ? accountPath(workspaceId, "") : null}
      inboxHref={workspaceId ? workspacePath(workspaceId, "inbox") : null}
      adminHref={adminHref}
      unreadCount={unreadCount}
      version={APP_VERSION}
      githubUrl={GITHUB_URL}
      update={update}
      releaseVersions={releaseVersions}
      showReleaseNotes={showReleaseNotes}
    />
  );
}
