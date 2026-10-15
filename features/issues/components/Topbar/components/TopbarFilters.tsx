"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import {
  type FilterNode,
  type FilterRule,
  type IssueFilter,
  isGroup,
} from "@/features/issues/filter";
import { visibleDetailFields } from "@/features/projects/detail-fields";
import type {
  IssueType,
  Label,
  Priority,
  Project,
  Status,
  User,
} from "@/types";
import { FILTER_ACCENT } from "../filterAccent";
import { type FilterLabelLookups, useFilterLabels } from "../filterLabels";
import type { ChipField } from "../filterModel";
import styles from "../topbar.module.scss";
import type { FilterKey, FilterState, IssueArea } from "../useTopbar";
import { AssigneeFilter } from "./AssigneeFilter";
import { DueDateFilter } from "./DueDateFilter";
import { LabelFilter } from "./LabelFilter";
import { PriorityFilter } from "./PriorityFilter";
import { ProjectFilter } from "./ProjectFilter";
import { StatusFilter } from "./StatusFilter";
import { StoryPointsFilter } from "./StoryPointsFilter";
import { TypeFilter } from "./TypeFilter";

interface TopbarFiltersProps {
  filters: FilterState;
  filterCount: number;
  /** What the view is showing — determines the last chip slot. */
  area: IssueArea;
  /** Empty in the "My issues" area: there is no single project there. */
  projectId: string;
  projectName: string;
  /** Empty in the "My issues" area — same reasoning, nothing to hide against. */
  hiddenDetailFields: string[];
  workspaceId: string;
  statuses: Status[];
  priorities: Priority[];
  members: User[];
  labels: Label[];
  projects: Project[];
  issueTypes: IssueType[];
  /** Which chips say "is not" (BARY-166). */
  negated: Record<ChipField, boolean>;
  onNegate: (key: ChipField, negated: boolean) => void;
  /** Rules and OR groups the chips can't show — a rule chip each. */
  extras: { node: FilterNode; index: number }[];
  /** The "Advanced" button with its editor — placed before "reset". */
  advanced?: React.ReactNode;
  /** Removes an extra — or, with a `path`, one part of a group. */
  onRemoveExtra: (index: number, path?: number[]) => void;
  /** A click on a rule chip opens the advanced editor. */
  onOpenEditor: () => void;
  onToggle: (key: FilterKey, value: string | number) => void;
  onClear: (key: FilterKey) => void;
  onClearAll: () => void;
}

