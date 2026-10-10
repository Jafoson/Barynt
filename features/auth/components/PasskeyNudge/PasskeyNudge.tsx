"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Link } from "@/i18n/navigation";
import styles from "./passkeyNudge.module.scss";

const EVENT = "passkey-nudge-dismissed";

const storageKey = (userId: string) => `barynt:passkeyNudgeDismissed:${userId}`;

function isDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId)) === "1";
  } catch {
    return false;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * Reminds about a missing passkey. Dismissing it is remembered in this
 * browser's `localStorage` (per person), so it doesn't come back on reload or
 * the next sign-in — but it does on another device or after clearing site
 * data. The server snapshot is "dismissed", so nothing is rendered during SSR
 * and hydration; the banner appears afterwards if it wasn't dismissed.
 */
export function PasskeyNudge({
  securityHref,
  userId,
}: {
  securityHref: string;
  userId: string;
}) {
  const t = useTranslations();
  const dismissed = useSyncExternalStore(
    subscribe,
    () => isDismissed(userId),
    () => true,
  );

  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey(userId), "1");
    } catch {
      // Storage blocked: the banner still goes away until the next reload.
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <output className={styles.banner}>
      <Icon icon="lucide:fingerprint" width={18} className={styles.icon} />
      <p className={styles.text}>{t("account.passkeyNudge")}</p>
      <div className={styles.actions}>
        <Link href={securityHref} className={styles.link}>
          {t("account.addPasskey")}
        </Link>
        <Button
          variant="text"
          size="sm"
          aria-label={t("actions.dismiss")}
          icon={<Icon icon="lucide:x" width={14} />}
          onClick={dismiss}
        />
      </div>
    </output>
  );
}
