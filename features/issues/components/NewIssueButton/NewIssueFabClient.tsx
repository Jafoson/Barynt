"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { IssueComposerData } from "@/features/issues/types";
import { useOpenCreateProject } from "@/features/projects/useOpenCreateProject";
import { useNewViewAction } from "@/features/views/newViewAction";
import { usePathname } from "@/i18n/navigation";
import { useFabAction } from "@/lib/fab-action";
import styles from "./newIssueFab.module.scss";
import { useNewIssueOpener } from "./useNewIssueOpener";

/**
 * Where creating something from a floating button makes sense: a project's
 * board or list, its saved views (BARY-164), the workspace's own board,
 * list, views and directory of views (V8), and "my issues" — the views full
 * of issues. Not settings, members, the dashboard and so on.
 */
export const ISSUE_VIEW_PATH =
  /^\/[^/]+\/(project\/[^/]+(\/list|\/view\/[^/]+)?|issues(\/list)?|views?(\/[^/]+)?|my(\/list)?)\/?$/;

/** The overview pages where the same menu is on offer: the workspace's
 *  overview (its root), dashboard, projects, members and teams, and a project's overview and
 *  members. */
export const OVERVIEW_PATH =
  /^\/(?!admin(?:\/|$))[^/]+(\/(dashboard|projects|members|teams|project\/[^/]+\/(overview|members)))?\/?$/;

interface NewIssueFabClientProps {
  data: IssueComposerData | null;
  workspaceId: string | null;
  canCreateProject: boolean;
}

interface Choice {
  id: string;
  label: string;
  icon: string;
  onPick: () => void;
}

/**
 * The floating plus (phone only, CSS). With one thing to create, a tap opens
 * it. With two (an issue and a project) it's a FAB menu: the plus turns into
 * a cross and the choices fan out above it as labelled buttons, over a scrim.
 */
export function NewIssueFabClient({
  data,
  workspaceId,
  canCreateProject,
}: NewIssueFabClientProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const openCreateProject = useOpenCreateProject();
  const openIssue = useNewIssueOpener(data);
  // Registered by the topbar on a project's board/list (`NewViewButton`).
  const newView = useNewViewAction();
  const [open, setOpen] = useState(false);
  // A page's own job for the plus (the dashboard's "add widget").
  const pageAction = useFabAction();

  // Escape closes the menu (a phone with a keyboard attached, or a desktop
  // window narrowed to phone width).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pageAction) {
    return (
      <div className={styles.root}>
        <button
          type="button"
          className={styles.fab}
          data-variant={pageAction.variant}
          data-extended={pageAction.text ? true : undefined}
          aria-label={pageAction.label}
          title={pageAction.label}
          onClick={pageAction.run}
        >
          <Icon
            icon={pageAction.icon}
            width={pageAction.text ? 20 : 26}
            className={styles.plus}
          />
          {pageAction.text && <span>{pageAction.text}</span>}
        </button>
      </div>
    );
  }

  if (!ISSUE_VIEW_PATH.test(pathname) && !OVERVIEW_PATH.test(pathname)) {
    return null;
  }

  const choices: Choice[] = [];
  if (openIssue) {
    choices.push({
      id: "issue",
      label: t("actions.newIssue"),
      icon: "lucide:circle-plus",
      onPick: openIssue,
    });
  }
  if (newView) {
    choices.push({
      id: "view",
      label: newView.label,
      icon: "lucide:layers",
      onPick: newView.run,
    });
  }
  if (canCreateProject && workspaceId) {
    choices.push({
      id: "project",
      label: t("actions.newProject"),
      icon: "lucide:folder-plus",
      onPick: () => openCreateProject(workspaceId),
    });
  }
  if (choices.length === 0) return null;

  const isMenu = choices.length > 1;

  return (
    <div className={styles.root}>
      {open && (
        <button
          type="button"
          className={styles.scrim}
          aria-label={t("actions.close")}
          tabIndex={-1}
          onClick={() => setOpen(false)}
        />
      )}

      {isMenu && open && (
        <div className={styles.menu} role="menu">
          {choices.map((choice, index) => (
            <button
              key={choice.id}
              type="button"
              role="menuitem"
              className={styles.choice}
              style={{ "--i": index } as React.CSSProperties}
              onClick={() => {
                setOpen(false);
                choice.onPick();
              }}
            >
              <Icon icon={choice.icon} width={18} />
              {choice.label}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className={styles.fab}
        aria-label={isMenu && open ? t("actions.close") : t("actions.create")}
        aria-haspopup={isMenu ? "menu" : undefined}
        aria-expanded={isMenu ? open : undefined}
        data-open={open || undefined}
        onClick={() => (isMenu ? setOpen((o) => !o) : choices[0].onPick())}
      >
        <Icon icon="lucide:plus" width={26} className={styles.plus} />
      </button>
    </div>
  );
}
