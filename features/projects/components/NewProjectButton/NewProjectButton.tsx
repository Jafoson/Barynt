"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Tooltip } from "@/components/ui/atoms/Tooltip/Tooltip";
import { CreateProjectModal } from "@/features/projects/components/CreateProjectModal/CreateProjectModal";
import { useHasOpenModal, useModal } from "@/lib/context";
import { useShortcut } from "@/lib/shortcuts/useShortcut";

interface NewProjectButtonProps {
  workspaceId: string;
  /** Just the plus icon, for tight spots like the sidebar heading. */
  compact?: boolean;
  /**
   * Binds "n" to this instance. Off by default: `NewProjectButton` is
   * rendered from several places at once (this sidebar heading, the
   * project overview page, the dashboard) — only the one that's always
   * mounted (the sidebar heading, `NavGroupProjects`) should own the
   * shortcut, or pressing "n" would open the modal once per mounted
   * instance.
   */
  shortcut?: boolean;
}

/**
 * Opens the `CreateProjectModal`. A dedicated Client Component so Server
 * Components (sidebar navigation, project list) can use the button without
 * becoming Client Components themselves.
 */
export function NewProjectButton({
  workspaceId,
  compact = false,
  shortcut = false,
}: NewProjectButtonProps) {
  const t = useTranslations();
  const { openModal } = useModal();
  const hasOpenModal = useHasOpenModal();

  const open = () =>
    openModal(({ close }) => (
      <CreateProjectModal workspaceId={workspaceId} close={close} />
    ));

  // "n" (no modifier), same convention as "c" for a new issue
  // (`NewIssueButton.tsx`) — bare because it only fires outside text
  // inputs and while no modal already has focus, so it can't collide with
  // typing or steal a dialog's own keys. Not "p": that's already "change
  // priority" while an issue is open (`IssueProperties.tsx`), and that
  // shortcut and this sidebar heading are both live on every issue page.
  useShortcut("n", open, { enabled: shortcut && !hasOpenModal });

  if (compact) {
    return (
      <Tooltip
        label={t("actions.newProject")}
        shortcut={shortcut ? "n" : undefined}
      >
        <Button
          variant="text"
          icon={<Icon icon="lucide:plus" width={15} />}
          aria-label={t("actions.newProject")}
          onClick={open}
        />
      </Tooltip>
    );
  }

  return (
    <Button
      variant="primary"
      icon={<Icon icon="lucide:plus" width={15} />}
      onClick={open}
    >
      {t("actions.newProject")}
    </Button>
  );
}
