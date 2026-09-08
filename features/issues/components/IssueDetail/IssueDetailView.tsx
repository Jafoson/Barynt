"use client";

import { Icon } from "@iconify/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { Modal } from "@/components/ui/layout/Modal/Modal";
import { Resizer } from "@/components/ui/layout/Resizer/Resizer";
import { issuePath } from "@/features/issues/issue-links";
import type { IssueComposerData, IssuePatch } from "@/features/issues/types";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { useHasOpenModal } from "@/lib/context";
import type { PMDoc } from "@/lib/richtext/types";
import { dispatchShortcut, useShortcut } from "@/lib/shortcuts/useShortcut";
import { useUI } from "@/lib/ui-store";
import type { IssueDetail } from "@/types";
import { IssueAttachments } from "./components/IssueAttachments";
import { IssueComments } from "./components/IssueComments";
import { IssueDescription } from "./components/IssueDescription";
import {
  IssueActionsMenu,
  OpenPageButton,
  ShareIssueButton,
} from "./components/IssueDetailActions";
import { IssueLabels } from "./components/IssueLabels";
import { IssueMeta } from "./components/IssueMeta";
import { IssueProperties } from "./components/IssueProperties";
import { IssueSidebar } from "./components/IssueSidebar";
import { IssueTitle } from "./components/IssueTitle";
import styles from "./issueDetail.module.scss";

/**
 * Bounds of the side panel. It sits at the right edge and can be dragged
 * wider from its left edge — up to a cap, because a panel that fills the
 * screen is no longer a panel; that's what expanding is for.
 *
 * The starting width lives here rather than in the stylesheet:
 * `.modal.panel` sets `--modal-w` with two classes and would win against
 * any rule `.detail` holds against it. Inline wins without an arms race —
 * and the loading placeholder shows the same value, so the panel doesn't
 * jump when the data arrives.
 */
const PANEL_MIN_W = 480;
const PANEL_MAX_W = 1200;
const PANEL_DEFAULT_W = 720;

/**
 * The shell's classes. Expanded brings its own width and a shadow — and
 * since the loading state, error state, and finished view all need to
 * carry the same shell, the list lives here once instead of three times.
 */
function shellClass(isExpanded: boolean) {
  return [styles.detail, isExpanded && styles.expanded]
    .filter(Boolean)
    .join(" ");
}

/**
 * Previous/next in the header — not wired to any list of their own here.
 * They fire the same "k"/"j" the board and list already bind
 * (`dispatchShortcut`), which is what actually knows the surrounding order
 * and keeps this same panel in sync as the cursor moves. Present in every
 * state (loading, missing, loaded) since none of that depends on the
 * issue that's currently showing.
 */
function NavArrows() {
  const t = useTranslations();
  return (
    <span className={styles.navArrows}>
      <Button
        variant="ghost"
        size="sm"
        icon={<Icon icon="lucide:chevron-up" width={15} />}
        aria-label={t("actions.previousIssue")}
        title={t("actions.previousIssue")}
        onClick={() => dispatchShortcut("k")}
      />
      <Button
        variant="ghost"
        size="sm"
        icon={<Icon icon="lucide:chevron-down" width={15} />}
        aria-label={t("actions.nextIssue")}
        title={t("actions.nextIssue")}
        onClick={() => dispatchShortcut("j")}
      />
    </span>
  );
}

interface IssueDetailViewProps {
  issue: IssueDetail;
  data: IssueComposerData;
  onClose: () => void;
  /**
   * Toggles between side panel and large dialog. Missing wherever there's
   * nothing to toggle — on the full page.
   */
  onToggleExpanded?: () => void;
  isExpanded?: boolean;
  /**
   * A different issue is loading behind the scenes — `issue` is still the
   * previous one. Shows a dimmed overlay over the content instead of
   * swapping to the skeleton, so switching (prev/next, or j/k on the board
   * or list underneath) doesn't collapse and re-expand the modal for
   * every step.
   */
  isLoading?: boolean;
  onPatch: (patch: IssuePatch) => void;
  onComment: (body: PMDoc) => Promise<void>;
  onDelete: () => void;
  /** Refetches the issue — for attachments that are written past the hook. */
  onRefresh: () => Promise<void>;
}

