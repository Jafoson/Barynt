/**
 * The table's data model — no hooks, no `"use client"`.
 *
 * `Table` renders both server- and client-side, `useTableDnd` only runs in
 * the browser. Both read the same types, but must not import each other:
 * a value from a client module would only be a reference in server render,
 * not a string. That's why the shared parts live here.
 */

import type { HTMLAttributes, ReactNode } from "react";

export type TableAlign = "start" | "center" | "end";

export interface TableColumn<T> {
  /** Stable column ID — also serves as the React key of the cells. */
  id: string;
  /**
   * Title in the header row. If no column defines one, the header row is
   * omitted entirely — list views often do without it.
   */
  header?: ReactNode;
  /**
   * The column's grid track: `"auto"`, `"max-content"`, `"minmax(0, 1fr)"`,
   * `"88px"` … Content-based values measure across *all* rows, because rows
   * are `subgrid`. Exactly one column should get `minmax(0, 1fr)` — it
   * absorbs the rest and truncates its content.
   */
  width?: string;
  align?: TableAlign;
  cell: (row: T) => ReactNode;
  /**
   * Makes the column sortable — by the value, not by the cell: what renders
   * there is an avatar, a label, or a badge, and none of those can be
   * compared.
   *
   * Only together with `useTableSort` does this become a clickable header.
   * A column without this function stays a plain heading — whatever can't
   * be meaningfully ordered (actions, avatars, free-form text blobs)
   * shouldn't look like it can either.
   */
  sortValue?: (row: T) => TableSortValue;
  /**
   * More in the header cell, after the title — a handle to resize the
   * column, a menu. Sits beside the sort button, never inside it.
   */
  headerExtra?: ReactNode;
  /** Attributes for the header cell itself — to drag the column, say. */
  headerProps?: HTMLAttributes<HTMLTableCellElement>;
  /**
   * The column's sum — under each group and under the whole table, when
   * the table is given `totals`. A column without one leaves its cell
   * empty there.
   */
  total?: (rows: T[]) => ReactNode;
}

/** Sum rows below each group and the whole table. */
export interface TableTotals<T> {
  /** The column whose cell carries the row's name ("Total", the group). */
  labelColumn: string;
  label: (
    scope: "group" | "all",
    rows: T[],
    group?: TableGroup<T>,
  ) => ReactNode;
}

/**
 * What's sorted on. `Date` and numbers compare by magnitude, strings by the
 * browser's language; empty (`null`, `undefined`, `""`) always ends up at
 * the bottom — in both directions, because "nothing" isn't a small value,
 * it's a missing one.
 */
export type TableSortValue = string | number | Date | null | undefined;

export type TableSortDirection = "asc" | "desc";

export interface TableGroup<T> {
  id: string;
  /** Visible group header — stays pinned at the top while scrolling. */
  header?: ReactNode;
  /** Group name for screen readers, when `header` is mostly graphical. */
  label?: string;
  /**
   * Hides the rows, the header stays. The caller holds the state — it
   * renders the header and thereby its toggle too.
   */
  collapsed?: boolean;
  rows: T[];
}

/**
 * Group ID of the flat table. A table without `groups` is internally the
 * group "all rows" — this ID shows up again as the target when sorting via
 * drag & drop.
 */
export const FLAT_GROUP_ID = "rows";