export function TopbarFilters({
  filters,
  filterCount,
  area,
  projectId,
  projectName,
  hiddenDetailFields,
  workspaceId,
  statuses,
  priorities,
  members,
  labels,
  projects,
  issueTypes,
  negated,
  onNegate,
  extras,
  onRemoveExtra,
  advanced,
  onOpenEditor,
  onToggle,
  onClear,
  onClearAll,
}: TopbarFiltersProps) {
  const t = useTranslations();
  const labelsOf = useFilterLabels({
    statuses,
    priorities,
    issueTypes,
    members,
    labels,
    projects,
  });
  const visibleFields = visibleDetailFields(hiddenDetailFields);

  return (
    <>
      <StatusFilter
        value={filters.status}
        statuses={statuses}
        onToggle={(id) => onToggle("status", id)}
        onClear={() => onClear("status")}
        negated={negated.status}
        onNegate={(v) => onNegate("status", v)}
      />
      {issueTypes.length > 0 && (
        <TypeFilter
          value={filters.type}
          issueTypes={issueTypes}
          onToggle={(id) => onToggle("type", id)}
          onClear={() => onClear("type")}
          negated={negated.type}
          onNegate={(v) => onNegate("type", v)}
        />
      )}
      {visibleFields.has("priority") && (
        <PriorityFilter
          value={filters.priority}
          priorities={priorities}
          onToggle={(id) => onToggle("priority", id)}
          onClear={() => onClear("priority")}
          negated={negated.priority}
          onNegate={(v) => onNegate("priority", v)}
        />
      )}
      {/* The last slot answers whatever the area leaves open: within a
          project that's the assignee, for my issues it's the project — the
          other question is already settled in each case. */}
      {area === "project" ? (
        <AssigneeFilter
          value={filters.assignee}
          members={members}
          onToggle={(id) => onToggle("assignee", id)}
          onClear={() => onClear("assignee")}
          negated={negated.assignee}
          onNegate={(v) => onNegate("assignee", v)}
        />
      ) : (
        <ProjectFilter
          value={filters.project}
          projects={projects}
          onToggle={(id) => onToggle("project", id)}
          onClear={() => onClear("project")}
          negated={negated.project}
          onNegate={(v) => onNegate("project", v)}
        />
      )}
      {visibleFields.has("labels") && (
        <LabelFilter
          value={filters.label}
          labels={labels}
          projectId={projectId}
          projectName={projectName}
          workspaceId={workspaceId}
          onToggle={(id) => onToggle("label", id)}
          onClear={() => onClear("label")}
          negated={negated.label}
          onNegate={(v) => onNegate("label", v)}
        />
      )}
      {visibleFields.has("storyPoints") && (
        <StoryPointsFilter
          value={filters.storyPoints}
          onToggle={(points) => onToggle("storyPoints", points)}
          onClear={() => onClear("storyPoints")}
          negated={negated.storyPoints}
          onNegate={(v) => onNegate("storyPoints", v)}
        />
      )}
      {visibleFields.has("dueDate") && (
        <DueDateFilter
          value={filters.dueDate}
          onToggle={(bucket) => onToggle("dueDate", bucket)}
          onClear={() => onClear("dueDate")}
        />
      )}

      {/* What the chips can't show (BARY-166): a single rule ("at least",
          a date) gets a chip of its own; a click opens the editor. */}
      {extras
        .filter(({ node }) => !isGroup(node))
        .map(({ node, index }) => (
          <Chip
            key={`${index}:${labelsOf.node(node)}`}
            type="input"
            variant="text"
            className={styles.ruleChip}
            title={labelsOf.node(node)}
            onClick={onOpenEditor}
            onRemove={() => onRemoveExtra(index)}
            removeLabel={t("filters.removeRule", {
              rule: labelsOf.node(node),
            })}
          >
            <span className={styles.ruleText}>
              {!isGroup(node) && <RuleText rule={node} labelsOf={labelsOf} />}
            </span>
          </Chip>
        ))}

      {advanced}

      {filterCount > 0 && (
        <Button
          variant="ghost"
          className={styles.clearAll}
          icon={<Icon icon="lucide:x" width={13} />}
          onClick={onClearAll}
        >
          {t("actions.clear")}
        </Button>
      )}

      {/* UND/ODER groups: a row of their own below, scrolling sideways —
          each condition a chip, an UND run in a primary frame, ODER as a
          plaque between. Groups on this level are joined by UND. */}
      {extras.some(({ node }) => isGroup(node)) && (
        <div className={styles.groupRow}>
          {extras
            .filter(({ node }) => isGroup(node))
            .map(({ node, index }, n) => (
              <Fragment key={`${index}:${labelsOf.node(node)}`}>
                {n > 0 && (
                  <span className={styles.opPill} data-op="and">
                    {t("filters.and")}
                  </span>
                )}
                <GroupParts
                  node={node}
                  labelsOf={labelsOf}
                  onOpen={onOpenEditor}
                  onRemove={(path) => onRemoveExtra(index, path)}
                />
                <button
                  type="button"
                  className={styles.groupRemove}
                  aria-label={t("filters.removeRule", {
                    rule: labelsOf.node(node),
                  })}
                  title={t("filters.removeRule", { rule: labelsOf.node(node) })}
                  onClick={() => onRemoveExtra(index)}
                >
                  <Icon icon="lucide:x" width={13} />
                </button>
              </Fragment>
            ))}
        </div>
      )}
    </>
  );
}

/** One rule in words — "is not" said by crossing it out. */
function RuleText({
  rule,
  labelsOf,
}: {
  rule: FilterRule;
  labelsOf: ReturnType<typeof useFilterLabels>;
}) {
  // One inline run: in a flex parent, loose text pieces lose the spaces
  // between them.
  // "is not": the whole condition crossed out, read as "is" — easier to
  // spot than the words.
  if (rule.is === "none" && Array.isArray(rule.value))
    return (
      <s className={styles.notValues}>
        {`${labelsOf.field(rule.field)} ${labelsOf.op(rule.field, "any")} ${rule.value
          .map((v) => labelsOf.value(rule.field, v))
          .join(", ")}`}
      </s>
    );
  // A day as a date chip, like in descriptions.
  if (
    (rule.is === "before" || rule.is === "after") &&
    typeof rule.value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(rule.value)
  )
    return (
      <span>
        {`${labelsOf.field(rule.field)} ${labelsOf.op(rule.field, rule.is)} `}
        <span className={styles.dateChip}>
          <Icon icon="lucide:calendar" width={12} aria-hidden="true" />
          <time dateTime={rule.value} suppressHydrationWarning>
            {labelsOf.value(rule.field, rule.value)}
          </time>
        </span>
      </span>
    );
  return <span>{labelsOf.rule(rule)}</span>;
}

