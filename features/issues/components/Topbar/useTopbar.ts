"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { type GroupKey, groupKeyFromParam } from "@/features/issues/group";
import { type SortKey, sortKeyFromParam } from "@/features/issues/sort";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  assigneeIdToSlug,
  assigneeSlugToId,
  labelIdToSlug,
  labelSlugToId,
  priorityIdToSlug,
  prioritySlugToId,
  projectIdToSlug,
  projectSlugToId,
  statusIdToSlug,
  statusSlugToId,
} from "@/lib/filter-slugs";
import type { Label, Priority, Project, User } from "@/types";

export type FilterKey =
  | "status"
  | "priority"
  | "assignee"
  | "label"
  | "project"
  | "storyPoints"
  | "dueDate";

const FILTER_KEYS: FilterKey[] = [
  "status",
  "priority",
  "assignee",
  "label",
  "project",
  "storyPoints",
  "dueDate",
];

export type View = "board" | "list";

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
}

export function useTopbar({
  workspaceId,
  projects,
  priorities,
  members,
  labels,
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
  const view: View = pathname.endsWith("/list") ? "list" : "board";

  const slug =
    pathname.match(new RegExp(`^${base}/project/([^/]+)`))?.[1] ??
    projects[0]?.slug ??
    "";
  const project =
    area === "my"
      ? null
      : (projects.find((p) => p.slug === slug) ?? projects[0] ?? null);

  // URL holds slugs; the UI works in internal-id space — translate on read.
  const parse = (key: FilterKey) =>
    searchParams.get(key)?.split(",").filter(Boolean) ?? [];

  const filters: FilterState = {
    status: parse("status").map(statusSlugToId),
    priority: parse("priority")
      .map((s) => prioritySlugToId(priorities, s))
      .filter((n): n is number => n !== undefined),
    assignee: parse("assignee")
      .map((s) => assigneeSlugToId(members, s))
      .filter((id): id is string => Boolean(id)),
    label: parse("label")
      .map((s) => labelSlugToId(labels, s))
      .filter((id): id is string => Boolean(id)),
    project: parse("project")
      .map((s) => projectSlugToId(projects, s))
      .filter((id): id is string => Boolean(id)),
    storyPoints: parse("storyPoints")
      .map(Number)
      .filter((n) => Number.isFinite(n)),
    dueDate: parse("dueDate"),
  };

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

  // Chips only — the search box clears itself through its own button, so it must
  // not make the filter row's "clear" appear.
  const filterCount =
    filters.status.length +
    filters.priority.length +
    filters.assignee.length +
    filters.label.length +
    filters.project.length +
    filters.storyPoints.length +
    filters.dueDate.length;

  const sortKey: SortKey = sortKeyFromParam(
    searchParams.get("sort") ?? undefined,
  );

  const groupKey: GroupKey = groupKeyFromParam(
    searchParams.get("group") ?? undefined,
  );

  // internal id (as passed by the filter UI) → URL slug
  function toSlug(key: FilterKey, value: string | number): string {
    switch (key) {
      case "status":
        return statusIdToSlug(String(value));
      case "priority":
        return priorityIdToSlug(priorities, value as number);
      case "assignee":
        return assigneeIdToSlug(members, String(value));
      case "label":
        return labelIdToSlug(labels, String(value));
      case "project":
        return projectIdToSlug(projects, String(value));
      default:
        return String(value);
    }
  }

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

  function toggleFilter(key: FilterKey, value: string | number) {
    pushParams((p) => {
      const cur = p.get(key)?.split(",").filter(Boolean) ?? [];
      const slug = toSlug(key, value);
      const next = cur.includes(slug)
        ? cur.filter((v) => v !== slug)
        : [...cur, slug];
      if (next.length) p.set(key, next.join(","));
      else p.delete(key);
    });
  }

  function clearFilter(key: FilterKey) {
    pushParams((p) => p.delete(key));
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
    pushParams((p) => {
      for (const key of FILTER_KEYS) p.delete(key);
    });
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
  function setView(next: View) {
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

  return {
    isPending,
    area,
    showFilters,
    project,
    filters,
    filterCount,
    searchValue: urlQuery,
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
  };
}
