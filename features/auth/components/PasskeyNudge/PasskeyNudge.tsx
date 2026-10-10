"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { dismissPasskeyNudge } from "@/features/account/actions";
import { Link } from "@/i18n/navigation";
import styles from "./passkeyNudge.module.scss";

/**
 * Reminds about a missing passkey. Dismissing it is remembered per person
 * (`UserPreferences.passkeyNudgeHidden`, read by the workspace layout), so it
 * doesn't come back on reload, next sign-in or another device. The banner
 * hides itself right away; the write happens in the background.
 */
export function PasskeyNudge({ securityHref }: { securityHref: string }) {
  const t = useTranslations();
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  if (dismissed) return null;

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
          onClick={() => {
            setDismissed(true);
            startTransition(async () => {
              await dismissPasskeyNudge();
            });
          }}
        />
      </div>
    </output>
  );
}
