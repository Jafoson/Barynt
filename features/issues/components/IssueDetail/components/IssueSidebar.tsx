"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Resizer } from "@/components/ui/layout/Resizer/Resizer";
import type { SetFieldValue } from "@/features/custom-fields/types";
import type { IssueComposerData, IssuePatch } from "@/features/issues/types";
import { visibleDetailFields } from "@/features/projects/detail-fields";
import type { IssueDetail } from "@/types";
import styles from "../issueDetail.module.scss";
import { IssueCustomFields } from "./IssueCustomFields";
import { IssueLabels } from "./IssueLabels";
import { IssueMeta } from "./IssueMeta";
import { IssuePlanning } from "./IssuePlanning";
import { IssueProperties } from "./IssueProperties";

interface IssueSidebarProps {
  issue: IssueDetail;
  data: IssueComposerData;
  /**
   * Starting width in px. The full page prescribes a larger one than the
   * dialog — there's room for it there, and otherwise the values would sit
   * more cramped than necessary.
   */
  defaultWidth?: number;
  onPatch: (patch: IssuePatch) => void;
  onField: SetFieldValue;
}

/**
 * Bounds of the attributes sidebar. Below this, values no longer fit next
 * to their label; above it, it takes too much room from the text.
 * Additionally, `.sidebar` caps it in CSS at half the width — on a narrow
 * dialog, even 520px would be too much.
 */
const MIN_W = 220;
const MAX_W = 520;
/** Starting width in the dialog. Corresponds to `--detail-sidebar-w` in `.detail`. */
const DEFAULT_W = 300;
/** Starting width on the full page. Corresponds to `--detail-sidebar-w` in `.page`. */
export const PAGE_SIDEBAR_W = 380;

/**
 * The attributes sidebar of the two-column view — the same four blocks
 * that appear stacked in the main column of the side panel, here just next
 * to the content and in their narrow form (`layout="aside"`).
 *
 * At the top, what you change (type/status/priority/assignee, planning
 * inputs, labels); at the bottom, what's fixed. How wide it is is decided
 * by the handle on its left edge. The dragged width applies for the
 * current open view and resets to the starting width the next time it's
 * opened.
 */
export function IssueSidebar({
  issue,
  data,
  defaultWidth = DEFAULT_W,
  onPatch,
  onField,
}: IssueSidebarProps) {
  const t = useTranslations();
  const [width, setWidth] = useState(defaultWidth);

  // Field visibility (BARY-31) is a per-project setting, resolved from the
  // same `data.projects` lookup `identifier`/`prefix` already use elsewhere
  // in the detail views — no extra fetch needed.
  const project = data.projects.find((p) => p.id === issue.project);
  const visibleFields = visibleDetailFields(project?.hiddenDetailFields ?? []);
  const showLabels = visibleFields.has("labels");

  return (
    <>
      {/* A separate element between the columns instead of a border on the
          column itself: only this way does the hit area span the full
          height and doesn't scroll away with the content. */}
      <Resizer
        className={styles.sidebarResizer}
        width={width}
        onChange={setWidth}
        min={MIN_W}
        max={MAX_W}
        reset={defaultWidth}
        label={t("actions.resizeSidebar")}
      />

      <aside
        className={styles.sidebar}
        // Dragged value — it can only live here. The starting width still
        // comes from the stylesheet file.
        style={{ "--detail-sidebar-w": `${width}px` } as React.CSSProperties}
      >
        <IssueProperties
          issue={issue}
          data={data}
          layout="aside"
          visibleFields={visibleFields}
          onPatch={onPatch}
        />

        <div className={styles.divider} />

        <IssuePlanning
          issue={issue}
          layout="aside"
          visibleFields={visibleFields}
          onPatch={onPatch}
        />

        <div className={styles.divider} />

        {issue.customFields.length > 0 && (
          <>
            <IssueCustomFields
              issue={issue}
              members={data.members}
              layout="aside"
              onField={onField}
            />

            <div className={styles.divider} />
          </>
        )}

        {showLabels && (
          <>
            <IssueLabels
              issue={issue}
              data={data}
              layout="aside"
              onPatch={onPatch}
            />

            <div className={styles.divider} />
          </>
        )}

        <IssueMeta issue={issue} data={data} layout="aside" />
      </aside>
    </>
  );
}
