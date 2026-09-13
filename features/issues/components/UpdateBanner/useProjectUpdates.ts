"use client";

import { useEffect, useState } from "react";
import { recentLocalMutation } from "@/lib/realtime/localMutation";

interface ProjectChangePayload {
  workspaceId: string;
  projectId: string;
  issueId?: string;
  actorId: string;
  at: number;
}

interface UseProjectUpdatesOptions {
  /** Every page that can show this feature has one — the subscription is
   *  always workspace-scoped (see `lib/realtime/bus.ts`), since a board can
   *  show issues from more than one project at once ("My issues"). */
  workspaceId: string;
  /** The viewer's own id — an event they caused themselves is ignored,
   *  their own view already refreshed via the Server Action's own
   *  `revalidatePath`. */
  userId: string;
  /** Narrows the banner to one project's changes — a single-project board.
   *  Omitted for a cross-project board ("My issues"), where any change in
   *  the workspace is relevant since it could touch one of the shown issues. */
  projectId?: string;
  /** Narrows to one issue's changes, for the detail view. */
  issueId?: string;
}

/**
 * Subscribes to `/api/workspaces/[id]/updates` (Server-Sent Events, backed
 * by `lib/realtime/bus.ts`) and flags when something changed elsewhere
 * (BARY-26) — Jira-style "this view is stale" banner. Deliberately doesn't
 * auto-apply the change: `reorderIssue`'s optimistic drag state
 * (`useBoardDnd.ts`) would race an unannounced `router.refresh()` the same
 * way BARY-25 did, so the caller shows a banner and only refreshes on an
 * explicit click.
 */
export function useProjectUpdates({
  workspaceId,
  userId,
  projectId,
  issueId,
}: UseProjectUpdatesOptions) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    setStale(false);

    const source = new EventSource(`/api/workspaces/${workspaceId}/updates`);
    source.onmessage = (message) => {
      let event: ProjectChangePayload;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }
      // Only suppress this tab's own echo — not the same user's other open
      // tabs, which never called `markLocalMutation()` themselves and so
      // still need the banner (BARY-26: a same-account two-tab test showed
      // nothing before this, since every event from `userId` was dropped
      // regardless of which tab caused it).
      if (event.actorId === userId && recentLocalMutation()) return;
      if (projectId && event.projectId !== projectId) return;
      if (issueId && event.issueId !== issueId) return;
      setStale(true);
    };

    return () => source.close();
  }, [workspaceId, userId, projectId, issueId]);

  return { stale, dismiss: () => setStale(false) };
}
