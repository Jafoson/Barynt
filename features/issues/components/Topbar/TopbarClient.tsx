"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import type { ViewGroupsPatch } from "@/features/issues/actions";
import { setViewUserState } from "@/features/views/actions";
import { NewViewButton } from "@/features/views/components/NewViewButton/NewViewButton";
import {
  type ActiveViewInfo,
  ViewSaveBar,
} from "@/features/views/components/ViewSaveBar/ViewSaveBar";
import {
  type ViewTab,
  ViewTabs,
} from "@/features/views/components/ViewTabs/ViewTabs";
import {
  SYSTEM_VIEW_BASE,
  type SystemViewKey,
  type ViewLayout,
} from "@/features/views/schema";
import {
  displayFromParams,
  displayParams,
  pickViewState,
  sameViewState,
  VIEW_DEFAULT_GROUP,
  VIEW_DEFAULT_SORT,
} from "@/features/views/url";
import { usePreferences } from "@/lib/preferences/PreferencesContext";
import type {
  IssueType,
  Label,
  Priority,
  Project,
  Status,
  User,
} from "@/types";
import { ActiveFilters } from "./components/ActiveFilters";
import { AreaTabs } from "./components/AreaTabs";
import { FilterPopup } from "./components/FilterPopup";
import { IssueSearch } from "./components/IssueSearch";
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
  /** Swimlanes without an issue hide themselves (BARY-173). */
  hideEmptyLanes: boolean;
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
  /** `null` for a cross-project view (V8). */
  projectId: string | null;
  projectSlug: string | null;
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
        /** Set on a system view (V8) — its fixed condition. */
        systemKey: SystemViewKey | null;
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
  hideEmptyLanes,
  hiddenCardFields,
  onDisplayChange,
  onGroupsChange,
  views,
  mode = "issues",
}: TopbarClientProps) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const preferences = usePreferences();
  const activeView = views?.active ?? null;
  const {
    isPending,
    area,
    showFilters,
    project,
    filters,
    negated,
    tree,
    filterCount,
    searchValue,
    sortKey,
    groupKey,
    laneKey,
    view,
    toggleFilter,
    setNegated,
    removeExtra,
    setFilter,
    clearAll,
    search,
    setSort,
    setGroup,
    setLanes,
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

  // A saved view's display settings come from — and go to — its address
  // (BARY-165); the plain board and list keep the person's own preference.
  const urlDisplay = activeView ? displayFromParams(searchParams) : null;
  const display = urlDisplay ?? {
    hiddenFields: hiddenCardFields,
    hiddenGroups,
    groupOrder,
    hideEmptyGroups,
    showSubIssues,
    hideEmptyLanes,
  };
  // The plain board and list keep their grouping, order and display in the
  // person's own settings, not the address. What sets them apart from a
  // fresh board goes along into "Save as new view" — and like filters, it
  // makes the button say so (BARY-173): another grouping, order or lanes,
  // moved or hidden columns, any display switch.
  const plainState: Record<string, string> = activeView
    ? {}
    : {
        ...(groupKey !== VIEW_DEFAULT_GROUP && { group: groupKey }),
        ...(sortKey !== VIEW_DEFAULT_SORT && { sort: sortKey }),
        ...Object.fromEntries(displayParams(display)),
      };
  const plainChanged =
    !activeView &&
    (laneKey !== null ||
      groupKey !== preferences.defaultGrouping ||
      sortKey !== preferences.defaultSort ||
      displayParams(display).size > 0);
  // What "New view"/"Save" take over: the view state of the address, with the
  // layout spelled out (the plain board/list keep theirs in the path).
  // A system view's fixed condition isn't in the address (V8); "save as new
  // view" takes it along as an ordinary filter.
  const currentParams = {
    ...(views?.active?.systemKey
      ? SYSTEM_VIEW_BASE[views.active.systemKey]
      : {}),
    ...plainState,
    ...pickViewState(searchParams),
    layout: view,
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

  // Board or list at the top of "Display" — everywhere, the same place in
  // every view (V8); on the plain board and list it's the same as their
  // tabs. A system view remembers the choice for this person (stored first,
  // so the page doesn't flash "unsaved"); any other view carries it in its
  // address like the rest.
  const changeLayout = (next: "board" | "list") => {
    const active = activeView ? views?.active : null;
    if (active?.systemKey)
      void setViewUserState(active.id, { layout: next }).then(() =>
        setView(next),
      );
    else setView(next);
  };

  return (
    <header
      className={`${styles.header}${isPending ? ` ${styles.pending}` : ""}`}
    >
      {views ? (
        // A project or the workspace (V8): Board · List · Dashboard | views
        // | New view … search (BARY-177). The tabs replace the title and the
        // board/list switch.
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
          <span
            className={`${styles.divider} ${styles.beforeIcon} ${styles.desktopOnly}`}
          />
          <NewViewButton
            workspaceId={workspaceId}
            projectId={views.projectId}
            projectSlug={views.projectSlug}
            canShare={views.canShare}
            layout={view}
            currentParams={currentParams}
            changed={filterCount > 0 || plainChanged}
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
          {/* One "Filter" button with everything in it (BARY-166) — the
              same on every width; a sheet on a phone. */}
          <div>
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
              tree={tree}
              onFilterChange={setFilter}
              negated={negated}
              onNegate={setNegated}
            />
          </div>

          {/* The active filters in a row below, scrolling sideways. */}
          <ActiveFilters
            tree={tree}
            lookups={{
              statuses,
              priorities,
              issueTypes,
              members,
              labels,
              projects,
            }}
            onRemove={removeExtra}
          />

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
              laneKey={laneKey}
              onLaneChange={setLanes}
              hideEmptyLanes={display.hideEmptyLanes}
              hiddenFields={display.hiddenFields}
              onDisplayChange={saveDisplay}
              groupLookups={{
                statuses,
                priorities,
                issueTypes,
                members,
                // Across projects, grouping by project exists (V8).
                ...(area === "my" ? { projects } : {}),
              }}
              view={view}
              hiddenGroups={display.hiddenGroups}
              hideEmptyGroups={display.hideEmptyGroups}
              showSubIssues={display.showSubIssues}
              groupOrder={display.groupOrder}
              onGroupsChange={saveGroups}
              onLayoutChange={changeLayout}
            />
          </div>
        </div>
      )}
    </header>
  );
}
