"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { SetFieldValue } from "@/features/custom-fields/types";
import type { IssueComposerData, IssuePatch } from "@/features/issues/types";
import type { DetailFieldKey } from "@/features/projects/detail-fields";
import type { PMDoc } from "@/lib/richtext/types";
import type { IssueDetail } from "@/types";
import { IssueAttachments } from "./components/IssueAttachments";
import { IssueComments } from "./components/IssueComments";
import { IssueCustomFields } from "./components/IssueCustomFields";
import { IssueDescription } from "./components/IssueDescription";
import { IssueLabels } from "./components/IssueLabels";
import { IssueMeta } from "./components/IssueMeta";
import { IssuePlanning } from "./components/IssuePlanning";
import { IssueProperties } from "./components/IssueProperties";
import { IssueRelations } from "./components/IssueRelations";
import { IssueTitle } from "./components/IssueTitle";
import styles from "./issueDetail.module.scss";

/** The attributes on a phone: one collapsible group, open to start with. */
function PropertiesGroup({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const [open, setOpen] = useState(true);
  return (
    <section className={styles.propsGroup}>
      <button
        type="button"
        className={styles.propsToggle}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {t("issues.detailProperties")}
        <Icon
          icon="lucide:chevron-right"
          width={18}
          className={styles.propsChevron}
        />
      </button>
      {/* Hidden, not unmounted: the pickers inside keep their state. */}
      <div className={styles.propsBody} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

interface IssueStackedBodyProps {
  issue: IssueDetail;
  data: IssueComposerData;
  identifier: string;
  visibleFields: Set<DetailFieldKey>;
  /** A phone groups the attributes into one collapsible list up front. */
  isPhone: boolean;
  onPatch: (patch: IssuePatch) => void;
  onField: SetFieldValue;
  onComment: (body: PMDoc) => Promise<void>;
  onRefresh: () => Promise<void>;
}

/**
 * Everything of an issue in one column, in the order you'd read it: what it's
 * about, how it's categorized, what was said about it. The side panel uses it,
 * and on a phone so does the full page — a second column has no room there.
 */
export function IssueStackedBody({
  issue,
  data,
  identifier,
  visibleFields,
  isPhone,
  onPatch,
  onField,
  onComment,
  onRefresh,
}: IssueStackedBodyProps) {
  const showRelations = visibleFields.has("relations");
  const showAttachments = visibleFields.has("attachments");
  const showLabels = visibleFields.has("labels");

  return (
    <div className={styles.body}>
      <IssueTitle
        title={issue.title}
        readOnly={!issue.access.canEdit}
        onPatch={onPatch}
      />
      {isPhone ? (
        <PropertiesGroup>
          <IssueProperties
            issue={issue}
            data={data}
            layout="column"
            visibleFields={visibleFields}
            onPatch={onPatch}
          />
          <IssuePlanning
            issue={issue}
            layout="column"
            visibleFields={visibleFields}
            onPatch={onPatch}
          />
          <IssueCustomFields
            issue={issue}
            members={data.members}
            layout="column"
            onField={onField}
          />
          {showLabels && (
            <IssueLabels
              issue={issue}
              data={data}
              layout="column"
              onPatch={onPatch}
            />
          )}
          <IssueMeta issue={issue} data={data} layout="column" />
        </PropertiesGroup>
      ) : (
        <IssueProperties
          issue={issue}
          data={data}
          layout="column"
          visibleFields={visibleFields}
          onPatch={onPatch}
        />
      )}
      <IssueDescription
        issueId={issue.id}
        description={issue.description}
        data={data}
        readOnly={!issue.access.canEdit}
        onPatch={onPatch}
        onRefresh={onRefresh}
      />
      {showRelations && (
        <IssueRelations issue={issue} data={data} onRefresh={onRefresh} />
      )}
      {showAttachments && (
        <IssueAttachments
          issueId={issue.id}
          attachments={issue.attachments}
          readOnly={!issue.access.canEdit}
          onRefresh={onRefresh}
        />
      )}
      {!isPhone && (
        <>
          <IssuePlanning
            issue={issue}
            layout="column"
            visibleFields={visibleFields}
            onPatch={onPatch}
          />
          <IssueCustomFields
            issue={issue}
            members={data.members}
            layout="column"
            onField={onField}
          />
          {showLabels && (
            <IssueLabels
              issue={issue}
              data={data}
              layout="column"
              onPatch={onPatch}
            />
          )}
          <IssueMeta issue={issue} data={data} layout="column" />
        </>
      )}
      <IssueComments
        issueId={issue.id}
        workspaceId={data.workspaceId}
        identifier={identifier}
        comments={issue.comments}
        activity={issue.activity}
        members={data.members}
        me={data.me}
        data={data}
        canUpdateAnyComment={issue.access.canUpdateAnyComment}
        canDeleteAnyComment={issue.access.canDeleteAnyComment}
        onSubmit={onComment}
        onRefresh={onRefresh}
      />
    </div>
  );
}
