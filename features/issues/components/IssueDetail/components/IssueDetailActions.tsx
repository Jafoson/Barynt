"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import {
  isBrowserClick,
  issuePath,
  useIssueOpen,
} from "@/features/issues/issue-links";
import { Link } from "@/i18n/navigation";
import { useModal } from "@/lib/context";
import type { User } from "@/types";
import styles from "../issueDetail.module.scss";
import { ShareIssueModal } from "./ShareIssueModal";

interface OpenPageButtonProps {
  workspaceId: string;
  identifier: string;
}

/**
 * Leads from the panel and dialog to the issue's full page — by default in a
 * new tab of Barynt's own, so the view behind the panel (filters, scroll
 * position) stays as it was. Each person can pick a browser tab or the same
 * tab instead (`issuePageOpenMode`).
 *
 * A link, not a button: the `href` keeps middle click and "open link in new
 * tab" working untouched; only the plain left click is taken over
 * (`openFullPage`). Appearance and dimensions come from `.headerLink` — the
 * same as the ghost buttons next to it.
 */
export function OpenPageButton({
  workspaceId,
  identifier,
}: OpenPageButtonProps) {
  const t = useTranslations();
  const label = t("actions.openPage");
  const { openFullPage } = useIssueOpen(workspaceId);

  return (
    <Link
      href={issuePath(workspaceId, identifier)}
      className={styles.headerLink}
      onClick={(event) => {
        if (isBrowserClick(event)) return;
        event.preventDefault();
        openFullPage(identifier);
      }}
      aria-label={label}
      title={label}
    >
      <Icon icon="lucide:external-link" width={15} aria-hidden="true" />
    </Link>
  );
}

/** What the share dialog needs — given only where `issue.access.canShare`. */
interface ShareOptions {
  issueId: string;
  /** Ready-made URL from the server — `null` while sharing is off. */
  shareUrl: string | null;
  members: User[];
  me: { id: string };
}

interface IssueActionsMenuProps {
  onDelete: () => void;
  /** `issue.access.canDelete` — without `issue.delete.any`/`.own` there is no delete entry. */
  canDelete: boolean;
  /**
   * Adds "share the public link": opens the dialog for enabling/disabling the
   * public read-only link. Leave out without `issue.share.manage` — the entry
   * then doesn't exist at all.
   */
  share?: ShareOptions;
}

/**
 * The "…" menu in the header.
 *
 * The link to the full page used to be an entry here — it's now its own
 * button next to it (`OpenPageButton`), and having the same action twice in
 * the same row would just be noise.
 *
 * Entries: sharing the public link (with `share`) and delete (with
 * `canDelete`). Without either the menu would be left with nothing in it, so
 * it isn't rendered at all in that case.
 */
export function IssueActionsMenu({
  onDelete,
  canDelete,
  share,
}: IssueActionsMenuProps) {
  const t = useTranslations();
  const { openModal } = useModal();

  if (!canDelete && !share) return null;

  const items = [
    ...(share
      ? [
          {
            value: "share",
            label: t("share.trigger"),
            icon: <Icon icon="lucide:link" width={15} />,
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            value: "delete",
            label: t("actions.deleteIssue"),
            icon: <Icon icon="lucide:trash-2" width={15} />,
          },
        ]
      : []),
  ];

  const openShare = () => {
    if (!share) return;
    openModal(({ close }) => (
      <ShareIssueModal
        issueId={share.issueId}
        shareUrl={share.shareUrl}
        members={share.members}
        me={share.me}
        close={close}
      />
    ));
  };

  return (
    <InlinePicker
      width={260}
      align="end"
      trigger={
        <Button
          variant="ghost"
          size="sm"
          icon={<Icon icon="lucide:more-horizontal" width={16} />}
          aria-label={t("actions.moreActions")}
          title={t("actions.moreActions")}
        />
      }
    >
      {(close) => (
        <SelectMenu
          items={items}
          value={null}
          onPick={(value) => {
            close();
            if (value === "share") openShare();
            else if (value === "delete") onDelete();
          }}
          onClose={close}
        />
      )}
    </InlinePicker>
  );
}
