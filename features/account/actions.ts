"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { unstable_update } from "@/auth";
import {
  type BehaviorPreferences,
  DATE_FORMATS,
  GROUP_KEYS,
  ISSUE_OPEN_MODES,
  ISSUE_PAGE_OPEN_MODES,
  isTimeZone,
  PROJECT_LANDINGS,
  PROJECT_ORDERS,
  SORT_KEYS,
  START_PAGES,
  toShortcutOverrides,
  WEEK_STARTS,
} from "@/features/account/preferences";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  type NotificationKey,
  type Theme,
} from "@/features/account/types";
import { sanitizeColumnWidths } from "@/features/issues/list-columns";
import { getVisibleViewById } from "@/features/views/queries";
import { type ApiScope, isApiScope } from "@/lib/api/scopes";
import { hashApiToken } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  deleteAvatarObject,
  finalizeAvatarUpload,
  requestAvatarUpload,
} from "@/lib/storage";
import { isValidEmail } from "@/lib/utils/parse-emails";

// Your own settings don't involve a permission check, only one question: who is
// logged in? Every action operates exclusively on that account — there is
// nowhere a parameter that could target someone else's.
//
// All of them return errors instead of throwing: they're wired to forms that
// need to display the reason.

type Result = { ok: true } | { error: string };

const NOT_LOGGED_IN = "You must be logged in.";

const THEMES: Theme[] = ["dark", "light", "system"];

/** All valid notification column names — a guard against anything else that
 *  might otherwise come in as a string. */
const NOTIFICATION_KEYS = new Set<string>(
  NOTIFICATION_EVENTS.flatMap((event) =>
    NOTIFICATION_CHANNELS.map((channel) => `${event}${channel}`),
  ),
);

/**
 * Writes to your own preferences row, creating it if none exists yet.
 *
 * `upsert` instead of `update`, because the row only comes into existence with
 * the first change (see `features/account/queries.ts`). On creation, anything
 * not named here falls back to the `@default`s from the schema.
 */
