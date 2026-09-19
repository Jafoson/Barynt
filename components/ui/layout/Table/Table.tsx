import {
  type CSSProperties,
  cloneElement,
  isValidElement,
  type ReactNode,
} from "react";
import styles from "./table.module.scss";
import { FLAT_GROUP_ID, type TableColumn, type TableGroup } from "./types";
import type { TableDnd } from "./useTableDnd";
import type { TableSort } from "./useTableSort";

export type {
  TableAlign,
  TableColumn,
  TableGroup,
  TableSortValue,
} from "./types";

interface TableBaseProps<T> {
  columns: TableColumn<T>[];
  getRowKey: (row: T) => string;
  /**
   * Element that covers the entire row and makes it operable — usually a
   * `<Link>`. Deliberately no `onRowClick`: a link comes with focus,
   * keyboard, middle-click, and "open in new tab" built in. Interactive
   * cell content (buttons, links, inputs) automatically sits above it.
   */
  rowOverlay?: (row: T) => ReactNode;
  /** Permanently highlights a row, e.g. the currently open object. */
  isRowActive?: (row: T) => boolean;
  /** The keyboard cursor (j/k/arrows) — independent of `isRowActive`. */
  isRowFocused?: (row: T) => boolean;
  /** Name of the table for screen readers. */
  label?: string;
  /** Fallback content when there's not a single row. */
  empty?: ReactNode;
  /**
   * Extra row at the end, in the same scroll area as the rows before it —
   * for the infinite-scroll edge (`LoadMoreSentinel`). With `fill`, it
   * would otherwise sit outside the scrolling area and never notice
   * someone scrolling to the end.
   */
  footer?: ReactNode;
  /** Fills the available space of a flex container and scrolls itself. */
  fill?: boolean;
  /**
   * `"card"` wraps the table in a bordered area with dividers between the
   * rows — for admin lists that stand as a self-contained block on a page.
   * `"plain"` (default) leaves the rows floating freely and separates them
   * only through rhythm and hover; that fits when the table is the whole
   * view.
   */
  variant?: "plain" | "card";
  /**
   * Makes the rows draggable — the result of `useTableDnd`. Without this
   * prop, the table stays what it is: a stateless view that a Server
   * Component can render too.
   */
  dnd?: TableDnd<T>;
  /**
   * Makes the headers of sortable columns clickable — the result of
   * `useTableSort`. As with `dnd`, the table itself stays stateless: it
   * draws what's currently sorted by and reports the click back. The rows
   * are sorted by the caller before they arrive here.
   */
  sort?: TableSort;
  className?: string;
}

/**
 * Rows come either flat (`rows`) or in groups with their own header
 * (`groups`) — both at once would be two truths about the same table.
 */
export type TableProps<T> = TableBaseProps<T> &
  ({ rows: T[]; groups?: never } | { groups: TableGroup<T>[]; rows?: never });

const DEFAULT_WIDTH = "auto";

/**
 * The angles of the sort mark, all in the same field (10×14).
 *
 * Unselected, `UP` and `DOWN` sit together as a pair — the familiar sign for
 * "sortable here". Once sorted, only the active one remains, but then in
 * the middle of the field: one direction is shown, not one of two
 * emphasized.
 */
const SORT_MARK = {
  up: "M2 5.5 5 2.5l3 3",
  down: "M2 8.5 5 11.5l3-3",
  asc: "M2 8.5 5 5.5l3 3",
  desc: "M2 5.5 5 8.5l3-3",
};

/** Six dots — the familiar sign for "grab here". */
const GRIP_DOTS = [
  [3, 4],
  [7, 4],
  [3, 8],
  [7, 8],
  [3, 12],
  [7, 12],
];

