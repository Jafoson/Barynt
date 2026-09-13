"use client";

import { useEffect, useRef, useState } from "react";
import { localMutationBaseline } from "@/lib/realtime/localMutation";

interface LastChange {
  actorId: string;
  at: number;
}

interface UseProjectUpdatesOptions {
  workspaceId: string;
}

const POLL_INTERVAL_MS = 15_000;

/**
 * Polls `/api/workspaces/[id]/updates` and flags when something changed
 * elsewhere (BARY-26) — a global "there are changes" notification, mounted
 * once per workspace (`[workspace]/layout.tsx`, next to `PasskeyNudge`)
 * rather than per board, so it doesn't matter which page happens to be open
 * when a teammate changes something.
 *
 * Polling, not Server-Sent Events — see the comment on `revalidate()` in
 * `features/issues/actions.ts` for why: SSE worked in local dev but never
 * delivered anything through this deployment's production path (a
 * Cloudflare Tunnel whose buffering behavior isn't configurable from this
 * repo). A plain GET every few seconds has nothing for an intermediary to
 * buffer.
 *
 * Deliberately doesn't auto-apply the change: `reorderIssue`'s optimistic
 * drag state (`useBoardDnd.ts`) would race an unannounced
 * `router.refresh()` the same way BARY-25 did, so the caller shows a banner
 * and only refreshes on an explicit click.
 */
export function useProjectUpdates({ workspaceId }: UseProjectUpdatesOptions) {
  const [stale, setStale] = useState(false);
  // The most recent change timestamp already evaluated. Starts at "now" so
  // a change already sitting in the store from before this tab opened
  // doesn't immediately flag as new.
  const lastSeenAtRef = useRef(Date.now());

  useEffect(() => {
    setStale(false);
    lastSeenAtRef.current = Date.now();
    let cancelled = false;

    const poll = async () => {
      let change: LastChange | null;
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/updates`);
        if (!response.ok) return;
        change = await response.json();
      } catch {
        return; // Transient network hiccup — the next tick tries again.
      }
      if (cancelled || !change) return;

      // Whichever is later: what this tab already evaluated, or this tab's
      // own most recent local action (`markLocalMutation`). The latter
      // covers this tab's own echo without any time-window guess — see
      // `lib/realtime/localMutation.ts` for why a window doesn't work once
      // delivery is polled instead of pushed.
      const baseline = Math.max(lastSeenAtRef.current, localMutationBaseline());
      if (change.at <= baseline) return;

      lastSeenAtRef.current = change.at;
      setStale(true);
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    // Browsers throttle `setInterval` in backgrounded tabs — sometimes down
    // to once a minute or less. Without this, a tab left in the background
    // can sit on a change for far longer than POLL_INTERVAL_MS suggests,
    // then only catch up once switched back to, which looks like the
    // notification appeared "out of nowhere" right as it regains focus.
    // Polling immediately on visibility closes that gap instead of waiting
    // for the throttled timer to eventually fire.
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [workspaceId]);

  const dismiss = () => {
    setStale(false);
    lastSeenAtRef.current = Date.now();
  };

  return { stale, dismiss };
}