async function writePreferences(
  userId: string,
  data: Record<
    string,
    string | boolean | null | Record<string, string> | Record<string, number>
  >,
): Promise<void> {
  await db.userPreferences.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

/**
 * Name, username, and color.
 *
 * The username appears in filter addresses (`?assignee=@handle`) and is unique
 * across workspaces — hence the check on shape and collision before the
 * database answers with its own error.
 *
 * At the end, the session token gets synced: name and color live in it and are
 * drawn from it (bottom-left menu, avatars). Without this step, the display
 * would stay at the old state until the next login — the action would look
 * like it hadn't taken effect.
 */
export async function updateProfile(data: {
  firstName: string;
  lastName: string;
  handle: string;
  color: string;
}): Promise<Result> {
  const session = await getSession();
  if (!session) return { error: NOT_LOGGED_IN };

  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();
  const handle = data.handle.trim().toLowerCase();
  const color = data.color.trim();

  // First name is required, last name is optional (`features/onboarding`).
  if (!firstName) return { error: "First name is required." };
  if (!/^[a-z0-9][a-z0-9-]{1,29}$/.test(handle)) {
    return {
      error:
        "The username may contain lowercase letters, numbers and hyphens (2–30 characters).",
    };
  }

  const taken = await db.user.findUnique({
    where: { handle },
    select: { id: true },
  });
  if (taken && taken.id !== session.userId) {
    return { error: "This username is already taken." };
  }

  await db.user.update({
    where: { id: session.userId },
    data: { firstName, lastName, handle, color },
  });

  await unstable_update({ user: { firstName, lastName, color } });

  revalidatePath("/", "layout");
  return { ok: true };
}

type UploadUrlResult =
  | { ok: true; key: string; uploadUrl: string }
  | { error: string };

/**
 * First step of the avatar upload: issues a presigned PUT URL that the client
 * uploads against directly (without a detour through the server). No
 * `unstable_update()` needed — unlike name/color, the avatar isn't in the
 * session token (`UserMenu` already reads it live from the DB today, same as
 * `handle`), the `revalidatePath` below is enough.
 */
export async function requestAvatarUploadUrl(input: {
  contentType: string;
  contentLength: number;
}): Promise<UploadUrlResult> {
  const session = await getSession();
  if (!session) return { error: NOT_LOGGED_IN };

  return requestAvatarUpload({
    kind: "user",
    ownerId: session.userId,
    ...input,
  });
}

/** Second step: after the direct PUT against S3, store the key in the DB
 *  and best-effort delete the previous avatar. */
export async function confirmAvatarUpload(key: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { error: NOT_LOGGED_IN };

  const result = await finalizeAvatarUpload("user", session.userId, key);
  if ("error" in result) return result;

  const previous = await db.user.findUnique({
    where: { id: session.userId },
    select: { avatarKey: true },
  });
  await db.user.update({
    where: { id: session.userId },
    data: { avatarKey: key },
  });
  await deleteAvatarObject(previous?.avatarKey);

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeAvatar(): Promise<Result> {
  const session = await getSession();
  if (!session) return { error: NOT_LOGGED_IN };

  const previous = await db.user.findUnique({
    where: { id: session.userId },
    select: { avatarKey: true },
  });
  await db.user.update({
    where: { id: session.userId },
    data: { avatarKey: null },
  });
  await deleteAvatarObject(previous?.avatarKey);

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * The theme.
 *
 * This is where the choice gets recorded; it's rendered by the root layout as
 * `data-theme` on `<html>`. The `revalidatePath` below makes sure the layout
 * actually re-renders with the new choice.
 */
export async function updateAppearance(data: {
  theme?: Theme;
}): Promise<Result> {
  const session = await getSession();
  if (!session) return { error: NOT_LOGGED_IN };

  if (data.theme !== undefined && !THEMES.includes(data.theme)) {
    return { error: "Unknown theme." };
  }

  await writePreferences(session.userId, {
    ...(data.theme !== undefined ? { theme: data.theme } : {}),
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Which values each choice-type behavior setting accepts. */
const BEHAVIOR_CHOICES: Partial<
  Record<keyof BehaviorPreferences, readonly string[]>
> = {
  projectLanding: PROJECT_LANDINGS,
  startPage: START_PAGES,
  issueOpenMode: ISSUE_OPEN_MODES,
  issuePageOpenMode: ISSUE_PAGE_OPEN_MODES,
  defaultGrouping: GROUP_KEYS,
  defaultSort: SORT_KEYS,
  projectOrder: PROJECT_ORDERS,
  dateFormat: DATE_FORMATS,
  weekStart: WEEK_STARTS,
};

const BEHAVIOR_FLAGS = [
  "defaultShowSubIssues",
  "sidebarCollapsed",
  "confirmDestructive",
] as const;

/** A shortcut spec as `useShortcut` reads it: `c`, `mod+k`, `g+d`, `shift+?`. */
const SHORTCUT_SPEC = /^(?:(?:mod|shift|alt)\+)*[^+\s]+(?:\+[^+\s])?$/i;

/**
 * Behavior settings: where clicks lead, how issues open, defaults for
 * views, date format, zone, own shortcuts, confirmations.
 *
 * Takes any subset; whatever isn't named stays as it is. Unknown values are
 * rejected as a whole — a half-applied change would be harder to explain
 * than a refusal. Like `updateAppearance`, this only ever writes the row of
 * whoever is logged in.
 */
export async function updateBehavior(
  data: Partial<BehaviorPreferences>,
): Promise<Result> {
  const session = await getSession();
  if (!session) return { error: NOT_LOGGED_IN };

  const write: Record<
    string,
    string | boolean | null | Record<string, string> | Record<string, number>
  > = {};

  for (const [key, allowed] of Object.entries(BEHAVIOR_CHOICES)) {
    const value = data[key as keyof BehaviorPreferences];
    if (value === undefined) continue;
    if (typeof value !== "string" || !allowed?.includes(value)) {
      return { error: `Unknown value for ${key}.` };
    }
    write[key] = value;
  }

  for (const key of BEHAVIOR_FLAGS) {
    const value = data[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean")
      return { error: `Unknown value for ${key}.` };
    write[key] = value;
  }

  // Only an id the person can see right now — checked like any view link.
  if (data.startViewId !== undefined) {
    if (data.startViewId !== null) {
      if (typeof data.startViewId !== "string")
        return { error: "Unknown view." };
      const view = await getVisibleViewById(data.startViewId);
      if (!view) return { error: "Unknown view." };
    }
    write.startViewId = data.startViewId;
  }

  if (data.timeZone !== undefined) {
    if (data.timeZone !== null && !isTimeZone(data.timeZone)) {
      return { error: "Unknown time zone." };
    }
    write.timeZone = data.timeZone;
  }

  if (data.shortcutOverrides !== undefined) {
    const overrides = toShortcutOverrides(data.shortcutOverrides);
    // Every entry must be a spec the matcher can read, and no two shortcuts
    // may end up on the same keys — the second one would never fire.
    const seen = new Set<string>();
    for (const spec of Object.values(overrides)) {
      if (!SHORTCUT_SPEC.test(spec)) return { error: "Invalid shortcut." };
      const normalized = spec.toLowerCase();
      if (seen.has(normalized)) {
        return { error: "Two shortcuts can't share the same keys." };
      }
      seen.add(normalized);
    }
    write.shortcutOverrides = overrides;
  }

  if (data.listColumnWidths !== undefined)
    write.listColumnWidths = sanitizeColumnWidths(data.listColumnWidths);

  if (Object.keys(write).length === 0) return { ok: true };

  await writePreferences(session.userId, write);

  // Shell, sidebar and the views all read these on the server.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * The notice in the platform area: dismissed, or show it again.
 *
 * A preference like the theme, which is why it lives here and not with the
 * platform actions — it belongs to the person, not the platform, and applies
 * on every device. Keeping it in the database instead of the browser has a
 * second reason: the page is rendered on the server, and anything only the
 * browser knows would arrive too late there.
 */
export async function setAdminNoticeHidden(hidden: boolean): Promise<Result> {
  const session = await getSession();
  if (!session) return { error: NOT_LOGGED_IN };

  await writePreferences(session.userId, { adminNoticeHidden: hidden });

  // Only the platform area shows it — the rest of the app doesn't need to be
  // rebuilt for this.
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * A single notification toggle.
 *
 * Individually and not as a whole batch: the toggles apply immediately, and
 * flipping one expresses an opinion about exactly that one point. A blanket
 * update across all ten would, with two open tabs, overwrite whatever state
 * the other tab had.
 */
export async function setNotification(
  key: NotificationKey,
  value: boolean,
): Promise<Result> {
  const session = await getSession();
  if (!session) return { error: NOT_LOGGED_IN };
  if (!NOTIFICATION_KEYS.has(key)) return { error: "Unknown setting." };

  await writePreferences(session.userId, { [key]: value });
  return { ok: true };
}

/**
 * Add an address to an account that has no email yet (passkey-first accounts,
 * `auth.ts`'s WebAuthn `getUserInfo`).
 *
 * Only *adding*, not *changing*: an account with an address already set is
 * rejected — replacing an existing sign-in address is a security-sensitive
 * operation that would require confirming the new address, and this app
 * doesn't have a token system for that yet (`lib/mail`'s `emailVerification.ts`
 * is "not wired up yet"). The freshly added address therefore lands as
 * `emailVerified: null` — unverified, but usable for magic link/invitation/
 * notification, exactly like any other unverified address in this app.
 */
export async function addEmail(email: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { error: NOT_LOGGED_IN };

  const trimmed = email.trim().toLowerCase();
  if (!isValidEmail(trimmed)) {
    return { error: "Please enter a valid email address." };
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { email: true },
  });
  if (!user) return { error: NOT_LOGGED_IN };
  if (user.email) {
    return { error: "This account already has an email address." };
  }

  const taken = await db.user.findUnique({
    where: { email: trimmed },
    select: { id: true },
  });
  if (taken) return { error: "This email address is already in use." };

  await db.user.update({
    where: { id: session.userId },
    data: { email: trimmed, emailVerified: null },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Disconnect a third-party sign-in method from the account.
 *
 * The last one can't go: without a connected account and without a passkey,
 * nobody could get in anymore. This is checked here and not in the UI — the
 * button is hidden there, but a server function is an address like any other.
 */
export async function disconnectAccount(provider: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { error: NOT_LOGGED_IN };

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      accounts: { select: { provider: true } },
      authenticators: { select: { credentialID: true } },
    },
  });
  if (!user) return { error: NOT_LOGGED_IN };

  if (!user.accounts.some((a) => a.provider === provider)) {
    return { error: "This account is not connected." };
  }
  if (user.authenticators.length === 0 && user.accounts.length <= 1) {
    return {
      error:
        "This is your only way to sign in. Add a passkey first, then disconnect it.",
    };
  }

  await db.account.deleteMany({ where: { userId: session.userId, provider } });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Remove a passkey from the account.
 *
 * The same "last way in" protection as `disconnectAccount`: the connected
 * providers and the remaining passkeys together count as one pool — if none
 * would be left, nothing gets deleted.
 */
export async function removePasskey(credentialID: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { error: NOT_LOGGED_IN };

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      accounts: { select: { provider: true } },
      authenticators: { select: { credentialID: true } },
    },
  });
  if (!user) return { error: NOT_LOGGED_IN };

  if (!user.authenticators.some((a) => a.credentialID === credentialID)) {
    return { error: "This passkey is not on your account." };
  }

  const remainingWaysIn =
    user.accounts.length + (user.authenticators.length - 1);
  if (remainingWaysIn === 0) {
    return {
      error:
        "This is your only way to sign in. Add another method first, then remove it.",
    };
  }

  await db.authenticator.delete({ where: { credentialID } });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Creates a personal API key for the public REST API (`app/api/v1`).
 *
 * The raw token is returned exactly once, here — only its hash and a short
 * prefix are ever stored (`ApiKey.tokenHash`/`prefix`, see `lib/api-auth.ts`
 * for why a plain SHA-256 over a high-entropy token is the right choice,
 * not bcrypt/argon2).
 */
export async function createApiKey(input: {
  name: string;
  scopes: ApiScope[];
  expiresAt?: Date;
}): Promise<{ ok: true; token: string; id: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: NOT_LOGGED_IN };

  const name = input.name.trim();
  if (!name) return { error: "Name is required." };

  // A key with no scope could authenticate but do nothing — not a useful
  // state, and easy to create by accident by unchecking everything.
  const scopes = [...new Set(input.scopes)].filter(isApiScope);
  if (scopes.length === 0) return { error: "Select at least one scope." };

  const token = `bry_${randomBytes(32).toString("base64url")}`;
  const key = await db.apiKey.create({
    data: {
      userId: session.userId,
      name,
      prefix: token.slice(0, 12),
      tokenHash: hashApiToken(token),
      scopes,
      expiresAt: input.expiresAt ?? null,
    },
    select: { id: true },
  });

  revalidatePath("/", "layout");
  return { ok: true, token, id: key.id };
}

/** Revokes one of your own API keys. Ownership check, not an RBAC check —
 *  same category as `removePasskey`'s credential-ownership check above. */
export async function revokeApiKey(id: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { error: NOT_LOGGED_IN };

  const key = await db.apiKey.findUnique({
    where: { id },
    select: { userId: true, revokedAt: true },
  });
  if (!key || key.userId !== session.userId) {
    return { error: "This API key is not on your account." };
  }
  if (key.revokedAt) return { ok: true };

  await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });

  revalidatePath("/", "layout");
  return { ok: true };
}
