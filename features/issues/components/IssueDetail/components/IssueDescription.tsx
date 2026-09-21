"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import {
  addIssueLinkAttachment,
  deleteIssueAttachment,
} from "@/features/issues/actions";
import { IssueRichText } from "@/features/issues/components/IssueRichText/IssueRichText";
import type { IssueEditorData, IssuePatch } from "@/features/issues/types";
import { uploadIssueAttachment } from "@/features/issues/uploadAttachment";
import type { PMDoc } from "@/lib/richtext/types";
import styles from "../issueDetail.module.scss";

interface IssueDescriptionProps {
  issueId: string;
  description: PMDoc;
  /** For the suggestions behind `@` and `#` in the description text. */
  data: IssueEditorData;
  /** `!issue.access.canEdit` — without `issue.update.any`/`.own`, display only, no editor. */
  readOnly?: boolean;
  onPatch: (patch: IssuePatch) => void;
  /**
   * Refetches the issue — an attachment upload/delete goes through its own
   * server actions instead of `onPatch`; the panel isn't tied to any server
   * render and needs to learn about the new state this way
   * (`useIssueDetail`).
   */
  onRefresh: () => Promise<void>;
}

/**
 * The description, editable directly inline. Its section header stays
 * visible even without content — otherwise there'd be no place for content
 * to be created in the first place.
 */
export function IssueDescription({
  issueId,
  description,
  data,
  readOnly,
  onPatch,
  onRefresh,
}: IssueDescriptionProps) {
  const t = useTranslations();

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <Icon icon="lucide:align-left" width={15} aria-hidden="true" />
        <h3 className={styles.sectionTitle}>{t("fields.description")}</h3>
      </header>
      <IssueRichText
        className={styles.description}
        value={description}
        data={data}
        label={t("fields.description")}
        placeholder={t("placeholders.editDescription")}
        saveLabel={t("actions.save")}
        cancelLabel={t("actions.cancel")}
        readOnly={readOnly}
        expandOnCompact
        onCommit={(value) => onPatch({ description: value })}
        onUploadAttachment={
          readOnly
            ? undefined
            : async (file) => {
                const result = await uploadIssueAttachment(issueId, file);
                if ("error" in result) return result;
                const { attachment } = result;
                if (!attachment.url) {
                  return { error: t("editor.attachmentUploadFailed") };
                }
                // Not awaited: the node should appear immediately, the
                // attachments section catches up shortly after.
                onRefresh();
                return {
                  id: attachment.id,
                  url: attachment.url,
                  name: attachment.name,
                  mimeType: attachment.mimeType,
                  size: attachment.size,
                };
              }
        }
        onRemoveAttachment={
          readOnly
            ? undefined
            : async (id) => {
                const result = await deleteIssueAttachment(issueId, id);
                if ("error" in result) throw new Error(result.error);
                onRefresh();
              }
        }
        onAddLinkAttachment={
          readOnly
            ? undefined
            : async ({ url, name, mimeType }) => {
                const result = await addIssueLinkAttachment(issueId, {
                  url,
                  name,
                  mimeType,
                });
                if ("error" in result) return result;
                const { attachment } = result;
                if (!attachment.url) {
                  return { error: t("editor.attachmentUploadFailed") };
                }
                // Not awaited: the node should appear immediately, the
                // attachments section catches up shortly after.
                onRefresh();
                return {
                  id: attachment.id,
                  url: attachment.url,
                  name: attachment.name,
                  mimeType: attachment.mimeType,
                  size: attachment.size,
                };
              }
        }
      />
    </section>
  );
}
