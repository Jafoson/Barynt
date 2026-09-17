"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import { visibleDetailFields } from "@/features/projects/detail-fields";
import type { Label, Priority, Project, Status, User } from "@/types";
import styles from "../topbar.module.scss";
import type { FilterKey, FilterState, IssueArea } from "../useTopbar";
import { AssigneeFilter } from "./AssigneeFilter";
import { DueDateFilter } from "./DueDateFilter";
import { LabelFilter } from "./LabelFilter";
import { PriorityFilter } from "./PriorityFilter";
import { ProjectFilter } from "./ProjectFilter";
import { StatusFilter } from "./StatusFilter";
import { StoryPointsFilter } from "./StoryPointsFilter";

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
  onToggle,
  onClear,
  onClearAll,
}: TopbarFiltersProps) {
  const t = useTranslations();
  const visibleFields = visibleDetailFields(hiddenDetailFields);

  return (
    <>
      <StatusFilter
        value={filters.status}
        statuses={statuses}
        onToggle={(id) => onToggle("status", id)}
        onClear={() => onClear("status")}
      />
      {visibleFields.has("priority") && (
        <PriorityFilter
          value={filters.priority}
          priorities={priorities}
          onToggle={(id) => onToggle("priority", id)}
          onClear={() => onClear("priority")}
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
        />
      ) : (
        <ProjectFilter
          value={filters.project}
          projects={projects}
          onToggle={(id) => onToggle("project", id)}
          onClear={() => onClear("project")}
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
        />
      )}
      {visibleFields.has("storyPoints") && (
        <StoryPointsFilter
          value={filters.storyPoints}
          onToggle={(points) => onToggle("storyPoints", points)}
          onClear={() => onClear("storyPoints")}
        />
      )}
      {visibleFields.has("dueDate") && (
        <DueDateFilter
          value={filters.dueDate}
          onToggle={(bucket) => onToggle("dueDate", bucket)}
          onClear={() => onClear("dueDate")}
        />
      )}

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
