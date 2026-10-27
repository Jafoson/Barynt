"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Logo } from "@/components/ui/atoms/Logo/Logo";
import { signInWithOAuth } from "@/features/auth/actions";
import { authProviderMeta } from "@/lib/auth-providers/meta";
import styles from "./authCard.module.scss";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  error?: string;
  /** Without `onSubmit`, the generic button is omitted — forms with no
   *  field-based submission of their own (e.g. pure passkey sign-in) carry
   *  their trigger via `extra` instead. */
  submitLabel?: string;
  onSubmit?: () => void;
  oauthProviders?: string[];
  /** Overrides the display name of individual providers — for OIDC, whose
   *  name comes from `AUTH_OIDC_NAME` instead of the fixed brand list. */
  oauthLabels?: Record<string, string>;
  /** Additional sign-in method (e.g. a passkey button) — sits between the
   *  submit button and the OAuth providers, but shares no styling with them
   *  (different condition, different ceremony flow). */
  extra?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Pure UI shell for sign-in: the brand on the left (hidden on narrow
 * screens), the card with title, fields (`children`), error, submit, extra
 * method, and OAuth rows on the right. Contains no form logic.
 */
export function AuthCard({
  title,
  subtitle,
  error,
  submitLabel,
  onSubmit,
  oauthProviders = [],
  oauthLabels,
  extra,
  children,
}: AuthCardProps) {
  const t = useTranslations();

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroBrand}>
          <Logo variant="horizontal" color="color" height={40} priority />
        </div>
        <div className={styles.heroCopy}>
          <h2>{t("login.heroTitle")}</h2>
          <p>{t("login.heroSubtitle")}</p>
        </div>
      </div>

      <div className={styles.formSide}>
        <div className={styles.card}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.sub}>{subtitle}</p>}

          {error && (
            <div className={styles.error}>
              <Icon icon="lucide:circle-alert" width={14} />
              {error}
            </div>
          )}

          <div className={styles.fields}>{children}</div>

          {onSubmit && submitLabel && (
            <Button
              type="button"
              variant="primary"
              size="lg"
              full
              onClick={onSubmit}
            >
              {submitLabel}
            </Button>
          )}

          {extra}

          {oauthProviders.length > 0 && (
            <>
              <div className={styles.divider}>{t("login.or")}</div>
              {/* With three or more providers, a stacked list of full
                  buttons would blow up the card — from there on, just logos
                  in a row, as is common with Google/Apple/Facebook. */}
              <div
                className={
                  oauthProviders.length >= 3
                    ? styles.oauthCompact
                    : styles.oauth
                }
              >
                {oauthProviders.map((provider) => {
                  const meta = authProviderMeta(provider);
                  const label = oauthLabels?.[provider] ?? meta.label;
                  if (oauthProviders.length >= 3) {
                    return (
                      <form
                        key={provider}
                        action={signInWithOAuth.bind(null, provider)}
                      >
                        <Button
                          type="submit"
                          variant="elevated"
                          size="lg"
                          icon={<Icon icon={meta.icon} width={18} />}
                          aria-label={t("login.continueWith", {
                            provider: label,
                          })}
                          title={t("login.continueWith", { provider: label })}
                        />
                      </form>
                    );
                  }
                  return (
                    <form
                      key={provider}
                      className={styles.oauthForm}
                      action={signInWithOAuth.bind(null, provider)}
                    >
                      <Button
                        type="submit"
                        variant="elevated"
                        size="lg"
                        full
                        icon={<Icon icon={meta.icon} width={18} />}
                      >
                        {t("login.continueWith", { provider: label })}
                      </Button>
                    </form>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
