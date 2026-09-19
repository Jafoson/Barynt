"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { IssueComposerData } from "@/features/issues/types";
import { CreateProjectModal } from "@/features/projects/components/CreateProjectModal/CreateProjectModal";
import { usePathname } from "@/i18n/navigation";
import { useModal } from "@/lib/context";
import styles from "./newIssueFab.module.scss";
import { useNewIssueOpener } from "./useNewIssueOpener";

/**
 * Where creating something from a floating button makes sense: a project's
 * board or list, and "my issues" — the views full of issues. Not settings,
 * members, the dashboard and so on.
 */
export const ISSUE_VIEW_PATH =
  /^\/[^/]+\/(project\/[^/]+(\/list)?|my(\/list)?)\/?$/;

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
  const { openModal } = useModal();
  const openIssue = useNewIssueOpener(data);
  const [open, setOpen] = useState(false);

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

  if (!ISSUE_VIEW_PATH.test(pathname)) return null;

  const choices: Choice[] = [];
  if (openIssue) {
    choices.push({
      id: "issue",
      label: t("actions.newIssue"),
      icon: "lucide:circle-plus",
      onPick: openIssue,
    });
  }
  if (canCreateProject && workspaceId) {
    choices.push({
      id: "project",
      label: t("actions.newProject"),
      icon: "lucide:folder-plus",
      onPick: () =>
        openModal(({ close }) => (
          <CreateProjectModal workspaceId={workspaceId} close={close} />
        )),
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
