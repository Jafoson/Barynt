"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { IssueComposerData, IssuePatch } from "@/features/issues/types";
import type { DetailFieldKey } from "@/features/projects/detail-fields";
import type { PMDoc } from "@/lib/richtext/types";
import type { IssueDetail } from "@/types";
import { IssueAttachments } from "./components/IssueAttachments";
import { IssueComments } from "./components/IssueComments";
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

/**
 * True once `target` has scrolled out past the top edge of `root`. Not when
 * it's merely below the fold, and not while it has no size — a collapsed
 * `PropertiesGroup` hides it, and then there's nothing to stand in for.
 */
function useScrolledPast(root: HTMLElement | null, target: HTMLElement | null) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!root || !target) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const top = entry.rootBounds?.top ?? 0;
        setPast(
          !entry.isIntersecting &&
            entry.boundingClientRect.height > 0 &&
            entry.boundingClientRect.bottom <= top,
        );
      },
      { root },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [root, target]);
  return past;
}

interface IssueStackedBodyProps {
  issue: IssueDetail;
  data: IssueComposerData;
  identifier: string;
  visibleFields: Set<DetailFieldKey>;
  /** A phone groups the attributes into one collapsible list up front. */
  isPhone: boolean;
  onPatch: (patch: IssuePatch) => void;
  onComment: (body: PMDoc) => Promise<void>;
  onRefresh: () => Promise<void>;
}

/**
 * Everything of an issue in one column, in the order you'd read it: what it's
 * about, how it's categorized, what was said about it. The side panel uses it,
 * and on a phone so does the full page — a second column has no room there.
 *
 * Once type/status/priority/assignee have scrolled away, a compact copy of
 * them slides in under the header, so they stay in reach while reading the
 * description or the comments.
 */
export function IssueStackedBody({
  issue,
  data,
  identifier,
  visibleFields,
  isPhone,
  onPatch,
  onComment,
  onRefresh,
}: IssueStackedBodyProps) {
  const showRelations = visibleFields.has("relations");
  const showAttachments = visibleFields.has("attachments");
  const showLabels = visibleFields.has("labels");

  // Elements, not refs: the observer has to start over once either exists.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [properties, setProperties] = useState<HTMLDivElement | null>(null);
  const pinned = useScrolledPast(scroller, properties);

  return (
    <div className={styles.stack}>
      {/* Out of the tab order and the accessibility tree while hidden —
          the full block is the one to use then. */}
      <div
        className={styles.pinnedProps}
        data-shown={pinned || undefined}
        inert={!pinned}
      >
        <IssueProperties
          issue={issue}
          data={data}
          layout="column"
          visibleFields={visibleFields}
          onPatch={onPatch}
          compact
        />
      </div>
      <div ref={setScroller} className={styles.body}>
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
              ref={setProperties}
            />
            <IssuePlanning
              issue={issue}
              layout="column"
              visibleFields={visibleFields}
              onPatch={onPatch}
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
            ref={setProperties}
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
    </div>
  );
}
