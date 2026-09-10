import { randomInt } from "node:crypto";
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import Nodemailer from "next-auth/providers/nodemailer";
import WebAuthn from "next-auth/providers/webauthn";
import {
  authConfig,
  passkeyLoginEnabled,
  passkeyRegistrationEnabled,
  registrationEnabled,
} from "@/auth.config";
import { appBaseUrl } from "@/lib/app-url";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isMailConfigured, sendMail } from "@/lib/mail/send";
import { magicLinkEmail } from "@/lib/mail/templates/magicLink";
import { touchLastSeen } from "@/lib/presence";
import { DEFAULT_PLATFORM_ROLE_KEY, systemRoleId } from "@/lib/rbac";
import { generateHandle, pickUserColor } from "@/lib/user-defaults";
import { provisionNewUser } from "@/lib/user-provisioning";
import { splitName } from "@/lib/utils/string";

// PrismaAdapter with a createUser override: OAuth/mail users only supply
// name/email/image, but `handle` and `color` are NOT NULL. The full name
// arrives as a single field from the provider (or is missing entirely for
// mail login) and gets split for our firstName/lastName schema.
//
// Also the only place where a genuinely new account is created (first
// passkey sign-in, OAuth, magic link) — `provisionNewUser()` hooks the
// domain auto-join in here, which only `register()` used to know about.
// Alphabet without O/0/I/1 — otherwise a displayed code doesn't tell you
// which of the two is meant. 8 characters out of 32 possible are short
// enough to type and still not guessable in any reasonable time.
const MAGIC_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAGIC_CODE_LENGTH = 8;

/**
 * Replaces next-auth's own 32-byte random token for the mail provider with a
 * short, typeable code — it ends up unchanged both in the link (`?token=`)
 * and, shown separately, in the email itself (`sendVerificationRequest`
 * below). Both check the same next-auth route against the same hashed value
 * in `VerificationToken` — the code isn't a second mechanism, just a second
 * way to enter the same token.
 */
function generateMagicCode(): string {
  let code = "";
  for (let i = 0; i < MAGIC_CODE_LENGTH; i++) {
    code += MAGIC_CODE_ALPHABET[randomInt(MAGIC_CODE_ALPHABET.length)];
  }
  return code;
}

// next-auth's WebAuthn provider requires an `email` in the request for a
// registration (`@auth/core`'s `webAuthnOptions` otherwise bails out with
// "Invalid request" — per spec, a WebAuthn credential always needs a
// `userName` that the passkey manager displays). Our own registration flow
// (`registerWithPasskey` in `LoginForm.tsx`) never asks for an address
// though, so it sends a client-generated, guaranteed-unique address under
// this reserved domain instead (RFC 2606 — `.invalid` is never assigned to
// real domains, so it never collides with an actual address). It only
// serves as a technical placeholder for the WebAuthn ceremony and is
// discarded again right here — the account ends up with `null`, not the
// placeholder address.
const NO_EMAIL_SENTINEL_DOMAIN = "@no-email.invalid";

function createAdapter(): Adapter {
  const base = PrismaAdapter(db);
  return {
    ...base,
    async createUser({ id: _id, ...data }: AdapterUser) {
      const isSentinelEmail = data.email?.endsWith(NO_EMAIL_SENTINEL_DOMAIN);
      const email = isSentinelEmail ? null : (data.email ?? null);

      // A real name only ever comes from OAuth/OIDC providers — passkey and
      // magic link never supply one. No fallback guessed from the email
      // address: name is an optional field in the onboarding form and stays
      // empty until the person enters something themselves.
      const { firstName, lastName } = data.name
        ? splitName(data.name)
        : { firstName: "", lastName: "" };
      const handle = await generateHandle(email ?? data.name ?? "user");
      const user = await db.user.create({
        data: {
          firstName,
          lastName,
          email,
          emailVerified: data.emailVerified,
          image: data.image,
          handle,
          color: pickUserColor(),
          // Every new account starts without platform permissions.
          platformRoleId: systemRoleId("PLATFORM", DEFAULT_PLATFORM_ROLE_KEY),
        },
      });
      if (email) {
        await provisionNewUser(db, { userId: user.id, email });
      }
      return user as AdapterUser;
    },
  };
}

