"use client";

import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { useIssuePatch } from "@/features/issues/useIssuePatch";
import { fullName } from "@/lib/utils/string";
import type { IssueDetail, User } from "@/types";
import styles from "./assigneePicker.module.scss";

interface AssigneePickerProps {
  issue: IssueDetail;
  members: User[];
  /** Avatar size — the clickable area grows with it. */
  size?: number;
  /**
   * Show the assignee without the dropdown, whatever the permissions — for a
   * phone, where the board card offers its quick-action sheet instead.
   */
  readOnly?: boolean;
}

/**
 * An issue's assignment, changed right where it's shown: the avatar is the
 * trigger. The list and board share this picker — the same avatar means the
 * same thing in both places, so it should behave the same way when touched.
 *
 * `stop` on the `InlinePicker` isn't a nicety here but a requirement: on the
 * board the avatar sits inside a card that itself reacts to clicks.
 *
 * Without `issue.access.canAssign` (mirrors `issue.assign` in `updateIssue`),
 * the avatar stays a pure display value — the same reason as in the detail
 * view (`IssueProperties.tsx`): the server would reject the patch anyway.
 */
export function AssigneePicker({
  issue,
  members,
  size = 22,
  readOnly = false,
}: AssigneePickerProps) {
  const t = useTranslations();
  const { patch } = useIssuePatch(issue.id);
  const assignee = issue.assignee
    ? (members.find((member) => member.id === issue.assignee) ?? null)
    : null;

  if (readOnly || !issue.access.canAssign) {
    return (
      <span
        className={styles.trigger}
        data-readonly
        title={assignee ? fullName(assignee) : t("fields.unassigned")}
      >
        <Avatar avatar={assignee} size={size} placeholder />
      </span>
    );
  }

  return (
    <InlinePicker
      width={220}
      align="end"
      stop
      trigger={
        <button
          type="button"
          className={styles.trigger}
          title={assignee ? fullName(assignee) : t("fields.unassigned")}
          aria-label={t("fields.assignee")}
        >
          <Avatar avatar={assignee} size={size} placeholder />
        </button>
      }
    >
      {(close) => (
        <SelectMenu
          items={[
            {
              value: null,
              label: t("fields.unassigned"),
              icon: <Avatar avatar={null} size={18} placeholder />,
            },
            ...members.map((user) => ({
              value: user.id,
              label: fullName(user),
              icon: <Avatar avatar={user} size={18} />,
            })),
          ]}
          value={issue.assignee}
          onPick={(value) => {
            patch({ assignee: value as string | null });
            close();
          }}
          onClose={close}
          searchable
        />
      )}
    </InlinePicker>
  );
}
