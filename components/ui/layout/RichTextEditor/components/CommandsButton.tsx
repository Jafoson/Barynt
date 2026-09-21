"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";

/**
 * Opens the editor's `/` command menu from a button — in the full-screen
 * editor, where a phone's keyboard has no comfortable slash key. Doesn't
 * take focus from the text (`mousedown` is prevented), so the keyboard stays
 * up.
 */
export function CommandsButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  const t = useTranslations("editor");

  return (
    <Button
      variant="ghost"
      size="sm"
      tabIndex={-1}
      className={className}
      icon={<Icon icon="lucide:slash" width={14} />}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {t("commands")}
    </Button>
  );
}
