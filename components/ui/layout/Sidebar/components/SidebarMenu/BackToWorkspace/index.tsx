"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import { useRouter } from "@/i18n/navigation";
import styles from "../SidebarMenu.module.scss";

function BackToWorkspaceClient() {
  const t = useTranslations("nav");
  const router = useRouter();

  return (
    <Button
      full
      variant="elevated"
      size="lg"
      icon={<Icon icon="lucide:chevron-left" height={18} />}
      onClick={() => router.push("/")}
      className={`${styles.elevated} ${styles.back}`}
    >
      <span className={styles.backLabel}>{t("backToWorkspace")}</span>
    </Button>
  );
}

export default BackToWorkspaceClient;
