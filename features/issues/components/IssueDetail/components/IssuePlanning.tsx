"use client";

import { Icon } from "@iconify/react";
import { useFormatter, useTranslations } from "next-intl";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { ValuePopover } from "@/features/issues/components/ValuePopover/ValuePopover";
import {
  ESTIMATE_UNIT_MESSAGE_KEY,
  ESTIMATE_UNITS,
  estimateToHours,
  formatEstimateValue,
  hoursToEstimate,
} from "@/features/issues/estimate";
import type { IssuePatch } from "@/features/issues/types";
import type { DetailFieldKey } from "@/features/projects/detail-fields";
import type { EstimateUnit, IssueDetail } from "@/types";
import styles from "../issueDetail.module.scss";
import type { IssueDetailLayout } from "../types";

interface IssuePlanningProps {
  issue: IssueDetail;
  layout: IssueDetailLayout;
  /** Which of dueDate/storyPoints/estimateHours this project's settings
   *  show (BARY-31, `visibleDetailFields()`). */
  visibleFields: Set<DetailFieldKey>;
  onPatch: (patch: IssuePatch) => void;
}

/** Labeled row: name on the left, value on the right — same shape as
 *  `IssueMeta`'s own `Row`. */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <div className={styles.rowValue}>{children}</div>
    </div>
  );
}

/**
 * Due date, story points, and time estimate (BARY-4) — an issue's planning
 * inputs, kept apart from the type/status/priority/assignee bar
 * (`IssueProperties`): that bar says what the issue *is* right now, this
 * says how it fits into a schedule. Same kind of split `IssueMeta` already
 * draws between "what you change" and "what's fixed" — this is a third,
 * orthogonal grouping, not a variant of either.
 *
 * In the main column this gets its own header, mirroring `IssueMeta`'s
 * "Details" section exactly; in the attributes sidebar it's bare rows —
 * the dividers `IssueSidebar` places around it already separate it there.
 */
