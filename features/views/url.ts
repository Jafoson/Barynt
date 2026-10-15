import { type IssueFilter, isGroup } from "@/features/issues/filter";
import type { SavedView, ViewLayout } from "./schema";

/**
 * A saved view and the address it opens at (BARY-164).
 *
 * The board and list read their whole state from the URL — filters, grouping,
 * order. A view therefore opens at an address that spells out its stored
 * state (`viewParams`); every control keeps working on the URL as before,
 * and "unsaved" simply means the URL no longer matches that address
 * (`sameViewState`). Discarding is navigating back to it.
 *
 * The search box is not part of a view: typing into it neither marks the view
 * unsaved nor gets stored.
 */

/** The parameters that make up a view's state, in a fixed order. */
export const VIEW_STATE_KEYS = [
  "status",
  "priority",
  "assignee",
  "label",
  "storyPoints",
  "dueDate",
  "group",
  "sort",
  "layout",
] as const;

/** Missing `group`/`sort` mean these — on a view page they don't fall back
 *  to the person's own defaults, the view's address is the whole truth. */
export const VIEW_DEFAULT_GROUP = "status";
export const VIEW_DEFAULT_SORT = "manual";

/** What it takes to turn stored ids back into the URL's slugs. */
export interface SlugLookups {
  priorities: { id: number; key: string }[];
  members: { id: string; handle: string }[];
  labels: { id: string; slug: string }[];
}

const DUE_BUCKET_OF: Record<string, string> = {
  overdue: "overdue",
  today: "today",
  next_7_days: "week",
};

/**
 * The URL filters a tree stands for. Views saved from the flat filter row only
 * ever hold "any of" rules and due-date buckets, which is all this reads; a
 * rule the row can't show (the tree editor arrives in V6) is left out here
 * but stays in the stored view.
 */
function filterToParams(
  filter: IssueFilter,
  lookups: SlugLookups,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (key: string, values: string[]) => {
    if (values.length) out[key] = [...(out[key] ?? []), ...values];
  };
  const slugOf = <T extends { id: string | number }>(
    rows: T[],
    id: string | number,
    pick: (row: T) => string,
  ) => {
    const row = rows.find((r) => r.id === id);
    return row ? [pick(row)] : [];
  };

  const dueRules = [];
  for (const node of filter.rules) {
    if (isGroup(node)) {
      if (node.rules.every((r) => r.field === "dueDate"))
        dueRules.push(...node.rules);
      continue;
    }
    const values = Array.isArray(node.value) ? node.value : [];
    if (node.field === "dueDate") {
      dueRules.push(node);
      continue;
    }
    if (node.is !== "any") continue;
    switch (node.field) {
      case "status":
        add("status", values.map(String));
        break;
      case "priority":
        add(
          "priority",
          values.flatMap((v) => slugOf(lookups.priorities, v, (p) => p.key)),
        );
        break;
      case "assignee":
        add(
          "assignee",
          values.flatMap((v) => slugOf(lookups.members, v, (m) => m.handle)),
        );
        break;
      case "label":
        add(
          "label",
          values.flatMap((v) => slugOf(lookups.labels, v, (l) => l.slug)),
        );
        break;
      case "storyPoints":
        add("storyPoints", values.map(String));
        break;
    }
  }

  add(
    "dueDate",
    dueRules.flatMap((r) => {
      if (r.is === "empty") return ["none"];
      if (r.is === "within" && typeof r.value === "string")
        return DUE_BUCKET_OF[r.value] ? [DUE_BUCKET_OF[r.value]] : [];
      return [];
    }),
  );
  return out;
}

/** The address parameters of a view's stored state. `layout` is always set —
 *  it's how a view page tells "opened bare" from "all filters cleared". */
export function viewParams(
  view: Pick<SavedView, "filter" | "groupBy" | "sortBy" | "layout">,
  lookups: SlugLookups,
): URLSearchParams {
  const params = new URLSearchParams();
  const filters = filterToParams(view.filter, lookups);
  for (const key of VIEW_STATE_KEYS) {
    if (filters[key]) params.set(key, filters[key].join(","));
  }
  if (view.groupBy && view.groupBy !== VIEW_DEFAULT_GROUP)
    params.set("group", view.groupBy);
  if (view.sortBy !== VIEW_DEFAULT_SORT) params.set("sort", view.sortBy);
  params.set("layout", view.layout);
  return params;
}

/** The layout an address asks for; anything else is the board. (Dashboard
 *  views come with V9 and get their own page.) */
export function layoutFromParam(
  value: string | null | undefined,
): Extract<ViewLayout, "board" | "list"> {
  return value === "list" ? "list" : "board";
}

type ParamSource = URLSearchParams | Record<string, string | undefined>;

const read = (source: ParamSource, key: string) =>
  source instanceof URLSearchParams ? source.get(key) : source[key];

/** One parameter in comparable form: order of values and defaults ironed out. */
function normalized(source: ParamSource, key: string): string {
  const raw = read(source, key) ?? "";
  if (key === "group") return raw || VIEW_DEFAULT_GROUP;
  if (key === "sort") return raw || VIEW_DEFAULT_SORT;
  if (key === "layout") return layoutFromParam(raw);
  return raw.split(",").filter(Boolean).sort().join(",");
}

/** Whether two addresses show the same view state — the "unsaved" check. */
export function sameViewState(a: ParamSource, b: ParamSource): boolean {
  return VIEW_STATE_KEYS.every(
    (key) => normalized(a, key) === normalized(b, key),
  );
}

/** Only the view-state parameters of an address — what gets saved. */
export function pickViewState(source: ParamSource): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of VIEW_STATE_KEYS) {
    const value = read(source, key);
    if (value) out[key] = value;
  }
  return out;
}

/** Path of a view inside its project. */
export function viewPath(
  workspaceId: string,
  projectSlug: string,
  viewSlug: string,
): string {
  return `/${workspaceId}/project/${projectSlug}/view/${viewSlug}`;
}
