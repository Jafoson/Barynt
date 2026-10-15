"use client";

import { Icon } from "@iconify/react";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import type { ViewGroupsPatch } from "@/features/issues/actions";
import { NewViewButton } from "@/features/views/components/NewViewButton/NewViewButton";
import {
  type ActiveViewInfo,
  ViewSaveBar,
} from "@/features/views/components/ViewSaveBar/ViewSaveBar";
import {
  type ViewTab,
  ViewTabs,
} from "@/features/views/components/ViewTabs/ViewTabs";
import type { ViewLayout } from "@/features/views/schema";
import {
  displayFromParams,
  pickViewState,
  sameViewState,
} from "@/features/views/url";
import type {
  IssueType,
  Label,
  Priority,
  Project,
  Status,
  User,
} from "@/types";
import { AreaTabs } from "./components/AreaTabs";
import { FilterEditor } from "./components/FilterEditor";
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
  /** Sub-issues as cards of their own — board only. */
  showSubIssues: boolean;
  /** Own order of the groups (BARY-165). */
  groupOrder: string[];
  /** This person's hidden board-card/list-row fields for this view (BARY-33). */
  hiddenCardFields: string[];
  onDisplayChange: (
    hidden: string[],
  ) => Promise<{ ok: true } | { error: string }>;
  onGroupsChange: (
    patch: ViewGroupsPatch,
  ) => Promise<{ ok: true } | { error: string }>;
  /** Saved views of the project (BARY-164) — absent outside a project. */
  views?: TopbarViews;
  /** `dashboard`: only the tab row, on the project dashboard (BARY-177). */
  mode?: "issues" | "dashboard";
}

