"use client";

import type { IssueComposerData } from "@/features/issues/types";
import {
  IssueDetailMissing,
  IssueDetailSkeleton,
  IssueDetailView,
} from "./IssueDetailView";
import { useIssueDetail } from "./useIssueDetail";

interface IssueDetailProps {
  /** Internal id or reference of the form "PREFIX-123". */
  issueRef: string;
  data: IssueComposerData;
  onClose: () => void;
  /**
   * Whether the view is shown as a large dialog instead of a side panel.
   *
   * Controlled from outside, not here: the decision outlives the individual
   * issue (`IssuePeek` remembers it for the session), and the surrounding
   * panel needs to switch layouts at the same time — neither would work if
   * it lived in here.
   */
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

/**
 * The detail view as a side panel over the list, board, and inbox. On
 * opening it only knows the reference from the URL — loading happens here
 * (`useIssueDetail`), rendering in `IssueDetailView`.
 *
 * The full page at `/[workspace]/issue/[ref]` isn't a variant of this, but
 * its own shell (`IssueDetailPage`) over the same hook.
 */
export function IssueDetail({
  issueRef,
  data,
  onClose,
  isExpanded = false,
  onToggleExpanded,
}: IssueDetailProps) {
  const {
    issue,
    isMissing,
    isLoading,
    patch,
    setField,
    comment,
    remove,
    refresh,
  } = useIssueDetail({ issueRef, data, onDeleted: onClose });

  if (!issue) {
    // `isLoading` is also true here (a confirmed miss turns it off first —
    // see `useIssueDetail`), so this is only ever the very first load: once
    // an issue has shown at all, `issue` stays populated with the previous
    // one while a later switch loads, and `IssueDetailView` shows that
    // instead of dropping back to this skeleton.
    return isMissing ? (
      <IssueDetailMissing isExpanded={isExpanded} onClose={onClose} />
    ) : (
      <IssueDetailSkeleton isExpanded={isExpanded} onClose={onClose} />
    );
  }

  return (
    <IssueDetailView
      issue={issue}
      data={data}
      onClose={onClose}
      onToggleExpanded={onToggleExpanded}
      isExpanded={isExpanded}
      isLoading={isLoading}
      onPatch={patch}
      onField={setField}
      onComment={comment}
      onDelete={remove}
      onRefresh={refresh}
    />
  );
}
