"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import type { ViewGroupsPatch } from "@/features/issues/actions";
import type {
  IssueType,
  Label,
  Priority,
  Project,
  Status,
  User,
} from "@/types";
import { FilterPopup } from "./components/FilterPopup";
import { IssueSearch } from "./components/IssueSearch";
import { TopbarFilters } from "./components/TopbarFilters";
import { ViewSettings } from "./components/ViewSettings";
import { ViewSwitch } from "./components/ViewSwitch";
import styles from "./topbar.module.scss";
import { useTopbar } from "./useTopbar";

interface TopbarClientProps {
  /** Issues in the current view — already narrowed by the active filters. */
  count: number;
  workspaceId: string;
  projects: Project[];
  statuses: Status[];
  priorities: Priority[];
  members: User[];
  labels: Label[];
  issueTypes: IssueType[];
  /** Groups this person hid in this view, as `hidden-groups.ts` entries (BARY-47). */
  hiddenGroups: string[];
  hideEmptyGroups: boolean;
  /** This person's hidden board-card/list-row fields for this view (BARY-33). */
  hiddenCardFields: string[];
  onDisplayChange: (
    hidden: string[],
  ) => Promise<{ ok: true } | { error: string }>;
  onGroupsChange: (
    patch: ViewGroupsPatch,
  ) => Promise<{ ok: true } | { error: string }>;
}

export function TopbarClient({
  count,
  workspaceId,
  projects,
  statuses,
  priorities,
  members,
  labels,
  issueTypes,
  hiddenGroups,
  hideEmptyGroups,
  hiddenCardFields,
  onDisplayChange,
  onGroupsChange,
}: TopbarClientProps) {
  const t = useTranslations();
  const {
    isPending,
    area,
    showFilters,
    project,
    filters,
    filterCount,
    searchValue,
    sortKey,
    groupKey,
    view,
    toggleFilter,
    clearFilter,
    clearAll,
    search,
    setSort,
    setGroup,
    setView,
  } = useTopbar({ workspaceId, projects, priorities, members, labels });

  if (!showFilters || !area) return null;

  // Inside a project: that project's hidden fields. Across projects ("my
  // issues"): only what every project hides — otherwise a sort key would
  // vanish although some rows still show that field.
  const projectHiddenFields = project
    ? (project.hiddenDetailFields ?? [])
    : projects.length === 0
      ? []
      : (projects[0].hiddenDetailFields ?? []).filter((key) =>
          projects.every((p) => (p.hiddenDetailFields ?? []).includes(key)),
        );

  // Inside a project, the title says which view you're looking at — the
  // project itself already appears in the sidebar and the tab. For "my
  // issues" it says whose issues these are: that's the actual information
  // here, with the view shown as a switcher next to it.
  const title =
    area === "my"
      ? t("nav.myIssues")
      : view === "list"
        ? t("nav.issues")
        : t("nav.board");

  return (
    <header
      className={`${styles.header}${isPending ? ` ${styles.pending}` : ""}`}
    >
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{title}</h1>
        <Badge className={styles.count}>{count}</Badge>

        <div className={styles.trailing}>
          {/* Not on a tablet or phone (CSS). */}
          <div className={styles.searchSlot}>
            <IssueSearch initialValue={searchValue} onChange={search} />
          </div>
          {/* Not on a phone (CSS). */}
          <div className={styles.viewSwitch}>
            <ViewSwitch value={view} onChange={setView} />
          </div>
        </div>
      </div>

      <div className={styles.filterRow}>
        {/* Desktop: one chip per filter. Tablet and phone: the same filters
            in one popup (below). CSS shows one of the two. */}
        <div className={styles.filterChips}>
          <TopbarFilters
            filters={filters}
            filterCount={filterCount}
            area={area}
            projectId={project?.id ?? ""}
            projectName={project?.name ?? ""}
            hiddenDetailFields={project?.hiddenDetailFields ?? []}
            workspaceId={workspaceId}
            statuses={statuses}
            priorities={priorities}
            members={members}
            labels={labels}
            projects={projects}
            onToggle={toggleFilter}
            onClear={clearFilter}
            onClearAll={clearAll}
          />
        </div>

        <div className={styles.filterPopup}>
          <FilterPopup
            filters={filters}
            filterCount={filterCount}
            area={area}
            hiddenDetailFields={project?.hiddenDetailFields ?? []}
            statuses={statuses}
            priorities={priorities}
            members={members}
            labels={labels}
            projects={projects}
            onToggle={toggleFilter}
            onClearAll={clearAll}
          />
        </div>

        <div className={styles.trailing}>
          <ViewSettings
            projectHiddenFields={projectHiddenFields}
            sortKey={sortKey}
            onSortChange={setSort}
            groupKey={groupKey}
            onGroupChange={setGroup}
            hiddenFields={hiddenCardFields}
            onDisplayChange={onDisplayChange}
            groupLookups={{ statuses, priorities, issueTypes, members }}
            view={view}
            hiddenGroups={hiddenGroups}
            hideEmptyGroups={hideEmptyGroups}
            onGroupsChange={onGroupsChange}
          />
        </div>
      </div>
    </header>
  );
}
