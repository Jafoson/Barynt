import type { ReactNode } from "react";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import styles from "./settingsList.module.scss";

/** A setting as a row: what it's about, what it means, what you change it with. */
export interface SettingsRow {
  id: string;
  label: string;
  desc?: ReactNode;
  /** The control — for exactly one column (the normal case). */
  control?: ReactNode;
  /** For multiple columns: one control per column id. */
  cells?: Record<string, ReactNode>;
}

/** A column of controls, for when one isn't enough. */
export interface SettingsColumn {
  id: string;
  header: string;
  /** Grid track. Default: `104px` — narrow enough that the headers count. */
  width?: string;
}

interface Props {
  rows: SettingsRow[];
  /** Heading above the list. Without it, the list stands on its own. */
  title?: string;
  /** Name of the list for screen readers. Default: `title`. */
  label?: string;
  /**
   * Multiple control columns instead of one — each with its own header,
   * cells then coming from `row.cells`. Without this prop, each row carries
   * exactly one control (`row.control`) and the list needs no header row.
   */
  columns?: SettingsColumn[];
  /** Warning color in the border — for rows that can't be undone. */
  danger?: boolean;
  className?: string;
}

const SETTING_COLUMN: TableColumn<SettingsRow> = {
  id: "setting",
  width: "minmax(0, 1fr)",
  cell: (row) => (
    <div className={styles.setting}>
      <span className={styles.label}>{row.label}</span>
      {row.desc && <span className={styles.desc}>{row.desc}</span>}
    </div>
  ),
};

/**
 * A list of settings: on the left, what it's about (label above
 * explanation), on the right, what you change it with.
 *
 * The same grid that the project and workspace settings build by hand —
 * here as a shared building block once, because the account settings have
 * five sections and five copies of the same grid would be five
 * opportunities to drift apart.
 *
 * A setting isn't a list of similar records, it's a form. That's why the
 * table below deviates from its defaults in three values (see
 * `settingsList.module.scss`): the row carries two lines of text and needs
 * height, it's separated from the next one, and it doesn't light up on
 * hover — only the control on the right is clickable.
 */
export function SettingsList({
  rows,
  title,
  label,
  columns,
  danger = false,
  className,
}: Props) {
  const controlColumns: TableColumn<SettingsRow>[] = columns
    ? columns.map((column) => ({
        id: column.id,
        header: column.header,
        width: column.width ?? "104px",
        align: "center",
        cell: (row) => row.cells?.[column.id] ?? null,
      }))
    : [
        {
          id: "control",
          // Every control at the same width, so the right edges form a
          // straight line.
          width: "minmax(280px, max-content)",
          align: "end",
          cell: (row) => row.control ?? null,
        },
      ];

  const table = (
    <Table
      variant="card"
      className={[
        styles.table,
        !columns && styles.stacked,
        columns && styles.multi,
        danger && styles.danger,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      label={label ?? title}
      columns={[SETTING_COLUMN, ...controlColumns]}
      rows={rows}
      getRowKey={(row) => row.id}
    />
  );

  if (!title) return table;

  return (
    <section className={styles.group}>
      <h2
        className={[styles.title, danger && styles.dangerTitle]
          .filter(Boolean)
          .join(" ")}
      >
        {title}
      </h2>
      {table}
    </section>
  );
}

/**
 * The scrolling part of a settings page — everything below the header.
 *
 * Defined here instead of once per section: the header (`PageHeader`) stays
 * on top, the lists below it scroll, and the spacing between them is the
 * same everywhere. Five separate stylesheets for the same box would be five
 * opportunities for it to look different somewhere else.
 */
export function SettingsBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={[styles.body, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
