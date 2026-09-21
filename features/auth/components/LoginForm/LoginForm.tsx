"use client";

import { Icon } from "@iconify/react";
import { signIn } from "next-auth/webauthn";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Input } from "@/components/ui/atoms/Input/Input";
import { OptionButton } from "@/components/ui/atoms/OptionButton/OptionButton";
import { sendMagicLink } from "@/features/auth/actions";
import { AuthCard } from "@/features/auth/components/AuthCard/AuthCard";
import { PasskeyLoginButton } from "@/features/auth/components/PasskeyLoginButton/PasskeyLoginButton";
import { useRouter } from "@/i18n/navigation";
import { randomId } from "@/lib/utils/id";
import styles from "./loginForm.module.scss";

interface LoginFormProps {
  callbackUrl?: string;
  oauthProviders?: string[];
  /** Display name of the OIDC provider (`AUTH_OIDC_NAME`) — server-only,
   *  therefore passed down as a finished value from the page. */
  oidcLabel?: string;
  /** Whether `next-auth/providers/nodemailer` is active (`isMailConfigured()`,
   *  server-only — therefore passed down as a finished value from the
   *  page). Without SMTP, the entire magic-link section is omitted —
   *  passkey login and registration don't need SMTP and appear above,
   *  independent of it. */
  mailConfigured: boolean;
  /** `AUTH_PASSKEY_LOGIN_ENABLED` (`auth.config.ts`). Off — then the whole
   *  passkey block is missing, not just individual buttons in it. */
  passkeyLoginEnabled: boolean;
  /** `AUTH_PASSKEY_REGISTRATION_ENABLED` — only relevant when
   *  `passkeyLoginEnabled` is on. Off: the login button stays (existing
   *  accounts still get in via passkey), the register button is dropped,
   *  because `auth.ts`'s `getUserInfo` override would reject it anyway. */
  passkeyRegistrationEnabled: boolean;
  /** From `?error=` after a failed code attempt (`auth.config.ts`'s
   *  `pages.error`) — the page reloads fresh in the process, any client
   *  state is gone. */
  initialError?: string;
}

/**
 * Sign in — and, for a new account, register at the same time.
 *
 * Three blocks from top to bottom, each visible only if it actually works:
 *
 * 1. Passkey — only without `AUTH_PASSKEY_LOGIN_ENABLED=false`, otherwise the
 *    block is missing entirely. Two buttons: sign in (`PasskeyLoginButton`,
 *    purely discoverable, the browser shows the passkeys registered on this
 *    device itself) or register (`registerWithPasskey`, creates a
 *    completely new account, see there for the technical necessity of an
 *    internally generated address — additionally missing when
 *    `AUTH_PASSKEY_REGISTRATION_ENABLED=false`, also enforced server-side
 *    there, see `auth.ts`).
 * 2. Magic link — only with SMTP, otherwise the whole block is omitted.
 * 3. Single sign-on — only with configured providers, via `AuthCard`'s
 *    built-in OAuth/OIDC section.
 *
 * If all three are off, the card shows a notice instead of standing there
 * empty — a misconfiguration case (no passkey, no SMTP, no OAuth) that
 * couldn't exist before this toggle.
 */
export function LoginForm({
  callbackUrl,
  oauthProviders = [],
  oidcLabel,
  mailConfigured,
  passkeyLoginEnabled,
  passkeyRegistrationEnabled,
  initialError,
}: LoginFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [isMagicPending, startMagicTransition] = useTransition();
  const [isPasskeyPending, startPasskeyTransition] = useTransition();

  // Code entry happens on its own page (`/login/verify`), no longer inline
  // below this button — navigating there carries the entered email along,
  // without keeping it here additionally in client state.
  const sendMagic = () => {
    setError("");
    startMagicTransition(async () => {
      const result = await sendMagicLink(email, callbackUrl);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const params = new URLSearchParams({
        email: email.trim().toLowerCase(),
      });
      if (callbackUrl) params.set("callbackUrl", callbackUrl);
      router.push(`/login/verify?${params}`);
    });
  };

  // `@auth/core`'s WebAuthn flow internally always requires an `email` for
  // registration — per spec, a WebAuthn credential needs a `userName` that
  // the passkey manager displays. This address is never shown or asked for,
  // just generated once here and serves purely for the ceremony;
  // `createAdapter().createUser` (`auth.ts`'s `NO_EMAIL_SENTINEL_DOMAIN`)
  // discards it again immediately and creates the account with
  // `email: null`.
  const registerWithPasskey = () => {
    setError("");
    startPasskeyTransition(async () => {
      try {
        await signIn("webauthn", {
          email: `${randomId()}@no-email.invalid`,
          redirectTo: callbackUrl || "/",
        });
      } catch {
        setError(t("login.passkeyFailed"));
      }
    });
  };

  const hasAnyMethod =
    passkeyLoginEnabled || mailConfigured || oauthProviders.length > 0;

  return (
    <AuthCard
      title={t("login.signInTitle")}
      error={error}
      oauthProviders={oauthProviders}
      oauthLabels={oidcLabel ? { oidc: oidcLabel } : undefined}
    >
      {!hasAnyMethod && (
        <p className={styles.empty}>
          <Icon icon="lucide:circle-alert" width={14} />
          {t("login.noMethodConfigured")}
        </p>
      )}

      {passkeyLoginEnabled && (
        <div className={styles.group}>
          <PasskeyLoginButton callbackUrl={callbackUrl} onError={setError} />
          {passkeyRegistrationEnabled && (
            <OptionButton
              variant="outline"
              disabled={isPasskeyPending}
              icon={<Icon icon="lucide:user-plus" width={18} />}
              title={t("login.registerWithPasskey")}
              onClick={registerWithPasskey}
            />
          )}
        </div>
      )}

      {mailConfigured && (
        <>
          <div className={styles.divider}>{t("login.orMagicLink")}</div>
          <div className={styles.group}>
            <Input
              id="auth-email"
              label={t("login.workEmail")}
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              disabled={isMagicPending}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMagic()}
            />
            <Button
              type="button"
              variant="outline"
              size="lg"
              full
              disabled={isMagicPending || !email.trim()}
              icon={<Icon icon="lucide:mail" width={16} />}
              onClick={sendMagic}
            >
              {t("login.sendMagicLink")}
            </Button>
          </div>
        </>
      )}
    </AuthCard>
  );
}
