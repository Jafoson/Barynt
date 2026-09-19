"use client";

import { useTranslations } from "next-intl";
import { CardQuickActions } from "@/features/issues/components/BoardCard/CardQuickActions";
import type { GroupDef } from "@/features/issues/group";
import { Link } from "@/i18n/navigation";
import { useModal } from "@/lib/context";
import { useLongPress } from "@/lib/utils/useLongPress";
import type { IssueDetail, User } from "@/types";

interface IssueRowLinkProps {
  issue: IssueDetail;
  identifier: string;
  /** `useIssueOpen().linkProps(...)` — the tap opens the issue. */
  linkProps: React.ComponentProps<typeof Link>;
  /** Phone/tablet: a long press opens the quick-action sheet instead. */
  compact: boolean;
  members: User[];
  moveTargets: GroupDef[];
  currentGroupId: string;
  onMoveTo: (groupId: string) => void;
  onOpen: () => void;
  onOpenInNewTab: () => void;
  onEditTitle: () => void;
}

/**
 * The link laid over a list row (`Table`'s `rowOverlay`): a tap opens the
 * issue. On a phone or tablet a long press opens the same quick-action sheet
 * a board card has (open, rename, assign, move) — the actions that on a
 * desktop are the row's own pickers, which a touch screen doesn't offer.
 * One component per row, because the long-press hook can't run in a loop.
 */
export function IssueRowLink({
  issue,
  identifier,
  linkProps,
  compact,
  members,
  moveTargets,
  currentGroupId,
  onMoveTo,
  onOpen,
  onOpenInNewTab,
  onEditTitle,
}: IssueRowLinkProps) {
  const t = useTranslations();
  const { openModal } = useModal();

  const openQuickActions = () =>
    openModal(
      ({ close }) => (
        <CardQuickActions
          issue={issue}
          identifier={identifier}
          title={issue.title}
          members={members}
          moveTargets={moveTargets}
          currentGroupId={currentGroupId}
          onMoveTo={onMoveTo}
          onOpen={onOpen}
          onOpenInNewTab={onOpenInNewTab}
          onEditTitle={onEditTitle}
          close={close}
        />
      ),
      { placement: "bottom", label: t("issues.quickActions") },
    );
  const longPress = useLongPress(openQuickActions);

  return (
    <Link
      {...linkProps}
      scroll={false}
      aria-label={`${identifier} ${issue.title}`}
      {...(compact ? longPress : {})}
    />
  );
}
