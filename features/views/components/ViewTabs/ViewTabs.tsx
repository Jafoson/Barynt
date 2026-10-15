"use client";

import { Icon } from "@iconify/react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import {
  type ISelectItem,
  SelectMenu,
} from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { deleteView, duplicateView } from "@/features/views/actions";
import { viewIconOf } from "@/features/views/icons";
import type { ViewLayout, ViewVisibility } from "@/features/views/schema";
import { viewPath } from "@/features/views/url";
import { useOpenViewModal } from "@/features/views/useOpenViewModal";
import { getPathname, Link, useRouter } from "@/i18n/navigation";
import { useUI } from "@/lib/ui-store";
import styles from "./viewTabs.module.scss";

/** One view as the row shows it — prepared on the server (`Topbar`). */
export interface ViewTab {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  layout: ViewLayout;
  visibility: ViewVisibility;
  canEdit: boolean;
  /** The view's own address, state included (`viewParams`). */
  href: string;
  /** Name of who shared it — set only for someone else's shared view. */
  sharedBy: string | null;
}

interface ViewTabsProps {
  workspaceId: string;
  projectId: string;
  projectSlug: string;
  canShare: boolean;
  views: ViewTab[];
  /** The open view, `null` on the plain board/list. */
  activeId: string | null;
  /** The open view's address differs from its stored state. */
  dirty: boolean;
}

/**
 * The project's saved views as elevated chips between the title and the
 * filter row (BARY-164); the open one in the primary color. Board, list and dashboard aren't in here — they keep their
 * places in the sidebar and the board/list switch. Without any view the row
 * isn't rendered at all; "New view" in the filter row is the way in.
 */
export function ViewTabs({
  workspaceId,
  projectId,
  projectSlug,
  canShare,
  views,
  activeId,
  dirty,
}: ViewTabsProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const openViewModal = useOpenViewModal();
  const { toast } = useUI();
  const [, startTransition] = useTransition();
  const [menuFor, setMenuFor] = useState<string | null>(null);

  if (views.length === 0) return null;

  const errorText = (error: string) =>
    error === "forbidden"
      ? t("views.errorForbidden")
      : error === "notFound"
        ? t("views.errorNotFound")
        : t("views.errorGeneric");

  const itemsFor = (view: ViewTab): ISelectItem[] => [
    ...(view.canEdit
      ? [
          {
            value: "edit",
            label: t("views.edit"),
            icon: <Icon icon="lucide:pencil" width={15} />,
          },
        ]
      : []),
    {
      value: "duplicate",
      label: t("views.duplicate"),
      icon: <Icon icon="lucide:copy" width={15} />,
    },
    {
      value: "copyLink",
      label: t("views.copyLink"),
      icon: <Icon icon="lucide:link" width={15} />,
    },
    ...(view.canEdit
      ? [
          {
            value: "delete",
            label: t("views.delete"),
            icon: <Icon icon="lucide:trash-2" width={15} />,
          },
        ]
      : []),
  ];

  const run = (view: ViewTab, action: string | number | null) => {
    if (action === "edit") {
      openViewModal({
        workspaceId,
        projectId,
        projectSlug,
        canShare,
        view: {
          id: view.id,
          name: view.name,
          icon: view.icon,
          color: view.color,
          visibility: view.visibility,
        },
      });
    } else if (action === "duplicate") {
      startTransition(async () => {
        const result = await duplicateView(
          view.id,
          t("views.copyName", { name: view.name }),
        );
        if (!result.ok) return toast(errorText(result.error));
        toast(t("views.created"));
        router.push(viewPath(workspaceId, projectSlug, result.data.slug));
      });
    } else if (action === "copyLink") {
      const path = getPathname({ href: view.href, locale });
      navigator.clipboard
        .writeText(`${window.location.origin}${path}`)
        .then(() => toast(t("views.linkCopied")))
        .catch(() => toast(t("views.errorGeneric")));
    } else if (action === "delete") {
      startTransition(async () => {
        const ok = await confirm({
          title: t("views.deleteTitle", { name: view.name }),
          description:
            view.visibility === "PRIVATE"
              ? t("views.deletePrivateBody")
              : t("views.deleteSharedBody"),
          confirmLabel: t("views.delete"),
          cancelLabel: t("actions.cancel"),
          danger: true,
        });
        if (!ok) return;
        const result = await deleteView(view.id);
        if (!result.ok) return toast(errorText(result.error));
        toast(t("views.deleted"));
        if (view.id === activeId)
          router.push(`/${workspaceId}/project/${projectSlug}`);
        else router.refresh();
      });
    }
  };

  return (
    <nav className={styles.row} aria-label={t("views.tabsLabel")}>
      {views.map((view) => {
        const active = view.id === activeId;
        return (
          <Chip
            key={view.id}
            variant="elevated"
            className={styles.tab}
            data-active={active || undefined}
            data-dirty={(active && dirty) || undefined}
            data-menu-open={menuFor === view.id || undefined}
            icon={
              <Icon
                icon={viewIconOf(view)}
                width={14}
                style={view.color ? { color: view.color } : undefined}
              />
            }
            trailing={
              <InlinePicker
                width={240}
                align="start"
                open={menuFor === view.id}
                onOpenChange={(open) => setMenuFor(open ? view.id : null)}
                trigger={
                  <button
                    type="button"
                    className={styles.more}
                    aria-label={t("views.menu")}
                    title={t("views.menu")}
                  >
                    <Icon icon="lucide:more-horizontal" width={14} />
                  </button>
                }
              >
                {(close) => (
                  <>
                    {view.sharedBy && (
                      <div className={styles.menuHead}>
                        {t("views.sharedBy", { name: view.sharedBy })}
                      </div>
                    )}
                    <SelectMenu
                      items={itemsFor(view)}
                      value={null}
                      onPick={(value) => {
                        close();
                        run(view, value);
                      }}
                      onClose={close}
                    />
                  </>
                )}
              </InlinePicker>
            }
          >
            <Link
              href={view.href}
              className={styles.link}
              aria-current={active ? "page" : undefined}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuFor(view.id);
              }}
            >
              {view.name}
              {view.visibility !== "PRIVATE" && (
                <Icon
                  icon="lucide:users"
                  width={12}
                  className={styles.shared}
                  aria-label={t("views.shared")}
                />
              )}
            </Link>
          </Chip>
        );
      })}
    </nav>
  );
}
