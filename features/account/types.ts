// The views of your own settings. Each one is exactly what a single page
// renders.
//
// Permissions don't come up here: everyone sees only their own account, so
// there's nothing to decide besides who's logged in. What the pages need
// instead is the state of the account — which passkeys and sign-in methods
// are attached to it, whether the address has been verified.

import type { ApiScope } from "@/lib/api/scopes";

/** The chosen theme — lands as `data-theme` on the document. */
export type Theme = "dark" | "light" | "system";

/** The occasions on which the app sends word of itself. */
export const NOTIFICATION_EVENTS = [
  "assigned",
  "mentioned",
  "comment",
  "commentReply",
  "status",
  "invite",
  "role",
  "issueShared",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/** The channels through which it does so. */
export const NOTIFICATION_CHANNELS = ["InApp", "Email"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** A table column name: `assignedInApp`, `commentEmail`, … */
export type NotificationKey = `${NotificationEvent}${NotificationChannel}`;

export type NotificationSettings = Record<NotificationKey, boolean>;

/** What someone has set for themselves — with the defaults if nothing yet. */
export interface Preferences extends NotificationSettings {
  theme: Theme;
  /** Whether the notice in the platform area has been dismissed. */
  adminNoticeHidden: boolean;
}

/** General: who you are and how you appear. */
export interface AccountProfileView {
  id: string;
  firstName: string;
  lastName: string;
  handle: string;
  /** Passkey accounts can exist with no address at all — then `null`, until
   *  the person adds one themselves (`account.actions#setEmail`). */
  email: string | null;
  color: string;
  avatarUrl: string | null;
  /** The address is verified. Without mail sending, this stays open — the
   *  page says so instead of hiding it. */
  emailVerified: boolean;
}

/** A sign-in method via a third-party provider. */
export interface ConnectedAccount {
  provider: string;
  /** Attached to the account — detachable as long as another method remains. */
  connected: boolean;
  /** Only set for OIDC — its name comes from `AUTH_OIDC_NAME`, not from a
   *  fixed brand list like GitHub/Google. */
  label?: string;
}

export interface AccountConnectionsView {
  accounts: ConnectedAccount[];
  /** A passkey is attached to the account — then no third-party provider is
   *  needed. */
  hasPasskey: boolean;
}

/** A registered passkey. */
export interface PasskeyInfo {
  credentialID: string;
  deviceType: string;
  createdAt: Date;
}

/** Security: what you get in with. */
export interface AccountSecurityView {
  email: string | null;
  emailVerified: boolean;
  /** Providers you can sign in with — for linking there. */
  connectedProviders: string[];
  passkeys: PasskeyInfo[];
}

/** A personal API key for the public REST API (`app/api/v1`). Never carries
 *  the raw token — that's only ever returned once, at creation. */
export interface ApiKeyInfo {
  id: string;
  name: string;
  /** First ~12 chars of the raw token, for the masked list display. */
  prefix: string;
  /** Jira-style "resource:action" scopes (`lib/api/scopes.ts`). */
  scopes: ApiScope[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  /** Set = revoked, shown in the list as such rather than dropped from it —
   *  otherwise a revoked key would just vanish with no record of it. */
  revokedAt: Date | null;
}

export interface ApiKeysView {
  keys: ApiKeyInfo[];
}
