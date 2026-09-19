"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Tooltip } from "@/components/ui/atoms/Tooltip/Tooltip";
import { CreateIssueModal } from "@/features/issues/components/CreateIssueModal/CreateIssueModal";
import type { IssueComposerData } from "@/features/issues/types";
import { usePathname } from "@/i18n/navigation";
import { useHasOpenModal, useModal } from "@/lib/context";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import styles from "./newIssueButton.module.scss";

/** New tasks land in the backlog, provided the workspace has that status. */
const DEFAULT_STATUS = "backlog";

interface NewIssueButtonProps {
  data: IssueComposerData;
}

/**
 * Opens the `CreateIssueModal`. The data comes as props from the server
 * component above — only the route-dependent project choice stays here,
 * because it needs `usePathname()`.
 *
 * Without `issue.create` in any project, the button doesn't exist. It
 * would otherwise be an invitation into a dialog that ends up rejected —
 * the action re-checks this itself anyway. The same gate applies to the
 * "c" shortcut: `useShortcut` is still called unconditionally (Rules of
 * Hooks), just disabled via `enabled` instead of skipped.
 *
 * "c" (no modifier) is the convention Linear and GitHub both use for "new
 * issue" — safe precisely because it's a bare letter: it only fires outside
 * text inputs (`useShortcut`'s default) and while no modal already has
 * focus, so it can never collide with typing or steal a dialog's own keys.
 */
export function NewIssueButton({ data }: NewIssueButtonProps) {
  const { projects, statuses, creatableProjectIds } = data;
  const t = useTranslations();
  const { openModal } = useModal();
  const hasOpenModal = useHasOpenModal();
  const pathname = usePathname();

  const creatable = projects.filter((p) => creatableProjectIds.includes(p.id));

  // On a project route (/<workspace>/project/<slug>/…), preselect the
  // currently open project — but only if creation is allowed there.
  // Otherwise the first allowed one. It can still be switched within the
  // modal itself.
  const activeSlug = pathname.match(/\/project\/([^/]+)/)?.[1];
  const project = creatable.find((p) => p.slug === activeSlug) ?? creatable[0];

  // Workspaces can have their own status lists — without "backlog", the first one.
  const initialStatus =
    statuses.find((s) => s.id === DEFAULT_STATUS)?.id ?? statuses[0]?.id;

  const open = () => {
    if (!project || !initialStatus) return;
    openModal(({ close }) => (
      <CreateIssueModal
        projectId={project.id}
        initialStatus={initialStatus}
        data={data}
        close={close}
      />
    ));
  };

  useShortcut("c", open, {
    enabled: !!project && !!initialStatus && !hasOpenModal,
  });

  if (!project || !initialStatus) return null;

  return (
    <Tooltip
      label={t("actions.newIssue")}
      shortcut="c"
      className={styles.tooltipWrap}
    >
      <Button
        variant="primary"
        className={styles.button}
        full
        icon={<Icon icon="lucide:plus" width={16} />}
        onClick={open}
      >
        <span className={styles.label}>{t("actions.newIssue")}</span>
      </Button>
    </Tooltip>
  );
}
