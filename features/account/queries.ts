import "server-only";
import { cache } from "react";
import { enabledOAuthProviders, oidcProviderName } from "@/auth.config";
import { DEFAULT_BEHAVIOR, toBehavior } from "@/features/account/preferences";
import type {
  AccountConnectionsView,
  AccountProfileView,
  AccountSecurityView,
  ApiKeysView,
  Preferences,
} from "@/features/account/types";
import type { ApiScope } from "@/lib/api/scopes";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { resolveAvatarUrl } from "@/lib/storage";

// Everything here applies to exactly one person: whoever is logged in. There is
// no "which user" parameter — reading someone else's account would create a
// possibility that shouldn't exist. As everywhere, `null` means "doesn't exist
// for you", and the pages turn that into a 404.
//
// Deduplicated per request via `cache()`, as in `features/workspaces/queries`.

/** The generic OIDC provider's id — its name comes from `AUTH_OIDC_NAME`
 *  instead of the brand list in `lib/auth-providers/meta.ts`. */
export const OIDC_PROVIDER_ID = "oidc";

/** What applies as long as nobody has set anything. Same values as the
 *  `@default`s in `prisma/schema.prisma`. */
export const DEFAULT_PREFERENCES: Preferences = {
  ...DEFAULT_BEHAVIOR,
  theme: "dark",
  adminNoticeHidden: false,
  assignedInApp: true,
  assignedEmail: true,
  mentionedInApp: true,
  mentionedEmail: true,
  commentInApp: true,
  commentEmail: false,
  commentReplyInApp: true,
  commentReplyEmail: true,
  statusInApp: true,
  statusEmail: false,
  inviteInApp: true,
  inviteEmail: true,
  roleInApp: true,
  roleEmail: true,
  issueSharedInApp: true,
  issueSharedEmail: true,
};

/**
 * Your own preferences — for anyone logged in, even without a row in the
 * table.
 *
 * The row only comes into existence on first save. Anyone who has never set
 * anything gets the defaults here; the UI doesn't need to know the
 * difference and never has to render an empty state.
 */
export const getMyPreferences = cache(async (): Promise<Preferences> => {
  const session = await getSession();
  if (!session) return DEFAULT_PREFERENCES;

  const row = await db.userPreferences.findUnique({
    where: { userId: session.userId },
  });
  if (!row) return DEFAULT_PREFERENCES;

  // Everything that isn't a notification is pulled out individually — what
  // remains is exactly the toggles from `NotificationSettings`. A new column
  // not listed here would otherwise silently end up in there.
  const {
    userId: _userId,
    theme,
    adminNoticeHidden,
    projectLanding,
    startPage,
    startViewId,
    issueOpenMode,
    issuePageOpenMode,
    defaultGrouping,
    defaultSort,
    defaultShowSubIssues,
    sidebarCollapsed,
    projectOrder,
    dateFormat,
    weekStart,
    timeZone,
    shortcutOverrides,
    confirmDestructive,
    listColumnWidths,
    ...notifications
  } = row;
  return {
    ...notifications,
    ...toBehavior({
      projectLanding,
      startPage,
      startViewId,
      issueOpenMode,
      issuePageOpenMode,
      defaultGrouping,
      defaultSort,
      defaultShowSubIssues,
      sidebarCollapsed,
      projectOrder,
      dateFormat,
      weekStart,
      timeZone,
      shortcutOverrides,
      confirmDestructive,
      listColumnWidths,
    }),
    theme: theme as Preferences["theme"],
    adminNoticeHidden,
  };
});

/** Core data of your own account. */
export const getMyProfile = cache(
  async (): Promise<AccountProfileView | null> => {
    const session = await getSession();
    if (!session) return null;

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        handle: true,
        email: true,
        color: true,
        emailVerified: true,
        avatarKey: true,
      },
    });
    if (!user) return null;

    const { avatarKey, ...rest } = user;
    return {
      ...rest,
      emailVerified: user.emailVerified !== null,
      avatarUrl: await resolveAvatarUrl(avatarKey),
    };
  },
);

/** What you sign in with: passkeys, address, third-party providers. */
export const getMySecurity = cache(
  async (): Promise<AccountSecurityView | null> => {
    const session = await getSession();
    if (!session) return null;

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        email: true,
        emailVerified: true,
        accounts: { select: { provider: true } },
        authenticators: {
          select: {
            credentialID: true,
            credentialDeviceType: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!user) return null;

    return {
      email: user.email,
      emailVerified: user.emailVerified !== null,
      connectedProviders: user.accounts.map((a) => a.provider),
      passkeys: user.authenticators.map((a) => ({
        credentialID: a.credentialID,
        deviceType: a.credentialDeviceType,
        createdAt: a.createdAt,
      })),
    };
  },
);

/** This account's personal API keys, revoked ones included — shown as
 *  revoked rather than dropped, so a key that's no longer usable doesn't
 *  just silently disappear from the record. */
export const getMyApiKeys = cache(async (): Promise<ApiKeysView | null> => {
  const session = await getSession();
  if (!session) return null;

  const rows = await db.apiKey.findMany({
    where: { userId: session.userId },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    keys: rows.map((row) => ({ ...row, scopes: row.scopes as ApiScope[] })),
  };
});

/** This account's third-party sign-in methods. */
export const getMyConnections = cache(
  async (): Promise<AccountConnectionsView | null> => {
    const session = await getSession();
    if (!session) return null;

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        accounts: { select: { provider: true } },
        authenticators: { select: { credentialID: true } },
      },
    });
    if (!user) return null;

    const connected = new Set(user.accounts.map((a) => a.provider));

    // Only the providers set up in `auth.config.ts` get a row — if none are,
    // there's neither a row nor the "Connected accounts" tab at all (see
    // `account/layout.tsx` and `account/connections/page.tsx`).
    return {
      accounts: enabledOAuthProviders.map((provider) => ({
        provider,
        connected: connected.has(provider),
        ...(provider === OIDC_PROVIDER_ID ? { label: oidcProviderName } : {}),
      })),
      hasPasskey: user.authenticators.length > 0,
    };
  },
);
