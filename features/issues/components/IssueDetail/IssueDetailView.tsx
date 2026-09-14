"use client";

import { Icon } from "@iconify/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { Modal } from "@/components/ui/layout/Modal/Modal";
import { Resizer } from "@/components/ui/layout/Resizer/Resizer";
import { issuePath } from "@/features/issues/issue-links";
import type { IssueComposerData, IssuePatch } from "@/features/issues/types";
import { getPathname, useRouter } from "@/i18n/navigation";
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
import { IssueRelations } from "./components/IssueRelations";
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
 * Whether a field-roving Up/Down should act on `active`, or leave it alone
 * because it's a real text cursor's to keep: the Description's Tiptap
 * surface once editing, the comment composer, a popover's search input, a
 * stacked modal's own field — none of those carry `data-field-nav`, so
 * they fall to the generic "editable" check instead. Anything else —
 * already on a field, or focus sitting on some inert wrapper (the panel's
 * own region, a header icon button) — is fair game.
 *
 * An open dropdown's own items (`SelectMenu`'s `[data-select-item]`
 * buttons) need their own explicit exclusion here: they're plain buttons,
 * not inputs/textareas/contentEditable, so the generic check alone would
 * wave them through as "fair game" — and once `SelectMenu`'s own Up/Down
 * roving moved focus onto one, this panel-level roving would immediately
 * hijack the very next arrow press, since a plain button matches nothing
 * above. `SelectMenu` is portaled onto `document.body` (`Popover.tsx`), a
 * sibling of the panel's own tree rather than a descendant, so `closest()`
 * on `data-field-nav`/DOM position can't tell it's still "inside" the
 * panel — `data-popover-content` on that portal root is what does.
 *
 * A label chip (`[data-label-chip]`) needs the same treatment, for the
 * same reason: it's a focusable `role="button"` span, not an input, so the
 * generic check alone would also wave it through — and `IssueLabels.tsx`'s
 * own Left/Right (and, in the aside layout, Up/Down) roving between chips
 * would lose the race to this one, which mounts first (a parent effect
 * always runs before a child's) and would hijack the very same keys.
 *
 * A sub-issue/relation table (`[data-relation-table]`, `IssueRelations.tsx`)
 * needs the same exclusion for the same race: its rows' links/buttons are
 * plain focusable elements too, and its own Up/Down (moving between rows)
 * would otherwise lose to this one and get its focus teleported to the
 * title field mid-navigation.
 */
function isRovable(active: Element | null): active is HTMLElement {
  if (!(active instanceof HTMLElement)) return true;
  if (active.matches("[data-field-nav]")) return true;
  if (active.closest("[data-popover-content]")) return false;
  if (active.matches("[data-label-chip]")) return false;
  if (active.closest("[data-relation-table]")) return false;
  return !(
    active.tagName === "TEXTAREA" ||
    active.tagName === "INPUT" ||
    active.isContentEditable
  );
}

/**
 * Up/Down between the panel's fields (`[data-field-nav]`: the title, the
 * type/status/priority/assignee buttons, the description preview, the
 * attachments and labels triggers, and the sub-issue/relation "+" triggers)
 * — the fast path once you're not editing text, so you don't have to Tab
 * past everything in between.
 *
 * A `document`-level listener, like every other keyboard shortcut in this
 * codebase (`useShortcut`, DockPanel's own Escape handler) — not scoped to
 * a content ref: focus lands on the panel's own region on open, and the
 * header's buttons (prev/next, expand, share, close) come before any field
 * in tab order, both outside the body wrapper. Scoping to a ref down there
 * would only ever see the keydown once focus had already reached a field
 * several Tabs in — which is the bug this replaced.
 *
 * Only one issue panel is ever open at a time, so a plain, unscoped
 * `document.querySelectorAll` for `[data-field-nav]` — nothing else in the
 * app uses that attribute — is exactly this panel's fields; an empty result
 * means no panel is open, and the listener no-ops. `hasOpenModal` stands
 * down entirely while a real stacked dialog (Share, delete-confirm, …) has
 * its own focus trap on top — otherwise a non-editable button in there
 * (e.g. "Cancel") would count as "not on a field" and get its Down arrow
 * hijacked into the panel behind it.
 *
 * Past the last field (labels), Down hands off to the comment composer via
 * `dispatchShortcut("m")` — the same binding "m" already fires
 * (`IssueComments.tsx`) — instead of a ref threaded down from here: it's
 * always mounted in edit mode, not a button-preview like the description,
 * so it's never itself `data-field-nav`-marked (an active multi-line editor
 * needs its own arrow keys back, same reasoning as the description once
 * editing). Once it's focused, `isRovable` below leaves it alone — with one
 * escape hatch back the other way: Up out of the composer while it's still
 * *empty* (`[data-comment-editor]`, checked by `textContent`, not the
 * ProseMirror doc — simpler, and empty either way looks the same to both)
 * returns to the last field, since there's no real cursor position there
 * yet to preserve. Once there's actual multi-line text, Up goes back to
 * being the cursor's, same as the description once editing.
 *
 * Doesn't touch j/k, which live in Board.tsx/ListView.tsx and move the
 * *board's* cursor, not DOM focus — the two systems don't overlap.
 *
 * Exported: `IssueDetailPageView` (the standalone `/issue/[ref]` page)
 * shares this same field set and wants the exact same roving behavior —
 * only the surrounding shell (panel vs. page) differs.
 */
export function useFieldNav(hasOpenModal: boolean) {
  useEffect(() => {
    if (hasOpenModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      // A stronger guard than checking where focus currently is
      // (`isRovable`'s `data-popover-content` check, below): this doesn't
      // depend on which of the two `document`-level keydown listeners —
      // this one, or `SelectMenu`'s own via React's synthetic dispatch —
      // happens to run first on a given keypress, or on focus having
      // already landed where expected by the time it does. If a dropdown
      // exists at all, it owns Up/Down outright; nothing here is worth
      // risking a race over.
      if (document.querySelector("[data-popover-content]")) return;
      const fields = Array.from(
        document.querySelectorAll<HTMLElement>("[data-field-nav]"),
      );
      if (fields.length === 0) return;
      const active = document.activeElement;
      if (!isRovable(active)) {
        if (
          event.key === "ArrowUp" &&
          active instanceof HTMLElement &&
          active.closest("[data-comment-editor]") &&
          !active.textContent?.trim()
        ) {
          event.preventDefault();
          fields[fields.length - 1]?.focus();
        }
        return;
      }
      const goingDown = event.key === "ArrowDown";
      const index = fields.indexOf(active as HTMLElement);
      const next =
        index === -1
          ? fields[goingDown ? 0 : fields.length - 1]
          : fields[index + (goingDown ? 1 : -1)];
      if (next) {
        event.preventDefault();
        next.focus();
        return;
      }
      if (goingDown && index !== -1) {
        event.preventDefault();
        dispatchShortcut("m");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hasOpenModal]);
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
  const router = useRouter();
  useFieldNav(hasOpenModal);

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

  // Same target as `OpenPageButton`, just from the keyboard — leaves the
  // panel/dialog behind for the full page (its URL carries no `?issue=`,
  // so `IssuePeek` simply stops rendering it once there).
  useShortcut("o", () => router.push(issuePath(data.workspaceId, identifier)), {
    enabled: !hasOpenModal,
  });
  // Panel <-> large dialog, both ways — the same toggle as the header's
  // expand/collapse button, just from the keyboard. `onToggleExpanded` is
  // optional in the type only for callers that have nothing to toggle;
  // this component's one real caller (`IssuePeek`) always passes it.
  useShortcut("e", () => onToggleExpanded?.(), {
    enabled: !!onToggleExpanded && !hasOpenModal,
  });

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
            <IssueRelations issue={issue} data={data} onRefresh={onRefresh} />
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