/** A group's parts in the group row: conditions as chips (a × on hover
 *  takes one out), a nested group in a frame of its kind's color, UND/ODER
 *  plaques between. */
function GroupParts({
  node,
  labelsOf,
  onOpen,
  onRemove,
  path = [],
}: {
  node: FilterNode;
  labelsOf: ReturnType<typeof useFilterLabels>;
  /** Opens the editor — without it the text is just text. */
  onOpen?: () => void;
  onRemove: (path: number[]) => void;
  path?: number[];
}) {
  const t = useTranslations();
  if (!isGroup(node))
    return (
      <span
        className={styles.condChip}
        // The same outline as the field's own chip above.
        style={
          node.field in FILTER_ACCENT
            ? ({
                "--filter-accent": FILTER_ACCENT[node.field as FilterKey],
              } as React.CSSProperties)
            : undefined
        }
      >
        {onOpen ? (
          <button type="button" className={styles.condLabel} onClick={onOpen}>
            <RuleText rule={node} labelsOf={labelsOf} />
          </button>
        ) : (
          <span className={styles.condLabel}>
            <RuleText rule={node} labelsOf={labelsOf} />
          </span>
        )}
        <button
          type="button"
          className={styles.condRemove}
          aria-label={t("filters.removeRule", { rule: labelsOf.rule(node) })}
          title={t("filters.removeRule", { rule: labelsOf.rule(node) })}
          onClick={() => onRemove(path)}
        >
          <Icon icon="lucide:x" width={12} />
        </button>
      </span>
    );
  return (
    <>
      {node.rules.map((child, i) => (
        <Fragment key={`${i}:${labelsOf.member(child)}`}>
          {i > 0 && (
            <span className={styles.opPill} data-op={node.op}>
              {node.op === "or" ? t("filters.or") : t("filters.and")}
            </span>
          )}
          {isGroup(child) ? (
            <span className={styles.groupBox} data-op={child.op}>
              <GroupParts
                node={child}
                labelsOf={labelsOf}
                onOpen={onOpen}
                onRemove={onRemove}
                path={[...path, i]}
              />
            </span>
          ) : (
            <GroupParts
              node={child}
              labelsOf={labelsOf}
              onOpen={onOpen}
              onRemove={onRemove}
              path={[...path, i]}
            />
          )}
        </Fragment>
      ))}
    </>
  );
}

/**
 * Tablet and phone: every active filter in a row of its own under the
 * filter button, scrolling sideways — fields, single rules and UND/ODER
 * groups alike, each condition with a × (BARY-166). The desktop shows the
 * same through its chips and group row.
 */
export function ActiveFilters({
  tree,
  lookups,
  onRemove,
}: {
  tree: IssueFilter;
  lookups: FilterLabelLookups;
  /** Removes the top-level node at `index` — or, with a `path`, one part. */
  onRemove: (index: number, path?: number[]) => void;
}) {
  const t = useTranslations();
  const labelsOf = useFilterLabels(lookups);
  const nodes = tree.rules
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => isGroup(node) || node.field !== "text");
  if (!nodes.length) return null;

  return (
    <div className={styles.activeRow}>
      {nodes.map(({ node, index }) =>
        isGroup(node) ? (
          <span
            key={`${index}:${labelsOf.node(node)}`}
            className={styles.activeGroup}
          >
            <GroupParts
              node={node}
              labelsOf={labelsOf}
              onRemove={(path) => onRemove(index, path)}
            />
            <button
              type="button"
              className={styles.groupRemove}
              aria-label={t("filters.removeRule", {
                rule: labelsOf.node(node),
              })}
              onClick={() => onRemove(index)}
            >
              <Icon icon="lucide:x" width={13} />
            </button>
          </span>
        ) : (
          <GroupParts
            key={`${index}:${labelsOf.node(node)}`}
            node={node}
            labelsOf={labelsOf}
            onRemove={() => onRemove(index)}
          />
        ),
      )}
    </div>
  );
}
