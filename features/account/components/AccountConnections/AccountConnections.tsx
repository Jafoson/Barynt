"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import {
  SettingsBody,
  SettingsList,
  type SettingsRow,
} from "@/components/ui/layout/SettingsList/SettingsList";
import { disconnectAccount } from "@/features/account/actions";
import type { AccountConnectionsView } from "@/features/account/types";
import { signInWithOAuth } from "@/features/auth/actions";
import { useRouter } from "@/i18n/navigation";
import { authProviderMeta } from "@/lib/auth-providers/meta";
import styles from "./accountConnections.module.scss";

/**
 * This account's third-party sign-in methods.
 *
 * Each row is a provider and has exactly one state: connected or not.
 * Connecting means signing in there — Auth.js attaches the method to whatever
 * account you're currently in, it isn't a separate flow of its own.
 *
 * The last method can't be disconnected. Anyone without a passkey and only
 * one connected account would be locked out afterward. The button is then
 * missing and the row explains why — but the actual enforcement happens on
 * the server (`disconnectAccount`), since a hidden button is not a lock.
 */
export function AccountConnections({
  accounts,
  hasPasskey,
}: AccountConnectionsView) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const connectedCount = accounts.filter((a) => a.connected).length;

  const disconnect = (provider: string) =>
    startTransition(async () => {
      const result = await disconnectAccount(provider);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError("");
      router.refresh();
    });

  const rows: SettingsRow[] = accounts.map((account) => {
    const meta = authProviderMeta(account.provider);
    const name = account.label ?? meta.label;
    // The last way in stays where it is.
    const isLastWayIn = account.connected && !hasPasskey && connectedCount <= 1;

    return {
      id: account.provider,
      label: name,
      desc: isLastWayIn
        ? t("account.lastMethod")
        : account.connected
          ? t("account.connectedDesc")
          : t("account.connectDesc", { provider: name }),
      control: (
        <span className={styles.control}>
          <Icon icon={meta.icon} width={18} className={styles.mark} />
          {account.connected ? (
            <>
              <span className={styles.connected}>
                <Icon icon="lucide:check" width={14} />
                {t("account.connected")}
              </span>
              {!isLastWayIn && (
                <Button
                  variant="text"
                  disabled={isPending}
                  onClick={() => disconnect(account.provider)}
                >
                  {t("account.disconnect")}
                </Button>
              )}
            </>
          ) : (
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => signInWithOAuth(account.provider)}
            >
              {t("account.connect")}
            </Button>
          )}
        </span>
      ),
    };
  });

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.connections")}
        description={t("account.connectionsDesc")}
      />

      <SettingsBody>
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}

        <SettingsList label={t("nav.connections")} rows={rows} />

        <p className={styles.note}>
          <Icon icon="lucide:info" width={14} />
          {hasPasskey
            ? t("account.connectionsNote")
            : t("account.connectionsNoteNoPassword")}
        </p>
      </SettingsBody>
    </>
  );
}
