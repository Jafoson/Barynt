"use client";

import type { DragEvent, KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { FLAT_GROUP_ID, type TableGroup } from "./types";

/**
 * Where a dragged row was dropped.
 *
 * Deliberately not "new index in the overall list": the neighbors are what
 * a caller with a rank column builds its new rank from (midpoint between
 * both), and `groupId` tells it which field the group maps to.
 */
export interface TableDrop<T> {
  row: T;
  /** Target group — always `"rows"` for a table without groups. */
  groupId: string;
  /** The group the row was picked up in. */
  fromGroupId: string;
  /** Insert position in the target group, with the dragged row excluded. */
  index: number;
  /** The row's future neighbors; `null` at the start/end of the group. */
  previous: T | null;
  next: T | null;
}

export type TableDndPhase = "grabbed" | "moved" | "dropped" | "cancelled";

/** Building blocks of an announcement — the caller phrases the sentence, it has the language. */
export interface TableDndAnnouncement<T> {
  row: T;
  groupId: string;
  /** Counts from 1 — the number goes to humans as-is. */
  position: number;
  total: number;
  phase: TableDndPhase;
}

export interface TableDndOptions<T> {
  getRowKey: (row: T) => string;
  /**
   * Reports the new position. Writing it back (and the optimistic
   * reordering) belongs to the caller — the table doesn't own the data.
   */
  onDrop: (target: TableDrop<T>) => void;
  /** Same rows as passed to `Table` — flat or in groups. */
  rows?: T[];
  groups?: TableGroup<T>[];
  /** Rows that should stay put. Without this, every row is draggable. */
  canDrag?: (row: T) => boolean;
  /** Names the row at the handle, e.g. "Move ABC-12 Login fails". */
  rowLabel?: (row: T) => string;
  /** Phrases the announcement; without it, the live region stays silent. */
  announce?: (announcement: TableDndAnnouncement<T>) => string;
}

/** What `Table` attaches to a `<tr>`. */
export interface TableRowDnd {
  draggable: boolean;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent) => void;
  "data-dragging"?: true;
  "data-drop"?: "above" | "below";
}

/** What `Table` attaches to the row's handle. */
export interface TableHandleDnd {
  "aria-label"?: string;
  "aria-pressed": boolean;
  "data-grabbed"?: true;
  onKeyDown: (event: KeyboardEvent) => void;
  onBlur: () => void;
}

export interface TableGroupDnd {
  onDragOver: (event: DragEvent) => void;
  "data-drop"?: "below";
}

export interface TableRootDnd {
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
}

/** What `<Table dnd={…}>` expects. Only ever produced by `useTableDnd`. */
export interface TableDnd<T> {
  row: (row: T, groupId: string) => TableRowDnd;
  /** `null` if the row isn't draggable — then the lane stays empty. */
  handle: (row: T, groupId: string) => TableHandleDnd | null;
  groupHeader: (groupId: string) => TableGroupDnd;
  root: TableRootDnd;
  /** Text of the live region; empty as long as nothing was announced. */
  status: string;
}

/** Insertion point: group plus position *without* the dragged row. */
interface Slot {
  groupId: string;
  index: number;
}

interface Dragged<T> {
  row: T;
  key: string;
  groupId: string;
  /** Starting position — this is how a drop tells whether anything changed at all. */
  index: number;
}

const between = (value: number, max: number) =>
  Math.min(Math.max(value, 0), max);

/**
 * Drag-and-drop sorting for `Table` — mouse and keyboard.
 *
 * The math is the same everywhere: an insertion point is a group plus an
 * index into its rows *without* the dragged one. That way there are no
 * special cases for "one down" (where your own gap shifts the index), the
 * line can be drawn straight from it, and on drop the new neighbors are
 * right there with no further recalculation.
 *
 * ```tsx
 * const dnd = useTableDnd<Issue>({
 *   groups,
 *   getRowKey: (issue) => issue.id,
 *   onDrop: ({ row, groupId, previous, next }) =>
 *     move(row, groupId, rankBetween(previous, next)),
 * })
 *
 * <Table groups={groups} getRowKey={(i) => i.id} dnd={dnd} … />
 * ```
 */
