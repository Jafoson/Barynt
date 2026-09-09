"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { IssueDetail } from "@/features/issues/components/IssueDetail/IssueDetail";
import { closeIssuePanel, ISSUE_PARAM } from "@/features/issues/issue-links";
import { recordIssueOpened } from "@/features/issues/recent-issues";
import type { IssueComposerData } from "@/features/issues/types";
import { DockPanel, useDock } from "@/lib/context";
import { useSessionFlag } from "@/lib/utils/useSessionFlag";

/**
 * Whether the detail view was last shown as a large dialog instead of a
 * side panel.
 *
 * Once someone toggles this, they usually don't just mean this one issue —
 * so the choice holds until the end of the session, even across switching
 * between list, board, and inbox (this component gets remounted every
 * time). On the next visit it starts back at the edge.
 */
const EXPANDED_KEY = "issue-detail-expanded";

interface IssuePeekProps {
  data: IssueComposerData;
}

/**
 * Shows the detail view as a docked side panel as soon as `?issue=` is in
 * the URL — the list, board, inbox, and "My issues" set the parameter on a
 * row or card click.
 *
 * The URL is the single source of truth here: the panel follows it, and
 * whoever closes it (Escape, the cross) removes the parameter. This keeps
 * every open issue linkable, without opener and panel ever having to
 * maintain a second piece of state.
 *
 * Rendering doesn't happen here, but in the app shell's dock (`DockOutlet`)
 * — there the panel sits next to the content instead of over it, and the
 * content narrows accordingly. The route there is a portal; the contexts
 * still follow this spot in the React tree.
 */
export function IssuePeek({ data }: IssuePeekProps) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const { node } = useDock();
  const [isExpanded, setExpanded] = useSessionFlag(EXPANDED_KEY);
  const issueRef = searchParams.get(ISSUE_PARAM);

  useEffect(() => {
    if (issueRef) recordIssueOpened(issueRef);
  }, [issueRef]);

  if (!issueRef || !node) return null;

  return createPortal(
    // Expanded, the panel raises itself above the page — the shell and the
    // content read the same value, so there's no moment where one has
    // already switched and the other hasn't.
    <DockPanel
      label={issueRef}
      overlay={isExpanded}
      closeLabel={t("actions.close")}
      onClose={closeIssuePanel}
    >
      <IssueDetail
        issueRef={issueRef}
        data={data}
        onClose={closeIssuePanel}
        isExpanded={isExpanded}
        onToggleExpanded={() => setExpanded(!isExpanded)}
      />
    </DockPanel>,
    node,
  );
}
