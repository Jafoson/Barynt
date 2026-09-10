import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

export interface SystemSettings {
  allowWorkspaceCreation: boolean;
  defaultWorkspaceId: string | null;
}

/**
 * Platform-wide flags that every authenticated user's request path needs to
 * read — the create-workspace gate and the post-login redirect
 * (`app/[locale]/page.tsx`) — not just the admin settings page. Deliberately
 * **no permission check**: unlike `features/system-settings/queries.ts`
 * (which is the admin-only read for the settings UI), this is a plain
 * runtime flag, the same kind of direct check as `Workspace.suspended` in
 * `lib/permissions.ts`. Writing it is gated in
 * `features/system-settings/actions.ts`.
 *
 * No row yet (fresh install, nobody has touched the setting) falls back to
 * the column defaults — same convention as `MailTemplate` without an
 * override.
 */
export const getSystemSettings = cache(async (): Promise<SystemSettings> => {
  const row = await db.systemSettings.findUnique({ where: { id: 1 } });
  return {
    allowWorkspaceCreation: row?.allowWorkspaceCreation ?? true,
    defaultWorkspaceId: row?.defaultWorkspaceId ?? null,
  };
});

/**
 * Whether creating a new workspace is currently allowed.
 *
 * Not simply `settings.allowWorkspaceCreation`: without a default workspace
 * configured, turning creation off would leave every account without a
 * membership stranded — nowhere to land and no way to make one. Creation
 * therefore stays open until an admin has actually picked a default to fall
 * back to, regardless of the switch's position.
 */
export function canCreateWorkspace(settings: SystemSettings): boolean {
  return settings.allowWorkspaceCreation || !settings.defaultWorkspaceId;
}