export function useTableDnd<T>(options: TableDndOptions<T>): TableDnd<T> {
  const { getRowKey, onDrop, canDrag, rowLabel, announce } = options;

  // Flat rows are the group "all rows" here too — the same reading as in
  // `Table`, so the reported `groupId` matches what's there.
  const sections: TableGroup<T>[] = options.groups ?? [
    { id: FLAT_GROUP_ID, rows: options.rows ?? [] },
  ];

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [grabbed, setGrabbed] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [status, setStatus] = useState("");

  // The drop reads what the last `dragover` set — the rendered state may
  // not have caught up to that yet. Refs are always current.
  const dragRef = useRef<Dragged<T> | null>(null);
  const slotRef = useRef<Slot | null>(null);
  const grabbedRef = useRef(false);

  const moveSlot = (next: Slot | null) => {
    slotRef.current = next;
    setSlot(next);
  };

  const sectionOf = (groupId: string) => sections.find((s) => s.id === groupId);

  /** A group's rows without the dragged one — the reference for every insertion point. */
  const restOf = (groupId: string, key: string | null) =>
    (sectionOf(groupId)?.rows ?? []).filter((row) => getRowKey(row) !== key);

  const locate = (key: string) => {
    for (const section of sections) {
      const index = section.rows.findIndex((row) => getRowKey(row) === key);
      if (index !== -1) return { groupId: section.id, index };
    }
    return null;
  };

  const say = (phase: TableDndPhase, target: Slot | null) => {
    const dragged = dragRef.current;
    if (!announce || !dragged) return;
    const at = target ?? { groupId: dragged.groupId, index: dragged.index };
    setStatus(
      announce({
        row: dragged.row,
        groupId: at.groupId,
        position: at.index + 1,
        total: restOf(at.groupId, dragged.key).length + 1,
        phase,
      }),
    );
  };

  const reset = () => {
    dragRef.current = null;
    slotRef.current = null;
    grabbedRef.current = false;
    setDragKey(null);
    setGrabbed(false);
    setSlot(null);
  };

  const pickUp = (row: T, groupId: string) => {
    const key = getRowKey(row);
    const index = locate(key)?.index ?? 0;
    dragRef.current = { row, key, groupId, index };
    setDragKey(key);
    moveSlot({ groupId, index });
  };

  const drop = () => {
    const dragged = dragRef.current;
    const target = slotRef.current;
    if (dragged && target) {
      const rest = restOf(target.groupId, dragged.key);
      const index = between(target.index, rest.length);
      // Back to the same spot isn't a change — bothering the caller with it
      // would mean triggering a server action for nothing.
      if (target.groupId !== dragged.groupId || index !== dragged.index) {
        onDrop({
          row: dragged.row,
          groupId: target.groupId,
          fromGroupId: dragged.groupId,
          index,
          previous: rest[index - 1] ?? null,
          next: rest[index] ?? null,
        });
      }
      say("dropped", { groupId: target.groupId, index });
    }
    reset();
  };

  const cancel = () => {
    say("cancelled", null);
    reset();
  };

  /**
   * All insertion points from top to bottom — the path the arrow keys walk.
   * Collapsed groups get exactly one: there are no visible rows there, but
   * the group stays reachable regardless.
   */
  const slots = (key: string): Slot[] =>
    sections.flatMap((section) => {
      const last = section.collapsed ? 0 : restOf(section.id, key).length;
      return Array.from({ length: last + 1 }, (_, index) => ({
        groupId: section.id,
        index,
      }));
    });

  const step = (direction: 1 | -1) => {
    const dragged = dragRef.current;
    const current = slotRef.current;
    if (!dragged || !current) return;
    const all = slots(dragged.key);
    const at = all.findIndex(
      (candidate) =>
        candidate.groupId === current.groupId &&
        candidate.index === current.index,
    );
    if (at === -1) return;
    const next = all[between(at + direction, all.length - 1)];
    // The path runs out at the start and end of the list — it stays at the
    // current spot there instead of silently jumping to the other side.
    if (!next || next === all[at]) return;
    moveSlot(next);
    say("moved", next);
  };

  /** Side the insertion line sits on for this row. */
  const edge = (row: T, groupId: string) => {
    if (!slot || !dragKey || slot.groupId !== groupId) return undefined;
    const rest = restOf(groupId, dragKey);
    if (rest.length === 0) return undefined;
    const key = getRowKey(row);
    // Behind the last row there's no more row for the line to sit above —
    // then it hangs below the last one.
    if (slot.index >= rest.length)
      return getRowKey(rest[rest.length - 1]) === key ? "below" : undefined;
    return getRowKey(rest[slot.index]) === key ? "above" : undefined;
  };

  const draggable = (row: T) => canDrag?.(row) ?? true;

  return {
    row: (row, groupId) => {
      const key = getRowKey(row);
      return {
        draggable: draggable(row),
        onDragStart: (event) => {
          event.dataTransfer.effectAllowed = "move";
          // Firefox won't start a drag without a payload. A dedicated type
          // instead of `text/plain`, so the row doesn't end up in unrelated
          // input fields.
          event.dataTransfer.setData("application/x-table-row", key);
          pickUp(row, groupId);
        },
        onDragEnd: reset,
        onDragOver: (event) => {
          const dragged = dragRef.current;
          // Nothing of ours in flight: hands off, otherwise the table would
          // take away the drop prohibition for foreign drags (files, text).
          if (!dragged) return;
          event.preventDefault();
          // The row is more specific than the group beneath it — its
          // handler must not overwrite the result.
          event.stopPropagation();
          const rest = restOf(groupId, dragged.key);
          const index = rest.findIndex((other) => getRowKey(other) === key);
          if (index === -1) return; // the dragged row itself
          const box = event.currentTarget.getBoundingClientRect();
          const above = event.clientY < box.top + box.height / 2;
          moveSlot({ groupId, index: above ? index : index + 1 });
        },
        "data-dragging": dragKey === key || undefined,
        "data-drop": edge(row, groupId),
      };
    },

    handle: (row, groupId) => {
      if (!draggable(row)) return null;
      const key = getRowKey(row);
      const isGrabbed = grabbed && dragKey === key;
      return {
        "aria-label": rowLabel?.(row),
        "aria-pressed": isGrabbed,
        "data-grabbed": isGrabbed || undefined,
        onKeyDown: (event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            if (isGrabbed) {
              drop();
              return;
            }
            pickUp(row, groupId);
            grabbedRef.current = true;
            setGrabbed(true);
            say("grabbed", null);
            return;
          }
          if (!isGrabbed) return;
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            // Only from here on — without a grabbed row, the arrow keys
            // stay with scrolling.
            event.preventDefault();
            step(event.key === "ArrowDown" ? 1 : -1);
          }
        },
        // Once focus moves away, the row can no longer be controlled.
        // Leaving it in limbo would be a state nobody could resolve anymore.
        onBlur: () => {
          if (grabbedRef.current) cancel();
        },
      };
    },

    groupHeader: (groupId) => ({
      onDragOver: (event) => {
        if (!dragRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        moveSlot({ groupId, index: 0 });
      },
      // The line under the header is the only anchor as long as the group
      // has no visible row.
      "data-drop":
        slot?.groupId === groupId &&
        dragKey &&
        (sectionOf(groupId)?.collapsed || restOf(groupId, dragKey).length === 0)
          ? "below"
          : undefined,
    }),

    root: {
      // Catches everything that lies between the rows — without a
      // `preventDefault` here, the browser forbids dropping there.
      onDragOver: (event) => {
        if (dragRef.current) event.preventDefault();
      },
      onDrop: (event) => {
        if (!dragRef.current) return;
        event.preventDefault();
        drop();
      },
      onDragLeave: (event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        moveSlot(null);
      },
    },

    status,
  };
}
