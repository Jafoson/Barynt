import { useOptimistic, useRef, useState, useTransition } from "react";
import { reorderIssue } from "@/features/issues/actions";
import { rankBetween, sortByRank } from "@/features/issues/rank";
import { markLocalMutation } from "@/lib/realtime/localMutation";
import type { Issue } from "@/types";

/**
 * Encapsulates board drag-and-drop: optimistic reordering across status
 * columns, rank calculation, and the transient hover/insert state needed
 * to render drop indicators.
 */
export function useBoardDnd<T extends Issue>(issues: T[]) {
  const [, startTransition] = useTransition();

  // State only for rendering the drop indicator
  const [dragging, setDragging] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [dragOverCard, setDragOverCard] = useState<string | null>(null);
  const [insertAbove, setInsertAbove] = useState(false);

  // Refs for use inside event handlers — always up-to-date, no stale closure
  const dragIssueRef = useRef<T | null>(null);
  const dragOverCardRef = useRef<string | null>(null);
  const insertAboveRef = useRef(false);

  const [optimisticIssues, addOptimistic] = useOptimistic(
    issues,
    (
      state,
      { id, status, rank }: { id: string; status: string; rank: number },
    ) => state.map((i) => (i.id === id ? { ...i, status, rank } : i)),
  );

  const getColumnIssues = (statusId: string) =>
    sortByRank(optimisticIssues.filter((i) => i.status === statusId));

  const clearDragState = () => {
    dragIssueRef.current = null;
    dragOverCardRef.current = null;
    setDragging(null);
    setOverCol(null);
    setDragOverCard(null);
  };

  const onDragStart = (issue: T) => (e: React.DragEvent) => {
    dragIssueRef.current = issue;
    setDragging(issue.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const onCardDragOver = (cardId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    dragOverCardRef.current = cardId;
    insertAboveRef.current = above;
    setDragOverCard(cardId);
    setInsertAbove(above);
  };

  // Rank the dropped issue between its new neighbors (or at the column edge)
  const dropRank = (statusId: string, draggedId: string) => {
    const colIssues = getColumnIssues(statusId).filter(
      (i) => i.id !== draggedId,
    );
    const overCardId = dragOverCardRef.current;
    const overIdx = overCardId
      ? colIssues.findIndex((i) => i.id === overCardId)
      : -1;

    if (overIdx === -1)
      return rankBetween(colIssues[colIssues.length - 1] ?? null, null);

    const card = colIssues[overIdx];
    if (insertAboveRef.current)
      return rankBetween(colIssues[overIdx - 1] ?? null, card);
    return rankBetween(card, colIssues[overIdx + 1] ?? null);
  };

  const columnHandlers = (statusId: string) => ({
    isOver: overCol === statusId,
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOverCol(statusId);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setOverCol(null);
        setDragOverCard(null);
        dragOverCardRef.current = null;
      }
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const issue = dragIssueRef.current;
      if (!issue) return;

      const rank = dropRank(statusId, issue.id);
      clearDragState();

      // No `router.refresh()` after the `await` — `reorderIssue` already
      // revalidates server-side (`revalidate()` in actions.ts), and Next
      // folds the freshly rendered RSC payload into the Server Action's own
      // response (see "Choosing a cache update" in Next's server-actions
      // guide). A second, explicit refresh on top of that raced the
      // transition's own settling against this optimistic update's revert —
      // the reproducible trigger behind BARY-25's "Maximum update depth
      // exceeded" on every board drag.
      startTransition(async () => {
        addOptimistic({ id: issue.id, status: statusId, rank });
        // After the await, not before: `recordProjectChange` timestamps
        // itself on the server, which only ever runs *after* this request
        // reaches it — a baseline taken before sending the request is
        // therefore always older than that timestamp, never later, and
        // never actually suppresses anything (BARY-26). Taken here, after
        // the response comes back, it's guaranteed to be at or after the
        // server's own recording of this same action.
        await reorderIssue(issue.id, statusId, rank);
        markLocalMutation();
      });
    },
  });

  return {
    getColumnIssues,
    dragging,
    dragOverCard,
    insertAbove,
    onDragStart,
    onDragEnd: clearDragState,
    onCardDragOver,
    columnHandlers,
  };
}
