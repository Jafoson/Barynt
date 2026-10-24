"use client";

import { Icon } from "@iconify/react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import type { ISelectItem } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { updateBehavior } from "@/features/account/actions";
import {
  deleteView,
  duplicateView,
  setViewUserState,
} from "@/features/views/actions";
import type { ViewLayout, ViewVisibility } from "@/features/views/schema";
import { viewPath } from "@/features/views/url";
import { useOpenViewModal } from "@/features/views/useOpenViewModal";
import { getPathname, useRouter } from "@/i18n/navigation";
import { usePreferences } from "@/lib/preferences/PreferencesContext";
import { useUI } from "@/lib/ui-store";

/** What a view's menu needs to know about it. */
export interface MenuView {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  layout: ViewLayout;
  visibility: ViewVisibility;
  canEdit: boolean;
  pinned: boolean;
  favorite: boolean;
  startView: boolean;
  /** Its address — with its state where the caller has it. */
  href: string;
  projectId: string | null;
  projectSlug: string | null;
}

/**
 * A view's menu — the tab's "⋯" and the views page's (BARY-178): the
 * person's own switches (pin, star, start view), then edit, duplicate,
 * copy link and delete where allowed. One place, so both offer the same.
 */
export function useViewMenu({
  workspaceId,
  canShare,
  activeId = null,
  withOpen = false,
}: {
  workspaceId: string;
  /** `view.share` in a view's scope — for the edit dialog's "everyone". */
  canShare: (view: MenuView) => boolean;
  /** The open view — deleting it leads away from it. */
  activeId?: string | null;
  /** An "Open" item first (the views page). */
  withOpen?: boolean;
}) {
  const preferences = usePreferences();
  /** A workspace view the app starts on — the person's start page (V7). */
  const isWorkspaceStart = (view: { id: string }) =>
    preferences.startPage === "view" && preferences.startViewId === view.id;
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const openViewModal = useOpenViewModal();
  const { toast } = useUI();
  const [, startTransition] = useTransition();

  const errorText = (error: string) =>
    error === "forbidden"
      ? t("views.errorForbidden")
      : error === "notFound"
        ? t("views.errorNotFound")
        : t("views.errorGeneric");

  const itemsFor = (view: MenuView): ISelectItem[] => [
    ...(withOpen
      ? [
          {
            value: "open",
            label: t("views.open"),
            icon: <Icon icon="lucide:arrow-up-right" width={15} />,
          },
        ]
      : []),
    // The viewer's own switches (V7), each saying what a click does now.
    // Pinning puts it under its project in the sidebar — not for a
    // workspace view, which has none.
    ...(view.projectId
      ? [
          {
            value: "pin",
            label: view.pinned ? t("views.unpin") : t("views.pin"),
            icon: (
              <Icon
                icon={view.pinned ? "lucide:pin-off" : "lucide:pin"}
                width={15}
              />
            ),
          },
        ]
      : []),
    {
      value: "favorite",
      label: view.favorite ? t("views.unfavorite") : t("views.favorite"),
      icon: (
        <Icon
          icon={view.favorite ? "lucide:star-off" : "lucide:star"}
          width={15}
        />
      ),
    },
    {
      value: "startView",
      // A project's start view opens with the project; a workspace view's
      // is where the app starts (the person's start page, V7).
      label: view.projectId
        ? view.startView
          ? t("views.unsetStartView")
          : t("views.startView")
        : isWorkspaceStart(view)
          ? t("views.tabs.start.unset")
          : t("views.tabs.start.set"),
      icon: <Icon icon="lucide:house" width={15} />,
    },
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

  const setState = (
    view: MenuView,
    patch: { pinned?: boolean; favorite?: boolean; startView?: boolean },
    done: string,
  ) =>
    startTransition(async () => {
      const result = await setViewUserState(view.id, patch);
      if (!result.ok) return toast(errorText(result.error));
      toast(done);
      router.refresh();
    });

  const run = (view: MenuView, action: string | number | null) => {
    if (action === "open") {
      router.push(view.href);
    } else if (action === "pin") {
      setState(
        view,
        { pinned: !view.pinned },
        view.pinned ? t("views.unpinned") : t("views.pinned"),
      );
    } else if (action === "favorite") {
      setState(
        view,
        { favorite: !view.favorite },
        view.favorite ? t("views.unfavorited") : t("views.favorited"),
      );
    } else if (action === "startView" && !view.projectId) {
      const on = !isWorkspaceStart(view);
      startTransition(async () => {
        const result = await updateBehavior(
          on
            ? { startPage: "view", startViewId: view.id }
            : { startPage: "workspace", startViewId: null },
        );
        if ("error" in result) return toast(result.error);
        toast(on ? t("views.tabs.start.on") : t("views.tabs.start.off"));
        router.refresh();
      });
    } else if (action === "startView") {
      setState(
        view,
        { startView: !view.startView },
        view.startView ? t("views.startViewOff") : t("views.startViewOn"),
      );
    } else if (action === "edit") {
      openViewModal({
        workspaceId,
        projectId: view.projectId,
        projectSlug: view.projectSlug,
        canShare: canShare(view),
        view: {
          id: view.id,
          name: view.name,
          icon: view.icon,
          color: view.color,
          visibility: view.visibility,
          layout: view.layout,
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
        router.push(viewPath(workspaceId, view.projectSlug, result.data.slug));
      });
    } else if (action === "copyLink") {
      const path = getPathname({ href: view.href, locale });
      navigator.clipboard
        .writeText(`${window.location.origin}${path}`)
        .then(() => toast(t("views.linkCopied")))
        .catch(() => toast(t("views.errorGeneric")));
    } else if (action === "delete") {
      // Ask first, outside the transition: React holds back every update of
      // a running async transition until it finishes — the confirm dialog
      // opening is one of them, so asking inside it would wait forever.
      void (async () => {
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
        startTransition(async () => {
          const result = await deleteView(view.id);
          if (!result.ok) return toast(errorText(result.error));
          toast(t("views.deleted"));
          if (view.id === activeId)
            router.push(
              view.projectSlug
                ? `/${workspaceId}/project/${view.projectSlug}`
                : `/${workspaceId}/issues`,
            );
          else router.refresh();
        });
      })();
    }
  };

  return { itemsFor, run, setState };
}