// `unstable_update` rewrites the JWT without requiring anyone to sign in
// again — used by the account settings page when name or color changes (see
// the `update` branch in the jwt callback in `auth.config.ts`). The name is
// Auth.js's own; "unstable" describes the label, not the behavior.
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  // Passkeys sit behind an experimental flag in this Auth.js version —
  // without it, every WebAuthn call (even just listing the provider) returns
  // an `ExperimentalFeatureNotEnabled` error.
  experimental: { enableWebAuthn: true },
  // Passkeys are the app's normal, primary login method here, not an
  // experiment we're trying out — silence Auth.js's own
  // `experimental-webauthn` startup warning about it; every other warning
  // code still goes through the default logger.
  logger: {
    warn(code) {
      if (code === "experimental-webauthn") return;
      console.warn(
        `[auth][warn][${code}]`,
        "Read more: https://warnings.authjs.dev",
      );
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Every login runs through here — passkey as well as OAuth, there's no
     * separate `authorize` branch anymore that would catch deactivated
     * accounts somewhere else.
     */
    async signIn({ user, account }) {
      // An invitation creates a shadow account with a fixed email address
      // (`inviteOneWorkspaceMember`/`inviteOneProjectMember`) — without its
      // own password, without a passkey, without a connected provider.
      // next-auth refuses OAuth/OIDC for that by default with
      // `OAuthAccountNotLinked` as soon as the address already belongs to an
      // account ("we don't trust user-provided email addresses" —
      // @auth/core). That distrust doesn't apply to a genuinely untouched
      // shadow account: nobody has ever successfully signed in (no magic-link
      // click, otherwise `emailVerified` would be set; no passkey; no
      // connected provider) — so there's nothing to hijack.
      // `getUserByAccount()` in `handleLoginOrRegister` (which runs after
      // this callback) then finds the row we just linked here as already
      // connected and signs in normally instead of throwing the error.
      let linkedShadowAccount = false;
      if (
        !user.id &&
        user.email &&
        (account?.type === "oauth" || account?.type === "oidc") &&
        account.providerAccountId
      ) {
        const shadow = await db.user.findUnique({
          where: { email: user.email },
          select: {
            id: true,
            emailVerified: true,
            accounts: { select: { id: true }, take: 1 },
            authenticators: { select: { credentialID: true }, take: 1 },
          },
        });
        if (
          shadow &&
          !shadow.emailVerified &&
          shadow.accounts.length === 0 &&
          shadow.authenticators.length === 0
        ) {
          await db.account.create({
            data: {
              userId: shadow.id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              refresh_token: account.refresh_token ?? null,
              access_token: account.access_token ?? null,
              expires_at: account.expires_at ?? null,
              token_type: account.token_type ?? null,
              scope: account.scope ?? null,
              id_token: account.id_token ?? null,
            },
          });
          linkedShadowAccount = true;
        }
      }

      // `!user.id` at this point always means a brand-new account is about
      // to be created in `createUser` (right below in `handleLoginOrRegister`
      // — this callback runs first) — unless it's an invited shadow account
      // we just linked above, or (for magic link) `getUserByEmail` already
      // found an existing row, in which case `user.id` is set and we never
      // get here. `AUTH_REGISTRATION_ENABLED=false` blocks exactly that
      // remaining case: a genuinely unknown email/provider account. Returning
      // `false` makes next-auth redirect with `?error=AccessDenied`.
      if (!user.id && !linkedShadowAccount && !registrationEnabled) {
        return false;
      }

      if (!user.id) return true;

      const row = await db.user.findUnique({
        where: { id: user.id },
        select: { deactivatedAt: true },
      });
      if (row?.deactivatedAt) {
        await recordAudit({
          action: "auth.login.failed",
          actorId: user.id,
          meta: { reason: "deactivated", provider: account?.provider ?? null },
        });
        return false;
      }

      if (account?.provider) {
        await Promise.all([
          recordAudit({
            action: "auth.login",
            actorId: user.id,
            meta: { provider: account.provider },
          }),
          touchLastSeen(user.id),
        ]);
      }

      return true;
    },
  },
  adapter: createAdapter(),
  providers: [
    ...authConfig.providers,
    // Passkeys — the only way in this app runs itself (no more password),
    // unless `AUTH_PASSKEY_LOGIN_ENABLED` is explicitly set to "false".
    // `relayingParty.id` is just the hostname (no scheme/port) — browsers
    // bind a passkey to exactly that value, `origin` stays the full base
    // URL. `enableConditionalUI` allows autofill via the login page's email
    // field.
    ...(passkeyLoginEnabled
      ? [
          WebAuthn({
            relayingParty: {
              id: new URL(appBaseUrl()).hostname,
              name: "Barynt",
              origin: appBaseUrl(),
            },
            enableConditionalUI: true,
            // Without a custom `getUserInfo`, next-auth would return
            // `exists: false` for any unknown email and thereby allow a
            // brand-new account via passkey (`LoginForm`'s "Register with
            // passkey", the only place that sends an `email` without a
            // session — see `NO_EMAIL_SENTINEL_DOMAIN` above). If
            // registration is turned off, only the login branch remains:
            // returning `null` makes next-auth (`inferWebAuthnOptions` in
            // `@auth/core`) fall back to plain authentication without
            // pre-defined credentials, which always fails for this sentinel
            // account — `registerWithPasskey` catches that
            // (`login.passkeyFailed`).
            //
            // Already signed-in people adding another passkey in their own
            // security settings (`AccountSecurity#addPasskey`) never go
            // through here — with an existing session, next-auth reads the
            // user straight from the session, without calling `getUserInfo`.
            // That's intentional: this switch only affects brand-new
            // accounts, not account management.
            ...(!passkeyRegistrationEnabled
              ? {
                  async getUserInfo(_options, request) {
                    const { query, body, method } = request;
                    const email = (
                      method === "POST" ? body?.email : query?.email
                    ) as unknown;
                    if (!email || typeof email !== "string") return null;
                    const existingUser = await db.user.findUnique({
                      where: { email },
                    });
                    return existingUser
                      ? { user: existingUser, exists: true as const }
                      : null;
                  },
                }
              : {}),
          }),
        ]
      : []),
    // Magic link — only active when SMTP is configured (see
    // `isMailConfigured()`); without SMTP the provider is left out entirely
    // instead of faking an email that never arrives. `server` is a dummy
    // value, only to satisfy next-auth's internal truthy check —
    // `sendVerificationRequest` calls `sendMail()` (`lib/mail/send.ts`)
    // directly instead, next-auth's own SMTP transport logic is never used.
    //
    // The practical reason this provider also works for invitations and
    // migrated accounts without a passkey, where WebAuthn/OAuth fail with
    // `AccountNotLinked`: `handleLoginOrRegister` treats an existing address
    // on the mail provider as the normal case (sign in as that account), not
    // as a collision — clicking the link *is* the proof that the address
    // belongs to the person.
    //
    // `generateVerificationToken` replaces next-auth's long random token with
    // `generateMagicCode()` — so the link also only carries the short code as
    // `token`, and `maxAge` drops to 15 minutes instead of an hour: less
    // entropy in the token calls for a narrower time window.
    ...(isMailConfigured()
      ? [
          Nodemailer({
            server: { host: "unused" },
            from: "noreply@orbit.local",
            maxAge: 15 * 60,
            generateVerificationToken: generateMagicCode,
            async sendVerificationRequest({ identifier, url, token }) {
              const { subject, html, text } = magicLinkEmail({
                to: identifier,
                url,
                code: token,
                expiresInMinutes: 15,
              });
              await sendMail({ to: identifier, subject, html, text });
            },
          }),
        ]
      : []),
  ],
});