/** Pure rendering — everything that writes comes in as a callback. */
export function IssueDetailView({
  issue,
  data,
  onClose,
  onToggleExpanded,
  isLoading = false,
  isExpanded = false,
  onPatch,
  onComment,
  onDelete,
  onRefresh,
}: IssueDetailViewProps) {
  const t = useTranslations();
  const isPanel = !isExpanded;
  // Only the panel is resizable — the expanded dialog scales with the
  // screen width.
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_W);
  const prefix = data.projects.find((p) => p.id === issue.project)?.prefix;
  const identifier = `${prefix ?? "?"}-${issue.key}`;

  const hasOpenModal = useHasOpenModal();
  const { toast } = useUI();
  const locale = useLocale() as Locale;

  // Mirrors Linear's own bindings — a bare click target for either doesn't
  // exist anywhere in the UI, only these two shortcuts.
  useShortcut(
    "mod+.",
    () => {
      navigator.clipboard.writeText(identifier);
      toast(t("toast.copiedId", { id: identifier }));
    },
    { enabled: !hasOpenModal, allowInEditable: true },
  );
  useShortcut(
    // Physically Cmd/Ctrl+Shift+"," — but Shift turns "," into "<" in
    // `KeyboardEvent.key` (confirmed against a real browser), same
    // situation as "?" in `ShortcutsHelpTrigger`. The badge for this stays
    // the plain "," people actually look for (`shortcutGroups`).
    "mod+shift+<",
    () => {
      const path = getPathname({
        href: issuePath(data.workspaceId, identifier),
        locale,
      });
      navigator.clipboard.writeText(`${window.location.origin}${path}`);
      toast(t("toast.copiedLink"));
    },
    { enabled: !hasOpenModal, allowInEditable: true },
  );

  return (
    <Modal
      variant={isPanel ? "panel" : "dialog"}
      width={isPanel ? panelWidth : undefined}
      className={shellClass(isExpanded)}
    >
      <ModalHeader
        leading={<NavArrows />}
        title={<span className={styles.ref}>{identifier}</span>}
        actions={
          <>
            {onToggleExpanded && (
              <Button
                variant="ghost"
                size="sm"
                icon={
                  <Icon
                    icon={
                      isExpanded ? "lucide:minimize-2" : "lucide:maximize-2"
                    }
                    width={15}
                  />
                }
                aria-label={t(
                  isExpanded ? "actions.collapse" : "actions.expand",
                )}
                title={t(isExpanded ? "actions.collapse" : "actions.expand")}
                onClick={onToggleExpanded}
              />
            )}
            {/* Both the panel and the dialog sit over something else — from
                here, the button leads to the page that stands on its own. */}
            <OpenPageButton
              workspaceId={data.workspaceId}
              identifier={identifier}
            />
            {issue.access.canShare && (
              <ShareIssueButton
                issueId={issue.id}
                shareUrl={issue.shareUrl}
                members={data.members}
                me={data.me}
              />
            )}
            <IssueActionsMenu
              onDelete={onDelete}
              canDelete={issue.access.canDelete}
            />
          </>
        }
        onClose={onClose}
        closeLabel={t("actions.close")}
      />

      {/* Wraps whichever layout below so a loading switch has something to
          overlay without disturbing that layout's own flex sizing (the
          wrapper takes over the `flex: 1 1 auto` that `.body`/`.split`
          used to claim directly from `.modal`). */}
      <div className={styles.contentWrap}>
        {/* The narrow side panel shows everything stacked, in the order you'd
          read the issue: what it's about, how it's categorized, what was
          said about it. A second column there would just have produced a
          stack with a divider line.

          The large dialog has the width for two columns — there, just like
          on the full page, it stays content on the left, attributes on the
          right. */}
        {isPanel ? (
          <div className={styles.body}>
            <IssueTitle
              title={issue.title}
              readOnly={!issue.access.canEdit}
              onPatch={onPatch}
            />
            <IssueProperties
              issue={issue}
              data={data}
              layout="column"
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
            <IssueAttachments
              issueId={issue.id}
              attachments={issue.attachments}
              readOnly={!issue.access.canEdit}
              onRefresh={onRefresh}
            />
            <IssueLabels
              issue={issue}
              data={data}
              layout="column"
              onPatch={onPatch}
            />
            <IssueMeta issue={issue} data={data} layout="column" />
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
        ) : (
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

            <IssueSidebar issue={issue} data={data} onPatch={onPatch} />
          </div>
        )}
        {/* Delayed via CSS, not skipped here: a switch that resolves fast
          (warm cache, quick connection) shouldn't flash a spinner at all —
          see the animation-delay in `issueDetail.module.scss`. */}
        {isLoading && (
          <div className={styles.loadingOverlay} aria-hidden="true">
            <Icon
              icon="lucide:loader-2"
              width={22}
              className={styles.loadingSpinner}
            />
          </div>
        )}
      </div>

      {/* At the panel's left edge, absolutely positioned above everything.
          Placed last in the markup, so it doesn't jump ahead of the header
          when tabbing — it's seen at its edge anyway, not at its position
          in the markup. */}
      {isPanel && (
        <Resizer
          className={styles.panelResizer}
          width={panelWidth}
          onChange={setPanelWidth}
          min={PANEL_MIN_W}
          max={PANEL_MAX_W}
          reset={PANEL_DEFAULT_W}
          label={t("actions.resizePanel")}
        />
      )}
    </Modal>
  );
}

