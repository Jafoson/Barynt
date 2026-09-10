import type { NextAuthConfig } from "next-auth";
import Apple from "next-auth/providers/apple";
import GitHub from "next-auth/providers/github";
import GitLab from "next-auth/providers/gitlab";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

// Edge-safe base config (NO Prisma adapter, NO bcrypt) — used both by the
// full Node setup (auth.ts) and by the middleware gate (proxy.ts). The
// credentials provider + adapter are only added in auth.ts.

// Only enable an OAuth provider once its env vars are set. That way the app
// still runs without any OAuth configured (passkey/magic link only).
const oauthProviders: NextAuthConfig["providers"] = [];
export const enabledOAuthProviders: string[] = [];
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  oauthProviders.push(GitHub);
  enabledOAuthProviders.push("github");
}
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  oauthProviders.push(Google);
  enabledOAuthProviders.push("google");
}
if (process.env.AUTH_GITLAB_ID && process.env.AUTH_GITLAB_SECRET) {
  oauthProviders.push(GitLab);
  enabledOAuthProviders.push("gitlab");
}
// `issuer` is optional — without it, Microsoft Entra ID allows any account
// (personal, school, work) via the `/common/` tenant. Only set
// AUTH_MICROSOFT_ENTRA_ID_ISSUER if you want to restrict sign-in to your own
// tenant.
if (
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
) {
  oauthProviders.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  );
  enabledOAuthProviders.push("microsoft-entra-id");
}
// Apple requires a JWT as the client secret (not a static string) and only
// works over HTTPS — no localhost. `npx auth add apple` generates both
// interactively and writes AUTH_APPLE_ID/AUTH_APPLE_SECRET itself.
if (process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET) {
  oauthProviders.push(Apple);
  enabledOAuthProviders.push("apple");
}
// A generic OIDC provider instead of several named ones — fits any standard
// IdP (Keycloak, Authentik, Entra ID, Okta, …). `issuer` alone is enough for
// next-auth's discovery (`{issuer}/.well-known/openid-configuration`), no
// `wellKnown` needed. `AUTH_OIDC_NAME` is just the button label — defaults to
// "SSO" if nothing is set.
export const oidcProviderName = process.env.AUTH_OIDC_NAME || "SSO";
if (
  process.env.AUTH_OIDC_ISSUER &&
  process.env.AUTH_OIDC_CLIENT_ID &&
  process.env.AUTH_OIDC_CLIENT_SECRET
) {
  oauthProviders.push({
    id: "oidc",
    name: oidcProviderName,
    type: "oidc",
    issuer: process.env.AUTH_OIDC_ISSUER,
    clientId: process.env.AUTH_OIDC_CLIENT_ID,
    clientSecret: process.env.AUTH_OIDC_CLIENT_SECRET,
  });
  enabledOAuthProviders.push("oidc");
}

// Passkeys have always worked without any configuration — both switches
// below are pure opt-outs for environments that don't (or no longer) want
// that path, not an unlock like the OAuth providers above. Default on, only
// the literal "false" turns it off (see auth.ts, where both take effect, and
// example.env for the warning about a full lockout).
export const passkeyLoginEnabled =
  process.env.AUTH_PASSKEY_LOGIN_ENABLED !== "false";
// Only effective when `passkeyLoginEnabled` is on: prevents creating a
// brand-new account via passkey (LoginForm's "Register with passkey").
// Existing accounts can still sign in with a passkey and add further
// passkeys in their own security settings — that's not "registration" in
// the sense of this switch, it's account management.
export const passkeyRegistrationEnabled =
  process.env.AUTH_PASSKEY_REGISTRATION_ENABLED !== "false";

// Gates brand-new account creation across all three sign-in paths at once
// (passkey, OAuth/OIDC, magic link) — see the `signIn` callback in auth.ts,
// the single place all three funnel through. Default on (open
// registration). Set to "false" for invite-only mode: someone with an
// invitation still gets in fine, because `createInvitation` already created
// their account row up front — this switch only ever stops a genuinely
// unknown email/provider account from becoming a *new* one.
export const registrationEnabled =
  process.env.AUTH_REGISTRATION_ENABLED !== "false";

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  // `error: "/login"` mainly catches an invalid/expired magic-link code
  // (`?error=Verification`) — otherwise the person would land on next-auth's
  // unstyled default error page instead of back in our own form.
  pages: { signIn: "/login", error: "/login" },
  providers: oauthProviders,
  callbacks: {
    // Copy user id + avatar color + name into the JWT (`user` is present on login).
    //
    // The role deliberately does NOT go into the token: a JWT lives until the
    // next login, so a role change would only take effect late. Permissions
    // are resolved fresh from the database on every check in
    // `lib/permissions.ts` — the token only carries display data.
    //
    // `trigger === "update"` is the second way in: the user's own settings
    // change name and color, and the token lives until the next login.
    // Without this branch, the menu in the bottom left would keep showing the
    // old name for days — what's displayed comes from the token, not the
    // database. Only these three fields are copied over: anything else
    // `unstable_update` sends along is input from the browser and has no
    // business being in a token.
    jwt({ token, user, trigger, session }) {
      if (user?.id) token.id = user.id;
      if (user) {
        token.color = user.color;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
      }

      if (trigger === "update" && session && typeof session === "object") {
        const next = (session as { user?: Record<string, unknown> }).user;
        if (typeof next?.color === "string") token.color = next.color;
        if (typeof next?.firstName === "string")
          token.firstName = next.firstName;
        if (typeof next?.lastName === "string") token.lastName = next.lastName;
      }

      return token;
    },
    // Mirror id + color + name from the token into the session (available server-side).
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      session.user.color = (token.color as string) ?? "var(--primary)";
      session.user.firstName = (token.firstName as string) ?? "";
      session.user.lastName = (token.lastName as string) ?? "";
      return session;
    },
  },
} satisfies NextAuthConfig;