/** What the topbar needs for a project's saved views. */
export interface TopbarViews {
  projectId: string;
  projectSlug: string;
  /** `view.share` in the project. */
  canShare: boolean;
  tabs: ViewTab[];
  /** The open view on its own page; `null` on the plain board/list. */
  active:
    | (ActiveViewInfo & {
        name: string;
        icon: string | null;
        color: string | null;
        layout: ViewLayout;
        /** Its stored state as a query string (`viewParams`). */
        canonical: string;
      })
    | null;
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
  showSubIssues,
  groupOrder,
  hiddenCardFields,
  onDisplayChange,
  onGroupsChange,
  views,
  mode = "issues",
}: TopbarClientProps) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const activeView = views?.active ?? null;
  const {
    isPending,
    area,
    showFilters,
    project,
    filters,
    negated,
    tree,
    extras,
    filterCount,
    searchValue,
    sortKey,
    groupKey,
    view,
    toggleFilter,
    setNegated,
    clearFilter,
    removeExtra,
    setFilter,
    clearAll,
    search,
    setSort,
    setGroup,
    setView,
    setViewDisplay,
  } = useTopbar({
    workspaceId,
    projects,
    priorities,
    members,
    labels,
    viewMode: activeView !== null,
  });

  // The advanced editor's popup — opened from its button or a rule chip.
  const [editorOpen, setEditorOpen] = useState(false);

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
  // The open saved view is marked by its tab next to the title (BARY-177);
  // the title itself says board or list.
  const title =
    area === "my"
      ? t("nav.myIssues")
      : view === "list"
        ? t("nav.issues")
        : t("nav.board");

  // "Unsaved": the address no longer shows the view's stored state.
  const dirty =
    activeView !== null &&
    !sameViewState(searchParams, new URLSearchParams(activeView.canonical));
  // What "New view"/"Save" take over: the view state of the address, with the
  // layout spelled out (the plain board/list keep theirs in the path).
  const currentParams = { ...pickViewState(searchParams), layout: view };

  // A saved view's display settings come from — and go to — its address
  // (BARY-165); the plain board and list keep the person's own preference.
  const urlDisplay = activeView ? displayFromParams(searchParams) : null;
  const display = urlDisplay ?? {
    hiddenFields: hiddenCardFields,
    hiddenGroups,
    groupOrder,
    hideEmptyGroups,
    showSubIssues,
  };
  const saveDisplay = urlDisplay
    ? async (hidden: string[]) => {
        setViewDisplay({ hiddenFields: hidden });
        return { ok: true } as const;
      }
    : onDisplayChange;
  const saveGroups = urlDisplay
    ? async (patch: ViewGroupsPatch) => {
        setViewDisplay(patch);
        return { ok: true } as const;
      }
    : onGroupsChange;

  return (
    <header
      className={`${styles.header}${isPending ? ` ${styles.pending}` : ""}`}
    >
      {views && project ? (
        // A project: Board · List · Dashboard | views | New view … search
        // (BARY-177). The tabs replace the title and the board/list switch.
        <div className={styles.tabRow}>
          <h1 className={styles.srOnly}>{title}</h1>
          <AreaTabs
            workspaceId={workspaceId}
            projectSlug={views.projectSlug}
            active={
              mode === "dashboard" ? "dashboard" : activeView ? null : view
            }
            count={count}
            carry={
              mode === "dashboard" || activeView ? "" : searchParams.toString()
            }
          />
          {views.tabs.length > 0 && (
            <>
              <span className={styles.divider} />
              <ViewTabs
                workspaceId={workspaceId}
                projectId={views.projectId}
                projectSlug={views.projectSlug}
                canShare={views.canShare}
                views={views.tabs}
                activeId={activeView?.id ?? null}
                dirty={dirty}
              />
            </>
          )}
          {/* With "New view" — both not on a tablet or phone, where the
              floating plus offers it (CSS). */}
          <span className={`${styles.divider} ${styles.desktopOnly}`} />
          <NewViewButton
            workspaceId={workspaceId}
            projectId={views.projectId}
            projectSlug={views.projectSlug}
            canShare={views.canShare}
            layout={view}
            currentParams={currentParams}
            filterCount={filterCount}
          />
          {mode !== "dashboard" && (
            <div className={styles.trailing}>
              {/* Not on a tablet or phone (CSS). */}
              <div className={styles.searchSlot}>
                <IssueSearch initialValue={searchValue} onChange={search} />
              </div>
            </div>
          )}
        </div>
      ) : (
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
      )}

      {mode !== "dashboard" && (
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
              issueTypes={issueTypes}
              negated={negated}
              onNegate={setNegated}
              extras={extras}
              onRemoveExtra={removeExtra}
              onOpenEditor={() => setEditorOpen(true)}
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
              issueTypes={issueTypes}
              onToggle={toggleFilter}
              onClearAll={clearAll}
            />
          </div>

          {/* The whole filter as conditions, "is not", OR groups and
              the other fields (BARY-166) — a sheet on a phone.
              Right next to the filters. */}
          <InlinePicker
            width={640}
            maxWidth={720}
            align="start"
            title={t("filters.advancedTitle")}
            open={editorOpen}
            onOpenChange={setEditorOpen}
            trigger={
              <Button
                variant="ghost"
                className={styles.advanced}
                icon={<Icon icon="lucide:list-filter" width={14} />}
              >
                {t("filters.advanced")}
                {filterCount > 0 && ` · ${filterCount}`}
              </Button>
            }
          >
            {(close) => (
              <FilterEditor
                filter={tree}
                onChange={setFilter}
                lookups={{
                  statuses,
                  priorities,
                  issueTypes,
                  members,
                  labels,
                  projects,
                }}
                area={area}
                onDone={close}
              />
            )}
          </InlinePicker>

          <div className={styles.trailing}>
            {views && (
              <ViewSaveBar
                workspaceId={workspaceId}
                projectId={views.projectId}
                projectSlug={views.projectSlug}
                canShare={views.canShare}
                activeView={activeView}
                dirty={dirty}
                layout={view}
                currentParams={currentParams}
              />
            )}
            <ViewSettings
              projectHiddenFields={projectHiddenFields}
              sortKey={sortKey}
              onSortChange={setSort}
              groupKey={groupKey}
              onGroupChange={setGroup}
              hiddenFields={display.hiddenFields}
              onDisplayChange={saveDisplay}
              groupLookups={{ statuses, priorities, issueTypes, members }}
              view={view}
              hiddenGroups={display.hiddenGroups}
              hideEmptyGroups={display.hideEmptyGroups}
              showSubIssues={display.showSubIssues}
              groupOrder={display.groupOrder}
              onGroupsChange={saveGroups}
            />
          </div>
        </div>
      )}
    </header>
  );
}
