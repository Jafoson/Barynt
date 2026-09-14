"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  addComment,
  deleteIssue,
  updateIssue,
} from "@/features/issues/actions";
import type { IssueEditorData, IssuePatch } from "@/features/issues/types";
import { markLocalMutation } from "@/lib/realtime/localMutation";
import type { PMDoc } from "@/lib/richtext/types";
import type { IssueDetail } from "@/types";

interface UseIssueDetailOptions {
  /** Internal id or reference of the form "PREFIX-123". */
  issueRef: string;
  data: IssueEditorData;
  /**
   * Preloaded issue. The full page gets it from the server, the panel only
   * knows the reference from the URL when opening and fetches it itself.
   */
  initialIssue?: IssueDetail;
  /** Runs after the issue has been deleted — close the panel, leave the page. */
  onDeleted: () => void;
}

export interface IssueDetailState {
  /** `null` only before the very first issue has ever loaded, or if the
   *  reference doesn't exist. */
  issue: IssueDetail | null;
  /** Loaded and found nothing. Distinguishes the empty state from the loading state. */
  isMissing: boolean;
  /**
   * A fetch for the current `issueRef` is in flight. `issue` still holds
   * whatever was showing before — switching to a different issue (e.g. via
   * the header's prev/next arrows) doesn't null it out first, so the
   * caller can keep the old one on screen (dimmed, with a spinner) instead
   * of dropping to the skeleton and back for every switch.
   */
  isLoading: boolean;
  patch: (patch: IssuePatch) => void;
  comment: (body: PMDoc) => Promise<void>;
  remove: () => void;
  /**
   * Refetches the issue — for changes written past the hook (e.g.
   * attachments: their own server actions, no `patch()`). The panel isn't
   * tied to any server render, so a plain `router.refresh()` alone doesn't
   * touch `fetched` below.
   */
  refresh: () => Promise<void>;
}

/**
 * Loads the issue for the given reference and writes changes back — the
 * shared foundation of the side panel (`IssueDetail`) and the full page
 * (`IssueDetailPage`). Both show the same issue and change it the same
 * way; only the shell around it differs, and that doesn't belong here.
 *
 * After every change, two things are refreshed: the issue itself via the
 * API (the panel isn't tied to any server render) and the route via
 * `router.refresh`, so the list or board underneath shows the same state.
 */
export function useIssueDetail({
  issueRef,
  data,
  initialIssue,
  onDeleted,
}: UseIssueDetailOptions): IssueDetailState {
  const router = useRouter();
  const [fetched, setFetched] = useState<IssueDetail | null>(null);
  const [isMissing, setIsMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(!initialIssue);
  const [, startTransition] = useTransition();
  const issue = fetched ?? initialIssue ?? null;

  const endpoint = useCallback(
    (ref: string) =>
      `/api/issues/${encodeURIComponent(ref)}?ws=${encodeURIComponent(data.workspaceId)}`,
    [data.workspaceId],
  );

  const load = useCallback(
    async (ref: string) => {
      const response = await fetch(endpoint(ref));
      if (!response.ok) return null;
      const fresh = (await response.json()) as IssueDetail | null;
      if (!fresh) return null;
      // `JSON.parse` doesn't revive dates: `activity[].createdAt` arrives
      // here as an ISO string even though `AuditEntry.createdAt` is typed
      // `Date` — a type the full page's server-rendered props satisfy for
      // real (Date instances cross the RSC boundary intact), but this fetch
      // round-trip doesn't. `ActivityFeed` calls `.getTime()` on it, so it
      // has to be a real `Date` again before this issue reaches the panel.
      return {
        ...fresh,
        activity: fresh.activity.map((entry) => ({
          ...entry,
          createdAt: new Date(entry.createdAt),
        })),
      };
    },
    [endpoint],
  );

  useEffect(() => {
    if (initialIssue) return;
    let active = true;
    // Deliberately not `setFetched(null)` here — the previous issue (if
    // any) stays on screen, `isLoading` true, until the new one actually
    // arrives. Only a confirmed miss below clears it: a stale issue
    // that's quietly wrong is worse than a moment of "loading further".
    setIsLoading(true);
    setIsMissing(false);
    load(issueRef).then((fresh) => {
      if (!active) return;
      setIsLoading(false);
      setFetched(fresh);
      setIsMissing(!fresh);
    });
    return () => {
      active = false;
    };
  }, [issueRef, initialIssue, load]);

  const reload = useCallback(async () => {
    if (!issue) return;
    const fresh = await load(issue.id);
    if (fresh) setFetched(fresh);
    router.refresh();
  }, [issue, load, router]);

  const patch = (patch: IssuePatch) => {
    if (!issue) return;
    startTransition(async () => {
      // After the await — see the comment in useBoardDnd.ts's onDrop for
      // why: the server timestamps its own record on receipt, always
      // later than anything marked before the request is even sent.
      await updateIssue(issue.id, patch);
      markLocalMutation();
      await reload();
    });
  };

  const comment = async (body: PMDoc) => {
    if (!issue) return;
    await addComment(issue.id, body, data.me.id);
    markLocalMutation();
    await reload();
  };

  const remove = () => {
    if (!issue) return;
    startTransition(async () => {
      await deleteIssue(issue.id);
      markLocalMutation();
      onDeleted();
      router.refresh();
    });
  };

  return {
    issue,
    isMissing,
    isLoading,
    patch,
    comment,
    remove,
    refresh: reload,
  };
}
