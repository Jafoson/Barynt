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
  workspaceId: string;
  /** The viewer's own id — an event they caused themselves is ignored,
   *  their own view already refreshed via the Server Action's own
   *  `revalidatePath`. */
  userId: string;
}

/**
 * Subscribes to `/api/workspaces/[id]/updates` (Server-Sent Events, backed
 * by `lib/realtime/bus.ts`) and flags when something changed elsewhere
 * (BARY-26) — a global "there are changes" notification, mounted once per
 * workspace (`[workspace]/layout.tsx`, next to `PasskeyNudge`) rather than
 * per board, so it doesn't matter which page happens to be open when a
 * teammate changes something. Deliberately doesn't auto-apply the change:
 * `reorderIssue`'s optimistic drag state (`useBoardDnd.ts`) would race an
 * unannounced `router.refresh()` the same way BARY-25 did, so the caller
 * shows a banner and only refreshes on an explicit click.
 */
export function useProjectUpdates({
  workspaceId,
  userId,
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
      setStale(true);
    };

    return () => source.close();
  }, [workspaceId, userId]);

  return { stale, dismiss: () => setStale(false) };
}
