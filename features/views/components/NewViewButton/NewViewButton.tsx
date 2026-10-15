"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import type { ViewLayout } from "@/features/views/schema";
import { useOpenViewModal } from "@/features/views/useOpenViewModal";
import styles from "./newViewButton.module.scss";

interface NewViewButtonProps {
  workspaceId: string;
  projectId: string;
  projectSlug: string;
  canShare: boolean;
  layout: ViewLayout;
  /** The address's view state right now — taken over unless unticked. */
  currentParams: Record<string, string>;
}

/**
 * "New view" next to the search (BARY-164) — always there in a project's
 * board and list, also before the first view exists (the views row is
 * hidden then). On a phone only the icon remains.
 */
export function NewViewButton({
  workspaceId,
  projectId,
  projectSlug,
  canShare,
  layout,
  currentParams,
}: NewViewButtonProps) {
  const t = useTranslations();
  const openViewModal = useOpenViewModal();

  return (
    <Button
      variant="outline"
      className={styles.button}
      icon={<Icon icon="lucide:plus" width={15} />}
      aria-label={t("views.newView")}
      title={t("views.newView")}
      onClick={() =>
        openViewModal({
          workspaceId,
          projectId,
          projectSlug,
          canShare,
          currentParams,
          initialLayout: layout,
        })
      }
    >
      <span className={styles.label}>{t("views.newView")}</span>
    </Button>
  );
}
