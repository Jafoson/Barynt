"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import { CreateIssueModal } from "@/features/issues/components/CreateIssueModal/CreateIssueModal";
import { GroupIcon } from "@/features/issues/components/GroupIcon/GroupIcon";
import type { GroupDef } from "@/features/issues/group";
import type { IssueComposerData } from "@/features/issues/types";
import { useModal } from "@/lib/context";
import styles from "../listView.module.scss";

interface ListGroupHeaderProps {
  group: GroupDef;
  count: number;
  /** Without a project there is no "+" — see `ListView`. */
  projectId?: string;
  composer: IssueComposerData;
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Header of a status group — collapses its rows and, on request, creates an
 * issue directly in this status. Same gesture as the column header on the board.
 */
export function ListGroupHeader({
  group,
  count,
  projectId,
  composer,
  collapsed,
  onToggle,
}: ListGroupHeaderProps) {
  const t = useTranslations();
  const { openModal } = useModal();

  // Same as the board's column header: without `issue.create` in this project
  // the plus is missing. The server has already decided this
  // (`creatableProjectIds`). Without a project the question doesn't arise.
  const canCreate =
    projectId !== undefined && composer.creatableProjectIds.includes(projectId);
  // Same fallback as `BoardColumn`: outside a status grouping the group has
  // no status to preset.
  const initialStatus =
    group.key === "status"
      ? group.id
      : (composer.statuses.find((s) => s.isColumn)?.id ??
        composer.statuses[0]?.id ??
        "");

  const createIssue = () => {
    if (projectId === undefined) return;
    openModal(({ close }) => (
      <CreateIssueModal
        projectId={projectId}
        initialStatus={initialStatus}
        data={composer}
        close={close}
      />
    ));
  };

  return (
    <>
      <button
        type="button"
        className={styles.groupToggle}
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={t(collapsed ? "actions.expandGroup" : "actions.collapseGroup")}
        aria-label={t(
          collapsed ? "actions.expandGroup" : "actions.collapseGroup",
        )}
      >
        <Icon icon="lucide:chevron-down" width={13} />
      </button>
      <GroupIcon group={group} size={15} />
      <span className={styles.groupName}>{group.label}</span>
      <span className={styles.groupCount}>{count}</span>
      {canCreate && (
        <Button
          variant="ghost"
          size="sm"
          className={styles.groupAdd}
          title={t("actions.newIssue")}
          aria-label={t("actions.newIssue")}
          icon={<Icon icon="lucide:plus" width={15} />}
          onClick={createIssue}
        />
      )}
    </>
  );
}
