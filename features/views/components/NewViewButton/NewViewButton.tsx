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
  /** Active filter chips. With any set the button says "Save as new view",
   *  so it's clear the filters come along. */
  filterCount: number;
}

/**
 * "New view" next to the search (BARY-164) — always there in a project's
 * board and list, also before the first view exists (the views row is
 * hidden then). With filters set it reads "Save as new view": the dialog
 * takes them over. On a phone only the icon remains.
 */
export function NewViewButton({
  workspaceId,
  projectId,
  projectSlug,
  canShare,
  layout,
  currentParams,
  filterCount,
}: NewViewButtonProps) {
  const t = useTranslations();
  const openViewModal = useOpenViewModal();
  const label = filterCount > 0 ? t("views.saveAsNew") : t("views.newView");

  return (
    <Button
      variant="elevated"
      className={styles.button}
      icon={<Icon icon="lucide:plus" width={15} />}
      aria-label={label}
      title={label}
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
      <span className={styles.label}>{label}</span>
    </Button>
  );
}
