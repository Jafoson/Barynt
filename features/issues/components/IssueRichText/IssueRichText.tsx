"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { EditableRichText } from "@/components/ui/layout/RichTextEditor/EditableRichText";
import type {
  IssueSource,
  MentionSource,
  UploadedAttachment,
} from "@/components/ui/layout/RichTextEditor/RichTextEditor";
import { StatusIcon } from "@/features/issues/components/IssueIcons/IssueIcons";
import type { IssueEditorData } from "@/features/issues/types";
import type { PMDoc } from "@/lib/richtext/types";
import { fullName } from "@/lib/utils/string";

/**
 * The domain-aware wrapper around `EditableRichText`.
 *
 * `components/ui` must know nothing about workspaces, members, or issue
 * keys — this is where both are brought together: the workspace data is
 * turned into the suggestion lists for `@` and `#`, complete with avatar
 * and status icon.
 *
 * The description and comments use this same component, so they behave
 * identically and don't drift apart.
 */

interface IssueRichTextProps {
  value: PMDoc | unknown;
  onCommit: (value: PMDoc) => void;
  /** See `EditableRichText` — live instead of only on blur. */
  onChange?: (value: PMDoc) => void;
  data: IssueEditorData;
  label: string;
  placeholder?: string;
  saveLabel?: string;
  cancelLabel?: string;
  /** See `EditableRichText` — off where a dialog carries its own buttons. */
  actions?: boolean;
  /** See `EditableRichText` — display only, no click opens the editor. */
  readOnly?: boolean;
  /** See `RichTextEditor` — upload/remove an attachment. Missing ⇒ no
   *  toolbar button, no intercepting files on drop/paste. */
  onUploadAttachment?: (
    file: File,
  ) => Promise<UploadedAttachment | { error: string }>;
  onRemoveAttachment?: (id: string) => Promise<void>;
  /** See `RichTextEditor` — register an image URL as an attachment. */
  onAddLinkAttachment?: (input: {
    url: string;
    name?: string;
    mimeType?: string | null;
  }) => Promise<UploadedAttachment | { error: string }>;
  className?: string;
  /** See `EditableRichText` — controls the editing state from outside. */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** See `EditableRichText` — editing fills the screen on a phone/tablet. */
  expandOnCompact?: boolean;
}

/** Builds the suggestion lists once per data snapshot. */
export function useEditorSources(data: IssueEditorData): {
  members: MentionSource[];
  issues: IssueSource[];
} {
  return useMemo(() => {
    const members: MentionSource[] = data.members.map((m) => ({
      id: m.id,
      name: fullName(m),
      avatar: <Avatar avatar={m} size={20} />,
    }));

    const issues: IssueSource[] = data.searchIssues.map((i) => {
      const project = data.projects.find((p) => p.id === i.project);
      return {
        id: i.id,
        identifier: `${project?.prefix ?? "?"}-${i.key}`,
        title: i.title,
        icon: (
          <StatusIcon
            status={i.status}
            size={15}
            color={data.statuses.find((s) => s.id === i.status)?.color}
          />
        ),
      };
    });

    return { members, issues };
  }, [data.members, data.searchIssues, data.projects, data.statuses]);
}

export function IssueRichText({
  value,
  onCommit,
  onChange,
  data,
  label,
  placeholder,
  saveLabel,
  cancelLabel,
  actions,
  readOnly,
  onUploadAttachment,
  onRemoveAttachment,
  onAddLinkAttachment,
  className,
  editing,
  onEditingChange,
  expandOnCompact,
}: IssueRichTextProps) {
  const { members, issues } = useEditorSources(data);
  const t = useTranslations("editor");

  return (
    <EditableRichText
      labels={{
        copy: t("copy"),
        copied: t("copied"),
        attachmentRemoved: t("attachmentRemoved"),
      }}
      value={value}
      onCommit={onCommit}
      onChange={onChange}
      label={label}
      placeholder={placeholder}
      saveLabel={saveLabel}
      cancelLabel={cancelLabel}
      actions={actions}
      readOnly={readOnly}
      members={members}
      issues={issues}
      onUploadAttachment={onUploadAttachment}
      onRemoveAttachment={onRemoveAttachment}
      onAddLinkAttachment={onAddLinkAttachment}
      className={className}
      editing={editing}
      onEditingChange={onEditingChange}
      expandOnCompact={expandOnCompact}
    />
  );
}