export function IssuePlanning({
  issue,
  layout,
  visibleFields,
  onPatch,
}: IssuePlanningProps) {
  const t = useTranslations();
  const format = useFormatter();
  const canEdit = issue.access.canEdit;

  const showDueDate = visibleFields.has("dueDate");
  const showStoryPoints = visibleFields.has("storyPoints");
  const showEstimateHours = visibleFields.has("estimateHours");

  if (!showDueDate && !showStoryPoints && !showEstimateHours) return null;

  const rows = (
    <>
      {showDueDate && (
        <Row label={t("fields.dueDate")}>
          {canEdit ? (
            <InlinePicker
              width={200}
              stop
              trigger={
                <button
                  type="button"
                  className={styles.valueBtn}
                  data-field-nav
                >
                  <span className={styles.valueText}>
                    {issue.dueDate !== null
                      ? format.dateTime(issue.dueDate, { dateStyle: "medium" })
                      : t("fields.noDueDate")}
                  </span>
                </button>
              }
            >
              {(close) => (
                <ValuePopover<number | null>
                  initialValue={issue.dueDate}
                  clearable={issue.dueDate !== null}
                  onConfirm={(value) => onPatch({ dueDate: value })}
                  onClear={() => onPatch({ dueDate: null })}
                  close={close}
                >
                  {(value, setValue) => (
                    <Input
                      variant="date"
                      size="sm"
                      value={
                        value ? new Date(value).toISOString().slice(0, 10) : ""
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        setValue(raw ? new Date(raw).getTime() : null);
                      }}
                      autoFocus
                    />
                  )}
                </ValuePopover>
              )}
            </InlinePicker>
          ) : (
            <span className={styles.valueBtn}>
              <span className={styles.valueText}>
                {issue.dueDate !== null
                  ? format.dateTime(issue.dueDate, { dateStyle: "medium" })
                  : t("fields.noDueDate")}
              </span>
            </span>
          )}
        </Row>
      )}

      {showStoryPoints && (
        <Row label={t("fields.storyPoints")}>
          {canEdit ? (
            <InlinePicker
              width={160}
              stop
              trigger={
                <button
                  type="button"
                  className={styles.valueBtn}
                  data-field-nav
                >
                  <span className={styles.valueText}>
                    {issue.storyPoints ?? t("fields.noEstimate")}
                  </span>
                </button>
              }
            >
              {(close) => (
                <ValuePopover<number | null>
                  initialValue={issue.storyPoints}
                  clearable={issue.storyPoints !== null}
                  onConfirm={(value) => onPatch({ storyPoints: value })}
                  onClear={() => onPatch({ storyPoints: null })}
                  close={close}
                >
                  {(value, setValue) => (
                    <Input
                      variant="number"
                      size="sm"
                      step={1}
                      value={value ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setValue(raw === "" ? null : Number(raw));
                      }}
                      autoFocus
                    />
                  )}
                </ValuePopover>
              )}
            </InlinePicker>
          ) : (
            <span className={styles.valueBtn}>
              <span className={styles.valueText}>
                {issue.storyPoints ?? t("fields.noEstimate")}
              </span>
            </span>
          )}
        </Row>
      )}

      {showEstimateHours && (
        <Row label={t("fields.estimateHours")}>
          {canEdit ? (
            <InlinePicker
              width={220}
              stop
              trigger={
                <button
                  type="button"
                  className={styles.valueBtn}
                  data-field-nav
                >
                  <span className={styles.valueText}>
                    {issue.estimateHours !== null
                      ? `${formatEstimateValue(hoursToEstimate(issue.estimateHours, issue.estimateUnit ?? "hours"))} ${t(ESTIMATE_UNIT_MESSAGE_KEY[issue.estimateUnit ?? "hours"])}`
                      : t("fields.noEstimate")}
                  </span>
                </button>
              }
            >
              {(close) => {
                const currentUnit = issue.estimateUnit ?? "hours";
                return (
                  <ValuePopover<{ value: number | null; unit: EstimateUnit }>
                    initialValue={{
                      value:
                        issue.estimateHours !== null
                          ? hoursToEstimate(issue.estimateHours, currentUnit)
                          : null,
                      unit: currentUnit,
                    }}
                    clearable={issue.estimateHours !== null}
                    onConfirm={({ value, unit }) =>
                      onPatch(
                        value === null
                          ? { estimateHours: null, estimateUnit: null }
                          : {
                              estimateHours: estimateToHours(value, unit),
                              estimateUnit: unit,
                            },
                      )
                    }
                    onClear={() =>
                      onPatch({ estimateHours: null, estimateUnit: null })
                    }
                    close={close}
                  >
                    {(pending, setPending) => (
                      <div className={styles.estimateRow}>
                        <Input
                          variant="number"
                          size="sm"
                          min={0}
                          step={0.5}
                          value={pending.value ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setPending({
                              ...pending,
                              value: raw === "" ? null : Number(raw),
                            });
                          }}
                          autoFocus
                        />
                        <select
                          className={styles.unitSelect}
                          value={pending.unit}
                          onChange={(e) =>
                            setPending({
                              ...pending,
                              unit: e.target.value as EstimateUnit,
                            })
                          }
                        >
                          {ESTIMATE_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {t(ESTIMATE_UNIT_MESSAGE_KEY[unit])}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </ValuePopover>
                );
              }}
            </InlinePicker>
          ) : (
            <span className={styles.valueBtn}>
              <span className={styles.valueText}>
                {issue.estimateHours !== null
                  ? `${formatEstimateValue(hoursToEstimate(issue.estimateHours, issue.estimateUnit ?? "hours"))} ${t(ESTIMATE_UNIT_MESSAGE_KEY[issue.estimateUnit ?? "hours"])}`
                  : t("fields.noEstimate")}
              </span>
            </span>
          )}
        </Row>
      )}
    </>
  );

  if (layout === "aside") return rows;

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <Icon icon="lucide:calendar-clock" width={15} aria-hidden="true" />
        <h3 className={styles.sectionTitle}>{t("fields.planning")}</h3>
      </header>
      <div className={styles.rowGrid}>{rows}</div>
    </section>
  );
}
