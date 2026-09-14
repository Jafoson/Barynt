"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import { issuePath } from "@/features/issues/issue-links";
import type { IssueComposerData, IssuePatch } from "@/features/issues/types";
import { Link, useRouter } from "@/i18n/navigation";
import { useHasOpenModal } from "@/lib/context";
import type { PMDoc } from "@/lib/richtext/types";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import { useUI } from "@/lib/ui-store";
import type { IssueDetail, Project } from "@/types";
import { IssueAttachments } from "./components/IssueAttachments";
import { IssueComments } from "./components/IssueComments";
import { IssueDescription } from "./components/IssueDescription";
import {
  IssueActionsMenu,
  ShareIssueButton,
} from "./components/IssueDetailActions";
import { IssueRelations } from "./components/IssueRelations";
import { IssueSidebar, PAGE_SIDEBAR_W } from "./components/IssueSidebar";
import { IssueTitle } from "./components/IssueTitle";
import { useFieldNav } from "./IssueDetailView";
import styles from "./issueDetail.module.scss";

interface IssueDetailPageViewProps {
  issue: IssueDetail;
  /** Resolved because the header needs it — `null` if it's missing. */
  project: Project | null;
  data: IssueComposerData;
  /** Target of the back arrow and the project step in the breadcrumb path. */
  backHref: string;
  onPatch: (patch: IssuePatch) => void;
  onComment: (body: PMDoc) => Promise<void>;
  onDelete: () => void;
  /** Refetches the issue — for attachments that are written past the hook. */
  onRefresh: () => Promise<void>;
}

/**
 * Pure rendering of the full page — everything that writes comes in as a
 * callback.
 *
 * The layout matches the large dialog's (content on the left, attributes on
 * the right, each column scrolling on its own), the header doesn't: instead
 * of a title and a cross, it shows the breadcrumb path that led here and
 * leads back. A page isn't closed, it's left.
 */
export function IssueDetailPageView({
  issue,
  project,
  data,
  backHref,
  onPatch,
  onComment,
  onDelete,
  onRefresh,
}: IssueDetailPageViewProps) {
  const t = useTranslations();
  const router = useRouter();
  const identifier = `${project?.prefix ?? "?"}-${issue.key}`;
  const backLabel = project
    ? t("nav.backToProject", { name: project.name })
    : t("nav.backToWorkspace");

  const hasOpenModal = useHasOpenModal();
  const { toast } = useUI();
  useFieldNav(hasOpenModal);

  // Prev/next within the same project, ordered by issue number — the page
  // has no surrounding list or filter state of its own (unlike the panel,
  // whose j/k reach the board/list underneath via `dispatchShortcut`), so
  // this is the one order that's always available and always predictable
  // regardless of how the issue was reached.
  const siblings = data.searchIssues
    .filter((i) => i.project === issue.project)
    .sort((a, b) => a.key - b.key);
  const siblingIndex = siblings.findIndex((i) => i.id === issue.id);
  const prevSibling = siblingIndex > 0 ? siblings[siblingIndex - 1] : null;
  const nextSibling =
    siblingIndex !== -1 && siblingIndex < siblings.length - 1
      ? siblings[siblingIndex + 1]
      : null;

  const goToSibling = (sibling: (typeof siblings)[number] | null) => {
    if (!sibling) return;
    router.push(
      issuePath(data.workspaceId, `${project?.prefix ?? "?"}-${sibling.key}`),
    );
  };

  useShortcut("k", () => goToSibling(prevSibling), {
    enabled: !!prevSibling && !hasOpenModal,
  });
  useShortcut("j", () => goToSibling(nextSibling), {
    enabled: !!nextSibling && !hasOpenModal,
  });

  // Same bindings as the side panel (`IssueDetailView.tsx`) — the page is
  // just a different shell around the same issue, not a different set of
  // things you can do with it. `window.location.href` stands in for
  // `IssueDetailView`'s own `issuePath()` build: this page's URL already
  // *is* the issue's canonical link, nothing to reconstruct.
  useShortcut(
    "mod+.",
    () => {
      navigator.clipboard.writeText(identifier);
      toast(t("toast.copiedId", { id: identifier }));
    },
    { enabled: !hasOpenModal, allowInEditable: true },
  );
  useShortcut(
    "mod+shift+<",
    () => {
      navigator.clipboard.writeText(window.location.href);
      toast(t("toast.copiedLink"));
    },
    { enabled: !hasOpenModal, allowInEditable: true },
  );

  return (
    <article className={styles.page}>
      <header className={styles.pageHeader}>
        <Link
          href={backHref}
          className={styles.back}
          aria-label={backLabel}
          title={backLabel}
        >
          <Icon icon="lucide:arrow-left" width={16} aria-hidden="true" />
        </Link>

        {/* Two steps are enough: the project the issue lives in, and the
            issue itself. The workspace is already shown in the sidebar. */}
        <nav className={styles.crumbs} aria-label={t("nav.breadcrumb")}>
          <Link href={backHref} className={styles.crumb}>
            <span className="dot" style={{ background: project?.color }} />
            <span className={styles.crumbText}>{project?.name ?? "—"}</span>
          </Link>
          <span className={styles.crumbSep} aria-hidden="true">
            /
          </span>
          <span className={styles.crumbCurrent} aria-current="page">
            {identifier}
          </span>
        </nav>

        <div className={styles.pageActions}>
          <span className={styles.navArrows}>
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon="lucide:chevron-up" width={15} />}
              aria-label={t("actions.previousIssue")}
              title={t("actions.previousIssue")}
              disabled={!prevSibling}
              onClick={() => goToSibling(prevSibling)}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon="lucide:chevron-down" width={15} />}
              aria-label={t("actions.nextIssue")}
              title={t("actions.nextIssue")}
              disabled={!nextSibling}
              onClick={() => goToSibling(nextSibling)}
            />
          </span>
          {issue.access.canShare && (
            <ShareIssueButton
              issueId={issue.id}
              shareUrl={issue.shareUrl}
              members={data.members}
              me={data.me}
            />
          )}
          {/* No `OpenPageButton` next to it — this already is the page. */}
          <IssueActionsMenu
            onDelete={onDelete}
            canDelete={issue.access.canDelete}
          />
        </div>
      </header>

      <div className={styles.split}>
        <div className={styles.main}>
          <IssueTitle
            title={issue.title}
            readOnly={!issue.access.canEdit}
            onPatch={onPatch}
          />
          <IssueDescription
            issueId={issue.id}
            description={issue.description}
            data={data}
            readOnly={!issue.access.canEdit}
            onPatch={onPatch}
            onRefresh={onRefresh}
          />
          <IssueRelations issue={issue} data={data} onRefresh={onRefresh} />
          <IssueAttachments
            issueId={issue.id}
            attachments={issue.attachments}
            readOnly={!issue.access.canEdit}
            onRefresh={onRefresh}
          />
          <IssueComments
            issueId={issue.id}
            workspaceId={data.workspaceId}
            identifier={identifier}
            comments={issue.comments}
            members={data.members}
            me={data.me}
            data={data}
            canUpdateAnyComment={issue.access.canUpdateAnyComment}
            canDeleteAnyComment={issue.access.canDeleteAnyComment}
            onSubmit={onComment}
            onRefresh={onRefresh}
          />
        </div>

        <IssueSidebar
          issue={issue}
          data={data}
          defaultWidth={PAGE_SIDEBAR_W}
          onPatch={onPatch}
        />
      </div>
    </article>
  );
}
