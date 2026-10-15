"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { type IssueFilter, isGroup } from "@/features/issues/filter";
import {
  filterToParams,
  idToSlug,
  isFilterParam,
  mapFilterValues,
  parseFilterParams,
  type SlugLookups,
  slugToId,
} from "@/features/issues/filter-url";
import { type GroupKey, groupKeyFromParam } from "@/features/issues/group";
import { type SortKey, sortKeyFromParam } from "@/features/issues/sort";
import {
  layoutFromParam,
  VIEW_DEFAULT_GROUP,
  VIEW_DEFAULT_SORT,
} from "@/features/views/url";
import { usePathname, useRouter } from "@/i18n/navigation";
import { usePreferences } from "@/lib/preferences/PreferencesContext";
import type { Label, Priority, Project, User } from "@/types";
import {
  type ChipField,
  chipState,
  conditionCount,
  dueBuckets,
  extraNodes,
  onlySearch,
  withChip,
  withDueBuckets,
  withoutNode,
} from "./filterModel";

/** A field with a chip of its own (`filterModel.ts`), plus the due-date
 *  buckets. */
export type FilterKey = ChipField | "dueDate";

export type View = "board" | "list";

/** What each chip shows of a filter tree. */
export function filterStateOf(tree: IssueFilter): FilterState {
  const values = (field: ChipField) => chipState(tree, field).values;
  return {
    status: values("status") as string[],
    priority: values("priority") as number[],
    type: values("type") as string[],
    assignee: values("assignee") as string[],
    label: values("label") as string[],
    project: values("project") as string[],
    storyPoints: values("storyPoints") as number[],
    dueDate: dueBuckets(tree),
  };
}

/**
 * What the view shows issues by: a single project, or the current user's
 * own assignments across all of them. Board and list are the same either
 * way — only the title, the address behind the switcher, and which filters
 * even make sense differ.
 */
export type IssueArea = "project" | "my";

export interface FilterState {
  status: string[];
  priority: number[];
  /** Issue type ids (BARY-166). */
  type: string[];
  assignee: string[];
  label: string[];
  /** Only in the "My issues" area — within a project there's nothing to narrow down. */
  project: string[];
  /** Exact story point values — no catalog to translate through (BARY-4),
   *  unlike `priority`/`label`/`assignee`, so the URL carries the numbers
   *  themselves. */
  storyPoints: number[];
  /** Due-date buckets: `overdue`, `today`, `week`, `none` (BARY-4). */
  dueDate: string[];
}

/** Keystrokes are cheap, navigations are not — wait for a pause before pushing. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * Owns the topbar's entire URL state: which filters are active, how the list is
 * sorted and which view is shown. The URL is the single source of truth — every
 * setter writes to it and the derived values are read straight back out.
 */
export interface UseTopbarArgs {
  workspaceId: string;
  projects: Project[];
  priorities: Priority[];
  members: User[];
  labels: Label[];
  /**
   * On a saved view's page (BARY-164): the layout comes from `?layout=` and
   * the board/list switch writes it there instead of changing the path, and a
   * missing `?group=`/`?sort=` means the view's defaults, not the person's.
   */
  viewMode?: boolean;
}

