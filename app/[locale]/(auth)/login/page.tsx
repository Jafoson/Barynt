import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  enabledOAuthProviders,
  oidcProviderName,
  passkeyLoginEnabled,
  passkeyRegistrationEnabled,
  registrationEnabled,
} from "@/auth.config";
import { LoginForm } from "@/features/auth/components/LoginForm/LoginForm";
import { db } from "@/lib/db";
import { isMailConfigured } from "@/lib/mail/send";
import { getSession } from "@/lib/session";
import { isFirstAccount } from "@/lib/user-provisioning";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  // Already signed in? Then away from the login page to the target page.
  // Without the session check, a redirect loop with the proxy would result.
  const session = await getSession();
  if (session) redirect(callbackUrl ?? "/");

  // `error` comes from next-auth's own error redirect (`auth.config.ts`'s
  // `pages.error`) — e.g. an expired or already-used magic-link code,
  // redeemed via the code path on this page. `AccessDenied` is what the
  // `signIn` callback in `auth.ts` produces for a blocked new-account
  // creation (`AUTH_REGISTRATION_ENABLED=false`) or a deactivated account.
  let initialError: string | undefined;
  if (error) {
    const t = await getTranslations("login");
    initialError =
      error === "Verification"
        ? t("codeInvalid")
        : error === "AccessDenied"
          ? t("accessDenied")
          : t("signInError");
  }

  // "Register with passkey" only makes sense while new accounts are allowed:
  // with `AUTH_REGISTRATION_ENABLED=false` it could only end in AccessDenied.
  // Same exception as the `signIn` callback in `auth.ts`: an instance without
  // any account yet still has to be able to create its first one.
  const canRegisterWithPasskey =
    passkeyRegistrationEnabled &&
    (registrationEnabled || (await isFirstAccount(db)));

  return (
    <LoginForm
      callbackUrl={callbackUrl}
      oauthProviders={enabledOAuthProviders}
      oidcLabel={oidcProviderName}
      mailConfigured={isMailConfigured()}
      passkeyLoginEnabled={passkeyLoginEnabled}
      passkeyRegistrationEnabled={canRegisterWithPasskey}
      initialError={initialError}
    />
  );
}
