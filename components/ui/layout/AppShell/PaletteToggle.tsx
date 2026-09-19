"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";

/**
 * Opens the command palette — the search field's stand-in where the sidebar
 * (and its search button) is folded away: at the far end of the phone's top
 * bar and of the tablet's tab bar. CSS decides where it shows.
 */
export function PaletteToggle({ className }: { className?: string }) {
  const t = useTranslations("placeholders");

  return (
    <Button
      variant="ghost"
      size="md"
      className={className}
      aria-label={t("search")}
      title={t("search")}
      onClick={() =>
        (window as { __openPalette?: () => void }).__openPalette?.()
      }
      icon={<Icon icon="lucide:search" width={18} />}
    />
  );
}
