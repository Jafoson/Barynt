"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Shortcut } from "@/components/ui/atoms/Shortcut/Shortcut";
import styles from "../sidebar.module.scss";

export function SearchButton() {
  const t = useTranslations();

  return (
    <Button
      variant="outline"
      className={styles.search}
      size="md"
      onClick={() =>
        (window as { __openPalette?: () => void }).__openPalette?.()
      }
    >
      <Icon icon="lucide:search" width={15} />
      <span>{t("placeholders.search")}</span>
      <Shortcut keys="mod+k" className={styles.searchShortcut} />
    </Button>
  );
}
