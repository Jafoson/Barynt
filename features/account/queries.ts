import "server-only";
import { cache } from "react";
import { enabledOAuthProviders, oidcProviderName } from "@/auth.config";
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

/**
 * All known OAuth providers — the brand list from which `getMyConnections`
 * selects the ones actually set up (`enabledOAuthProviders`).
 *
 * Being listed here doesn't mean it's configured: the row only appears once
 * `auth.config.ts` finds the corresponding env vars set. If none are set up,
 * there's neither a row nor the "Connected accounts" tab at all (see
 * `account/layout.tsx` and `account/connections/page.tsx`).
 */
export const OAUTH_PROVIDERS = [
  "github",
  "google",
  "gitlab",
  "microsoft-entra-id",
  "apple",
] as const;

/** OIDC isn't part of the fixed list above — its name only comes from
 *  `AUTH_OIDC_NAME`, so there's nothing meaningful to display until it's
 *  configured. */
export const OIDC_PROVIDER_ID = "oidc";

/** What applies as long as nobody has set anything. Same values as the
 *  `@default`s in `prisma/schema.prisma`. */
export const DEFAULT_PREFERENCES: Preferences = {
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
  const { userId: _userId, theme, adminNoticeHidden, ...notifications } = row;
  return {
    ...notifications,
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
    const oidcEnabled = enabledOAuthProviders.includes(OIDC_PROVIDER_ID);

    return {
      accounts: [
        ...OAUTH_PROVIDERS.filter((provider) =>
          enabledOAuthProviders.includes(provider),
        ).map((provider) => ({
          provider,
          connected: connected.has(provider),
        })),
        ...(oidcEnabled
          ? [
              {
                provider: OIDC_PROVIDER_ID,
                connected: connected.has(OIDC_PROVIDER_ID),
                label: oidcProviderName,
              },
            ]
          : []),
      ],
      hasPasskey: user.authenticators.length > 0,
    };
  },
);
