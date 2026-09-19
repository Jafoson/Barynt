"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import { GroupIcon } from "@/features/issues/components/GroupIcon/GroupIcon";
import type { GroupDef } from "@/features/issues/group";
import { useIssuePatch } from "@/features/issues/useIssuePatch";
import { fullName } from "@/lib/utils/string";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import type { IssueDetail, User } from "@/types";
import styles from "./cardQuickActions.module.scss";

interface CardQuickActionsProps {
  issue: IssueDetail;
  identifier: string;
  title: string;
  members: User[];
  /** The board's columns and the card's own — "Move to". */
  moveTargets?: GroupDef[];
  currentGroupId?: string;
  onMoveTo?: (groupId: string) => void;
  onOpen: () => void;
  onOpenInNewTab: () => void;
  onEditTitle: () => void;
  close: () => void;
}

/**
 * What a long press on a board card opens, as a bottom sheet: the actions
 * someone reaches for most, one tap each — open, rename, assign, move.
 * Without a mouse there's no hover, no drag and no right click, so this is
 * where they live. What's offered follows the issue's permissions.
 */
export function CardQuickActions({
  issue,
  identifier,
  title,
  members,
  moveTargets,
  currentGroupId,
  onMoveTo,
  onOpen,
  onOpenInNewTab,
  onEditTitle,
  close,
}: CardQuickActionsProps) {
  const t = useTranslations();
  const { patch } = useIssuePatch(issue.id);
  const [view, setView] = useState<"main" | "assignee">("main");
  const [query, setQuery] = useState("");
  // A phone has no tabs to speak of: "open in new tab" is for a tablet.
  const isPhone = useMediaQuery(PHONE_QUERY);

  // Swipe down to close — from the bar, or from the list while it's at the top.
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  // The assignee list, narrowed by the search field.
  const needle = query.trim().toLowerCase();
  const matches = (label: string) => label.toLowerCase().includes(needle);
  const shownMembers = members.filter((user) => matches(fullName(user)));
  const showUnassigned = matches(t("fields.unassigned"));

  /** Runs the action and closes the sheet. */
  const act = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <Modal variant="sheet" style={swipe.style} {...swipe.handlers}>
      <SheetHeader
        caption={identifier}
        title={title}
        onBack={view === "assignee" ? () => setView("main") : undefined}
        backLabel={t("issues.quickBack")}
        onClose={close}
        closeLabel={t("actions.close")}
      />

      <ModalBody ref={bodyRef} className={styles.body}>
        {view === "main" ? (
          <>
            <Row
              icon="lucide:maximize-2"
              label={t("issues.quickOpen")}
              onClick={act(onOpen)}
            />
            {!isPhone && (
              <Row
                icon="lucide:external-link"
                label={t("issues.quickOpenNewTab")}
                onClick={act(onOpenInNewTab)}
              />
            )}
            {issue.access.canEdit && (
              <Row
                icon="lucide:pencil"
                label={t("actions.editTitle")}
                onClick={act(onEditTitle)}
              />
            )}
            {issue.access.canAssign && (
              <Row
                icon="lucide:user-round-plus"
                label={t("issues.quickAssign")}
                onClick={() => setView("assignee")}
                chevron
              />
            )}

            {issue.access.canEdit && moveTargets && onMoveTo && (
              <>
                <p className={styles.section}>{t("issues.moveTo")}</p>
                {moveTargets.map((group) => (
                  <Row
                    key={group.id}
                    leading={<GroupIcon group={group} size={18} />}
                    label={group.label}
                    current={group.id === currentGroupId}
                    onClick={act(() => {
                      if (group.id !== currentGroupId) onMoveTo(group.id);
                    })}
                  />
                ))}
              </>
            )}
          </>
        ) : (
          <>
            <Input
              variant="search"
              className={styles.search}
              placeholder={t("placeholders.search")}
              aria-label={t("fields.assignee")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {showUnassigned && (
              <Row
                leading={<Avatar avatar={null} size={22} placeholder />}
                label={t("fields.unassigned")}
                current={issue.assignee === null}
                onClick={act(() => patch({ assignee: null }))}
              />
            )}
            {shownMembers.map((user) => (
              <Row
                key={user.id}
                leading={<Avatar avatar={user} size={22} />}
                label={fullName(user)}
                current={issue.assignee === user.id}
                onClick={act(() => patch({ assignee: user.id }))}
              />
            ))}
            {!showUnassigned && shownMembers.length === 0 && (
              <p className={styles.empty}>
                {t("empty.noResults", { q: query.trim() })}
              </p>
            )}
          </>
        )}
      </ModalBody>
    </Modal>
  );
}

interface RowProps {
  icon?: string;
  leading?: React.ReactNode;
  label: string;
  onClick: () => void;
  /** The state the issue is in already — marked, not disabled. */
  current?: boolean;
  chevron?: boolean;
}

function Row({ icon, leading, label, onClick, current, chevron }: RowProps) {
  return (
    <button
      type="button"
      className={styles.row}
      aria-current={current || undefined}
      onClick={onClick}
    >
      <span className={styles.lead}>
        {leading ?? (icon && <Icon icon={icon} width={20} />)}
      </span>
      <span className={styles.label}>{label}</span>
      {current && (
        <Icon icon="lucide:check" width={18} className={styles.check} />
      )}
      {chevron && (
        <Icon icon="lucide:chevron-right" width={18} className={styles.check} />
      )}
    </button>
  );
}