/**
 * Table with a single grid raster: `<tr>` picks up the `<table>`'s columns
 * again via `subgrid`. That way the columns of every group line up exactly,
 * even when their width comes from the content — and the row stays a real
 * box that can carry sticky group headers, hover, and a row-filling link,
 * which is exactly where native table layout falls short.
 *
 * The appearance lives in `table.module.scss`. The caller may adjust four
 * values — as inherited custom properties on its wrapper, not as a prop,
 * because they're pure appearance:
 *
 * ```scss
 * .wrapper {
 *   --table-row-height: 52px;              // row height
 *   --table-surface: var(--surface);       // base surface of the card
 *   --table-divider: var(--outline-variant); // line between rows
 *   --table-hover: transparent;            // area under the pointer
 * }
 * ```
 *
 * The default is the single-line list: row height `--row-h`, page
 * background, no dividers.
 */
export function Table<T>({
  columns,
  getRowKey,
  rowOverlay,
  isRowActive,
  isRowFocused,
  label,
  empty,
  footer,
  fill,
  variant = "plain",
  dnd,
  sort,
  className,
  rows,
  groups,
}: TableProps<T>) {
  // Flat rows are the special case "one group without a header".
  const sections: TableGroup<T>[] = groups ?? [
    { id: FLAT_GROUP_ID, rows: rows ?? [] },
  ];
  const showHead = columns.some((column) => column.header !== undefined);
  const isEmpty = sections.every((section) => section.rows.length === 0);

  const cellClass = (column: TableColumn<T>) =>
    [styles.cell, column.align && styles[column.align]]
      .filter(Boolean)
      .join(" ");

  const root = [
    styles.table,
    fill && styles.fill,
    variant === "card" && styles.card,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // If a card scrolls itself, rounding and the scrollbar need separate
  // elements: the native bar doesn't round its own corner along with it,
  // so the card would look square on the right the moment it overflows.
  // `cardFrame` takes over the border and rounding from the outside,
  // without scrolling itself.
  const cardFill = variant === "card" && Boolean(fill);

  // Column widths are data, not appearance — so they're passed into the
  // stylesheet as a custom property instead of as a class per layout.
  const trackStyle = {
    "--table-cols": columns
      .map((column) => column.width ?? DEFAULT_WIDTH)
      .join(" "),
  } as CSSProperties;

  // An anchor is draggable by default: without this prohibition, the
  // browser would drag the link along instead of the row beneath it.
  const overlayOf = (row: T) => {
    const node = rowOverlay?.(row);
    return dnd && isValidElement<{ draggable?: boolean }>(node)
      ? cloneElement(node, { draggable: false })
      : node;
  };

  // Without rows there's nothing to align: the fallback content stands on
  // its own, not within the table's columns.
  if (isEmpty && empty) {
    const emptyEl = (
      <div
        className={[
          styles.empty,
          fill && styles.fill,
          variant === "card" && styles.card,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {empty}
      </div>
    );
    return cardFill ? (
      <div className={styles.cardFrame}>{emptyEl}</div>
    ) : (
      emptyEl
    );
  }

  const tableEl = (
    // The roles look redundant, but aren't: browsers derive table semantics
    // from the layout and drop them as soon as `display` is overridden —
    // here, by the grid. Without the roles, a screen reader announces a
    // nameless group instead of a table. `noRedundantRoles`/
    // `useSemanticElements` are therefore disabled for this file in
    // biome.json.
    <table
      className={root}
      style={trackStyle}
      role="table"
      aria-label={label}
      data-dnd={dnd ? "" : undefined}
      {...(dnd ? dnd.root : {})}
    >
      {/* The only place for a live region inside a <table>. It announces
          what keyboard sorting would show; `role="status"` takes away its
          role as the table's caption. */}
      {dnd && (
        <caption className={styles.status} role="status">
          {dnd.status}
        </caption>
      )}

      {showHead && (
        <thead className={styles.group} role="rowgroup">
          <tr className={styles.headRow} role="row">
            {columns.map((column) => {
              const sortable = Boolean(sort && column.sortValue);
              const active = sortable && sort?.columnId === column.id;
              return (
                <th
                  key={column.id}
                  className={cellClass(column)}
                  // Which column this is — for a caller's own layout of the
                  // row (the issue list re-arranges its cells on a phone).
                  data-col={column.id}
                  role="columnheader"
                  scope="col"
                  // `none` says "sortable, but not currently sorted" —
                  // without this attribute, a screen reader wouldn't even
                  // recognize the column as a handle in the first place.
                  aria-sort={
                    active
                      ? sort?.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : sortable
                        ? "none"
                        : undefined
                  }
                >
                  {sortable ? (
                    <button
                      type="button"
                      className={styles.sortButton}
                      data-active={active || undefined}
                      onClick={() => sort?.toggle(column.id)}
                    >
                      {column.header}
                      {/* The mark is always there, even unselected: a sort
                          you'd only discover on hover doesn't exist at all
                          on a touchscreen. The field keeps its size in the
                          process — nothing jumps on click. */}
                      <svg
                        className={styles.sortArrow}
                        data-direction={active ? sort?.direction : undefined}
                        viewBox="0 0 10 14"
                        aria-hidden="true"
                        focusable="false"
                      >
                        {(active && sort
                          ? [SORT_MARK[sort.direction]]
                          : [SORT_MARK.up, SORT_MARK.down]
                        ).map((d) => (
                          <path
                            key={d}
                            d={d}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ))}
                      </svg>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
      )}

      {sections.map((section) => (
        // `display: contents` — the group only structures, the raster
        // belongs to the table.
        <tbody
          key={section.id}
          className={styles.group}
          role="rowgroup"
          aria-label={section.label}
        >
          {section.header && (
            <tr
              className={styles.groupRow}
              role="row"
              {...(dnd ? dnd.groupHeader(section.id) : {})}
            >
              <th
                className={styles.groupCell}
                role="columnheader"
                scope="colgroup"
                colSpan={columns.length}
              >
                {section.header}
              </th>
            </tr>
          )}

          {!section.collapsed &&
            section.rows.map((row) => {
              const handle = dnd?.handle(row, section.id);
              return (
                <tr
                  key={getRowKey(row)}
                  className={styles.row}
                  role="row"
                  data-active={isRowActive?.(row) || undefined}
                  data-focused={isRowFocused?.(row) || undefined}
                  // Queried by callers' own keyboard navigation to scroll
                  // the focused row into view.
                  data-row-key={getRowKey(row)}
                  {...(dnd ? dnd.row(row, section.id) : {})}
                >
                  {columns.map((column, index) => (
                    <td
                      key={column.id}
                      className={cellClass(column)}
                      data-col={column.id}
                      role="cell"
                    >
                      {/* Handle and overlay hang in the first cell, spanned
                        across the entire row. */}
                      {index === 0 && handle && (
                        <button
                          type="button"
                          className={styles.handle}
                          {...handle}
                        >
                          <svg
                            className={styles.grip}
                            viewBox="0 0 10 16"
                            aria-hidden="true"
                            focusable="false"
                          >
                            {GRIP_DOTS.map(([cx, cy]) => (
                              <circle
                                key={`${cx}-${cy}`}
                                cx={cx}
                                cy={cy}
                                r="1.15"
                              />
                            ))}
                          </svg>
                        </button>
                      )}
                      {index === 0 && rowOverlay && (
                        <div className={styles.overlay}>{overlayOf(row)}</div>
                      )}
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      ))}

      {footer && (
        <tfoot className={styles.footerGroup} role="rowgroup">
          <tr className={styles.footerRow} role="row">
            <td
              className={styles.footerCell}
              role="cell"
              colSpan={columns.length}
            >
              {footer}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );

  if (cardFill) return <div className={styles.cardFrame}>{tableEl}</div>;
  // A table that doesn't fill its view can be wider than a phone: this wrapper
  // scrolls it sideways there, and doesn't exist as a box anywhere else.
  return fill ? tableEl : <div className={styles.scrollX}>{tableEl}</div>;
}
