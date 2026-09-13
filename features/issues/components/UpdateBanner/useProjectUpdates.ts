"use client";

import { useEffect, useState } from "react";
import { recentLocalMutation } from "@/lib/realtime/localMutation";

interface ProjectChangePayload {
  projectId: string;
  issueId?: string;
  actorId: string;
  at: number;
}

interface UseProjectUpdatesOptions {
  /** No single project to scope to (e.g. "my issues" across projects) —
   *  the hook then does nothing. */
  projectId?: string;
  /** The viewer's own id — an event they caused themselves is ignored,
   *  their own view already refreshed via the Server Action's own
   *  `revalidatePath`. */
  userId: string;
  /** Narrows to one issue's changes, for the detail view — omitted for the
   *  board, which cares about any change in the project. */
  issueId?: string;
}

/**
 * Subscribes to `/api/projects/[id]/updates` (Server-Sent Events, backed by
 * `lib/realtime/bus.ts`) and flags when something changed elsewhere (BARY-26)
 * — Jira-style "this view is stale" banner. Deliberately doesn't auto-apply
 * the change: `reorderIssue`'s optimistic drag state (`useBoardDnd.ts`)
 * would race an unannounced `router.refresh()` the same way BARY-25 did, so
 * the caller shows a banner and only refreshes on an explicit click.
 */
export function useProjectUpdates({
  projectId,
  userId,
  issueId,
}: UseProjectUpdatesOptions) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setStale(false);

    const source = new EventSource(`/api/projects/${projectId}/updates`);
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
      if (issueId && event.issueId !== issueId) return;
      setStale(true);
    };

    return () => source.close();
  }, [projectId, userId, issueId]);

  return { stale, dismiss: () => setStale(false) };
}
