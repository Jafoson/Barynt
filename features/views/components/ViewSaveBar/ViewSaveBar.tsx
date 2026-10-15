"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { saveViewState } from "@/features/views/actions";
import type { ViewLayout } from "@/features/views/schema";
import { useOpenViewModal } from "@/features/views/useOpenViewModal";
import { useRouter } from "@/i18n/navigation";
import { useUI } from "@/lib/ui-store";
import styles from "./viewSaveBar.module.scss";

/** The open view, as far as saving needs it. */
export interface ActiveViewInfo {
  id: string;
  canEdit: boolean;
  /** Its stored state's address — where "Discard" goes. */
  href: string;
  sharedBy: string | null;
}

interface ViewSaveBarProps {
  workspaceId: string;
  projectId: string;
  projectSlug: string;
  canShare: boolean;
  /** `null` on the plain board/list. */
  activeView: ActiveViewInfo | null;
  dirty: boolean;
  /** Active filter chips — on the plain board/list "New view" waits for one. */
  filterCount: number;
  layout: ViewLayout;
  /** The address's view state right now (`pickViewState`). */
  currentParams: Record<string, string>;
}

/**
 * The end of the filter row that turns what you see into a view (BARY-164).
 *
 * - Plain board/list with a filter set: "New view".
 * - An open view whose address left its stored state: "Unsaved", Discard,
 *   New view, and Save where the person may change the view. Someone else's
 *   shared view says whose it is instead of offering Save.
 *
 * On a phone it floats above the list (CSS) rather than squeezing into the
 * filter row.
 */
export function ViewSaveBar({
  workspaceId,
  projectId,
  projectSlug,
  canShare,
  activeView,
  dirty,
  filterCount,
  layout,
  currentParams,
}: ViewSaveBarProps) {
  const t = useTranslations();
  const router = useRouter();
  const { toast } = useUI();
  const openViewModal = useOpenViewModal();
  const [isPending, startTransition] = useTransition();

  const openNew = () =>
    openViewModal({
      workspaceId,
      projectId,
      projectSlug,
      canShare,
      currentParams,
      initialLayout: layout,
    });

  const newButton = (
    <Button
      size="sm"
      variant={activeView && !activeView.canEdit ? "primary" : "elevated"}
      icon={<Icon icon="lucide:plus" width={14} />}
      onClick={openNew}
      disabled={isPending}
    >
      {t("views.newView")}
    </Button>
  );

  if (!activeView) {
    if (filterCount === 0) return null;
    return <div className={styles.inline}>{newButton}</div>;
  }
  if (!dirty) return null;

  const save = () =>
    startTransition(async () => {
      const result = await saveViewState(activeView.id, currentParams);
      if (!result.ok) {
        toast(
          result.error === "forbidden"
            ? t("views.errorForbidden")
            : t("views.errorGeneric"),
        );
        return;
      }
      toast(t("views.saved"));
      router.refresh();
    });

  const sharedBy = activeView.sharedBy
    ? t("views.sharedBy", { name: activeView.sharedBy })
    : t("views.sharedByUnknown");

  return (
    <div className={styles.bar}>
      {activeView.canEdit ? (
        <span className={styles.badge}>{t("views.unsaved")}</span>
      ) : (
        <span className={styles.hint}>
          {t("views.readOnlyHint", { sharedBy })}
        </span>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => router.push(activeView.href)}
      >
        {t("views.discard")}
      </Button>
      {newButton}
      {activeView.canEdit && (
        <Button size="sm" variant="primary" disabled={isPending} onClick={save}>
          {t("actions.save")}
        </Button>
      )}
    </div>
  );
}
