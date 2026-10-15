"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import type { FilterGroup, FilterRule } from "@/features/issues/filter";
import { visibleDetailFields } from "@/features/projects/detail-fields";
import type {
  IssueType,
  Label,
  Priority,
  Project,
  Status,
  User,
} from "@/types";
import { useFilterLabels } from "../filterLabels";
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
  extras: { node: FilterRule | FilterGroup; index: number }[];
  onRemoveExtra: (index: number) => void;
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

      {/* What the chips can't show (BARY-166): "at least", dates, OR
          groups — one chip each; a click opens the editor. */}
      {extras.map(({ node, index }) => (
        <Chip
          key={`${index}:${labelsOf.node(node)}`}
          type="input"
          variant="text"
          className={styles.ruleChip}
          data-or={"op" in node || undefined}
          title={labelsOf.node(node)}
          onClick={onOpenEditor}
          onRemove={() => onRemoveExtra(index)}
          removeLabel={t("filters.removeRule", { rule: labelsOf.node(node) })}
        >
          {"op" in node
            ? node.rules.map((rule, i) => (
                <span key={`${i}:${labelsOf.rule(rule)}`}>
                  {i > 0 && (
                    <span className={styles.orPill}>{t("filters.or")}</span>
                  )}
                  {labelsOf.rule(rule)}
                </span>
              ))
            : labelsOf.rule(node)}
        </Chip>
      ))}

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
    </>
  );
}