/**
 * Placeholder while the issue is still loading. Renders the same shell, so
 * the panel doesn't change size once the data arrives.
 */
export function IssueDetailSkeleton({
  isExpanded = false,
  onClose,
}: {
  isExpanded?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const isPanel = !isExpanded;

  return (
    <Modal
      variant={isPanel ? "panel" : "dialog"}
      width={isPanel ? PANEL_DEFAULT_W : undefined}
      className={shellClass(isExpanded)}
      aria-busy="true"
    >
      <ModalHeader
        leading={<NavArrows />}
        title={<span className={styles.ref}>…</span>}
        onClose={onClose}
        closeLabel={t("actions.close")}
      />
      {isPanel ? (
        <div className={styles.body}>
          <div className={`${styles.shimmer} ${styles.shimmerTitle}`} />
          <div className={`${styles.shimmer} ${styles.shimmerBox}`} />
          <div className={styles.shimmer} />
          <div className={styles.shimmer} />
          <div className={`${styles.shimmer} ${styles.shimmerShort}`} />
        </div>
      ) : (
        <div className={styles.split}>
          <div className={styles.main}>
            <div className={`${styles.shimmer} ${styles.shimmerTitle}`} />
            <div className={styles.shimmer} />
            <div className={`${styles.shimmer} ${styles.shimmerShort}`} />
          </div>
          <aside className={styles.sidebar}>
            <div className={styles.shimmer} />
            <div className={styles.shimmer} />
            <div className={styles.shimmer} />
          </aside>
        </div>
      )}
    </Modal>
  );
}

/**
 * A link can point to a deleted issue — this is shown then instead of an
 * eternal loading state.
 */
export function IssueDetailMissing({
  isExpanded = false,
  onClose,
}: {
  isExpanded?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const isPanel = !isExpanded;

  return (
    <Modal
      variant={isPanel ? "panel" : "dialog"}
      width={isPanel ? PANEL_DEFAULT_W : undefined}
      className={shellClass(isExpanded)}
    >
      <ModalHeader
        leading={<NavArrows />}
        title={<span className={styles.ref}>—</span>}
        onClose={onClose}
        closeLabel={t("actions.close")}
      />
      <div className={styles.missing}>
        <EmptyState
          icon={<Icon icon="lucide:file-question" width={32} />}
          title={t("empty.issueNotFound")}
          description={t("empty.issueNotFoundHint")}
        />
      </div>
    </Modal>
  );
}