export function useTopbar({
  workspaceId,
  projects,
  priorities,
  members,
  labels,
  viewMode = false,
}: UseTopbarArgs) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  // A second transition for the search box: same concurrency, but its pending
  // state is dropped — otherwise the bar would dim on every keystroke.
  const [, startQuietTransition] = useTransition();
  const base = `/${workspaceId}`;

  // The area lives in the path — `/<ws>/project/<slug>[/list]` or
  // `/<ws>/my[/list]`. Everywhere else there's no issue view and therefore
  // no topbar either.
  const area: IssueArea | null = pathname.startsWith(`${base}/project/`)
    ? "project"
    : pathname === `${base}/my` || pathname.startsWith(`${base}/my/`)
      ? "my"
      : null;
  const showFilters = area !== null;
  const view: View = viewMode
    ? layoutFromParam(searchParams.get("layout"))
    : pathname.endsWith("/list")
      ? "list"
      : "board";

  const slug =
    pathname.match(new RegExp(`^${base}/project/([^/]+)`))?.[1] ??
    projects[0]?.slug ??
    "";
  const project =
    area === "my"
      ? null
      : (projects.find((p) => p.slug === slug) ?? projects[0] ?? null);

  // The URL holds the filter tree with slugs (`filter-url.ts`); the UI works
  // in internal-id space — translate on read, and back on write.
  const slugLookups: SlugLookups = {
    priorities,
    members: members.flatMap((m) =>
      m.handle ? [{ id: m.id, handle: m.handle }] : [],
    ),
    labels,
    projects,
  };
  const tree: IssueFilter = mapFilterValues(
    parseFilterParams(searchParams),
    slugToId(slugLookups),
  );

  const chip = (field: ChipField) => chipState(tree, field);
  const filters = filterStateOf(tree);
  // "Is not" picked before any value: the tree has no rule to carry it
  // yet, so it waits here until the first value arrives.
  const [pendingNot, setPendingNot] = useState<
    Partial<Record<ChipField, boolean>>
  >({});
  const isNot = (field: ChipField) =>
    chip(field).values.length > 0
      ? chip(field).negated
      : (pendingNot[field] ?? false);
  /** Which chips exclude rather than include ("is not"). */
  const negated: Record<ChipField, boolean> = {
    status: isNot("status"),
    priority: isNot("priority"),
    type: isNot("type"),
    assignee: isNot("assignee"),
    label: isNot("label"),
    project: isNot("project"),
    storyPoints: isNot("storyPoints"),
  };
  /** Rules and OR groups the chips can't show — a rule chip each. */
  const extras = extraNodes(tree);

  // The typed text belongs to the search box alone (see IssueSearch): it renders
  // every keystroke locally, while the URL follows on a debounce. The box is
  // never re-seeded from `?q=` afterwards — a landing navigation always carries
  // an older value than what is on screen, and pushing that back into the input
  // would drop characters and cost the caret. The hook keeps only `typedQuery`,
  // so a navigation from any other control can take the pending text along.
  const urlQuery = searchParams.get("q") ?? "";
  const typedQuery = useRef(urlQuery);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  // Conditions only — the search box clears itself through its own button,
  // so it must not make the filter row's "clear" appear.
  const filterCount = conditionCount(tree);

  // Without `?sort=`/`?group=` the person's own defaults apply — the same
  // fallback the pages use, so the control shows what the view really does.
  // On a view's page the view's address is the whole truth instead.
  const preferences = usePreferences();
  const defaultSort = viewMode ? VIEW_DEFAULT_SORT : preferences.defaultSort;
  const defaultGrouping = viewMode
    ? VIEW_DEFAULT_GROUP
    : preferences.defaultGrouping;
  const sortKey: SortKey = sortKeyFromParam(
    searchParams.get("sort") ?? defaultSort,
  );

  const groupKey: GroupKey = groupKeyFromParam(
    searchParams.get("group") ?? defaultGrouping,
  );

  // Every URL write goes through here, so a navigation triggered by any other
  // control also flushes the search text still sitting in the debounce. `quiet`
  // keeps typing out of the pending state — a deliberate click may dim the bar
  // while it lands, a keystroke may not.
  function pushParams(updater: (p: URLSearchParams) => void, quiet = false) {
    clearTimeout(searchTimer.current);
    const p = new URLSearchParams(searchParams.toString());
    if (typedQuery.current) p.set("q", typedQuery.current);
    else p.delete("q");
    updater(p);
    const start = quiet ? startQuietTransition : startTransition;
    start(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  }

  /** Writes a whole filter tree into the URL — the editor's and every
   *  chip's way in. The search text stays the search box's. */
  function setFilter(next: IssueFilter) {
    pushParams((p) => {
      for (const key of [...p.keys()])
        if (key !== "q" && isFilterParam(key)) p.delete(key);
      const own = {
        op: "and" as const,
        rules: next.rules.filter((n) => isGroup(n) || n.field !== "text"),
      };
      for (const [key, value] of filterToParams(
        mapFilterValues(own, idToSlug(slugLookups)),
      ))
        p.append(key, value);
    });
  }

  function toggleFilter(key: FilterKey, value: string | number) {
    if (key === "dueDate") {
      const cur = filters.dueDate;
      const bucket = String(value);
      setFilter(
        withDueBuckets(
          tree,
          cur.includes(bucket)
            ? cur.filter((b) => b !== bucket)
            : [...cur, bucket],
        ),
      );
      return;
    }
    const cur = chip(key).values;
    const next = cur.includes(value)
      ? cur.filter((v) => v !== value)
      : [...cur, value];
    setFilter(withChip(tree, key, next, negated[key]));
  }

  /** "is" ↔ "is not" for a chip (BARY-166). */
  function setNegated(key: ChipField, value: boolean) {
    setPendingNot((cur) => ({ ...cur, [key]: value }));
    if (chip(key).values.length > 0)
      setFilter(withChip(tree, key, chip(key).values, value));
  }

  function clearFilter(key: FilterKey) {
    setFilter(
      key === "dueDate"
        ? withDueBuckets(tree, [])
        : withChip(tree, key, [], false),
    );
  }

  /** Removes one rule chip (`extras`). */
  function removeExtra(index: number) {
    setFilter(withoutNode(tree, index));
  }

  // Called on every keystroke — writes a ref and re-arms the timer, nothing that
  // would render anything outside the search box.
  function search(value: string) {
    typedQuery.current = value;
    clearTimeout(searchTimer.current);
    // `pushParams` picks the text up from the ref — nothing else to change here.
    searchTimer.current = setTimeout(
      () => pushParams(() => {}, true),
      SEARCH_DEBOUNCE_MS,
    );
  }

  // Clears exactly what the filter row shows — the search box has its own button
  // and keeps its text, the sort keeps its choice.
  function clearAll() {
    setFilter(onlySearch(tree));
  }

  function setGroup(key: GroupKey) {
    pushParams((p) =>
      key === "status" ? p.delete("group") : p.set("group", key),
    );
  }

  function setSort(key: SortKey) {
    pushParams((p) => p.set("sort", key));
  }

  // The view lives in the path, not the query — carry the filters across.
  // A saved view keeps its path and switches its layout in the query.
  function setView(next: View) {
    if (viewMode) {
      pushParams((p) => p.set("layout", next));
      return;
    }
    clearTimeout(searchTimer.current);
    const p = new URLSearchParams(searchParams.toString());
    if (typedQuery.current) p.set("q", typedQuery.current);
    else p.delete("q");
    const qs = p.toString();
    const suffix = qs ? `?${qs}` : "";
    // The switcher stays within its own area: a project's board leads to
    // that project's list, "my issues" leads to my own list.
    const areaBase = area === "my" ? `${base}/my` : `${base}/project/${slug}`;
    startTransition(() =>
      router.push(
        next === "list" ? `${areaBase}/list${suffix}` : `${areaBase}${suffix}`,
      ),
    );
  }

  /**
   * A saved view's display settings live in its address (BARY-165): the
   * panel writes them there, so they show as unsaved like the filters.
   */
  function setViewDisplay(patch: {
    hiddenFields?: string[];
    hiddenGroups?: string[];
    groupOrder?: string[];
    hideEmptyGroups?: boolean;
    showSubIssues?: boolean;
  }) {
    const setList = (p: URLSearchParams, key: string, value: string[]) =>
      value.length ? p.set(key, value.join(",")) : p.delete(key);
    pushParams((p) => {
      if (patch.hiddenFields) setList(p, "fields", patch.hiddenFields);
      if (patch.hiddenGroups) setList(p, "hide", patch.hiddenGroups);
      if (patch.groupOrder) setList(p, "order", patch.groupOrder);
      if (patch.hideEmptyGroups !== undefined)
        patch.hideEmptyGroups ? p.set("empty", "1") : p.delete("empty");
      if (patch.showSubIssues !== undefined)
        patch.showSubIssues ? p.set("sub", "1") : p.delete("sub");
    });
  }

  return {
    isPending,
    area,
    showFilters,
    project,
    filters,
    negated,
    tree,
    extras,
    filterCount,
    searchValue: urlQuery,
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
  };
}
