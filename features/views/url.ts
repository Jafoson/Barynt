import { isCardFieldKey } from "@/features/issues/card-fields";
import { type FilterNode, isGroup } from "@/features/issues/filter";
import {
  filterToParams,
  idToSlug,
  isFilterParam,
  mapFilterValues,
  parseFilterParams,
  type SlugLookups,
} from "@/features/issues/filter-url";
import { sanitizeGroupOrder } from "@/features/issues/group-order";
import { sanitizeHiddenGroups } from "@/features/issues/hidden-groups";
import { sanitizeListColumns } from "@/features/issues/list-columns";
import type { SavedView, ViewDisplay, ViewLayout } from "./schema";

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
 *
 * The display settings are part of it too (BARY-165): hidden and reordered
 * columns, hidden card fields, empty groups, sub-issues — as `hide`, `order`,
 * `fields`, `empty` and `sub`, so they're saved, discarded and shared exactly
 * like the filters. So are swimlanes (BARY-173): `lanes` (the second
 * grouping, stored as `subGroupBy`) and `emptylanes`.
 */

/**
 * The settings parameters of a view, besides its filter. The filter's own
 * parameters are open-ended since BARY-166 (`status.not`, `or`, …) and are
 * recognised by `isFilterParam` instead of listed here.
 */
export const VIEW_SETTING_KEYS = [
  "group",
  "sort",
  "layout",
  "hide",
  "order",
  "fields",
  "empty",
  "sub",
  "lanes",
  "emptylanes",
  // The list as a table (BARY-175): its columns, and the order turned round.
  "cols",
  "dir",
] as const;

/** Missing `group`/`sort` mean these — on a view page they don't fall back
 *  to the person's own defaults, the view's address is the whole truth. */
export const VIEW_DEFAULT_GROUP = "status";
export const VIEW_DEFAULT_SORT = "manual";

export type { SlugLookups } from "@/features/issues/filter-url";

/** The address parameters of a view's stored state. `layout` is always set —
 *  it's how a view page tells "opened bare" from "all filters cleared". */
export function viewParams(
  view: Pick<
    SavedView,
    "filter" | "groupBy" | "sortBy" | "layout" | "display"
  > & {
    systemKey?: SavedView["systemKey"];
    subGroupBy?: SavedView["subGroupBy"];
    sortDir?: SavedView["sortDir"];
  },
  lookups: SlugLookups,
): URLSearchParams {
  // A system view's own condition stays off the address (`SYSTEM_VIEW_BASE`).
  const params = new URLSearchParams(
    view.systemKey
      ? []
      : filterToParams(mapFilterValues(view.filter, idToSlug(lookups))),
  );
  if (view.groupBy && view.groupBy !== VIEW_DEFAULT_GROUP)
    params.set("group", view.groupBy);
  if (view.sortBy !== VIEW_DEFAULT_SORT) params.set("sort", view.sortBy);
  if (view.sortDir === "desc") params.set("dir", "desc");
  if (view.subGroupBy) params.set("lanes", view.subGroupBy);
  params.set("layout", view.layout);
  for (const [key, value] of displayParams(view.display))
    params.set(key, value);
  return params;
}

/** A view's display settings as address parameters — only what differs
 *  from a fresh board. */
export function displayParams(display: SavedView["display"]): URLSearchParams {
  const params = new URLSearchParams();
  if (display.hiddenGroups?.length)
    params.set("hide", display.hiddenGroups.join(","));
  if (display.groupOrder?.length)
    params.set("order", display.groupOrder.join(","));
  if (display.hiddenFields?.length)
    params.set("fields", display.hiddenFields.join(","));
  if (display.hideEmptyGroups) params.set("empty", "1");
  if (display.showSubIssues) params.set("sub", "1");
  if (display.hideEmptyLanes) params.set("emptylanes", "1");
  if (display.columns?.length) params.set("cols", display.columns.join(","));
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

const keysOf = (source: ParamSource) =>
  source instanceof URLSearchParams ? [...source.keys()] : Object.keys(source);

/** A view's filter parameter — everything the filter reads except the
 *  search, which isn't part of a view. */
const isViewFilterKey = (key: string) => key !== "q" && isFilterParam(key);

/** One settings parameter in comparable form: defaults ironed out. */
function normalized(source: ParamSource, key: string): string {
  const raw = read(source, key) ?? "";
  if (key === "group") return raw || VIEW_DEFAULT_GROUP;
  if (key === "sort") return raw || VIEW_DEFAULT_SORT;
  if (key === "layout") return layoutFromParam(raw);
  if (key === "empty" || key === "sub" || key === "emptylanes")
    return raw === "1" ? "1" : "0";
  if (key === "dir") return raw === "desc" ? "desc" : "asc";
  // The order of columns is the point of `order` and `cols` — don't sort
  // it away.
  if (key === "order" || key === "cols")
    return raw.split(",").filter(Boolean).join(",");
  return raw.split(",").filter(Boolean).sort().join(",");
}

/**
 * The filter of an address in comparable form: parsed into the tree and
 * written back with values and rules sorted, so "done,todo" equals
 * "todo,done" and the order of OR-ed rules doesn't matter.
 */
function filterSignature(source: ParamSource): string {
  const own: Record<string, string> = {};
  for (const key of keysOf(source)) {
    if (!isViewFilterKey(key)) continue;
    const value = read(source, key);
    if (value) own[key] = value;
  }
  const tree = parseFilterParams(own);
  // Order doesn't matter anywhere: values, rules, groups — at any depth.
  const canonical = (node: FilterNode): unknown =>
    isGroup(node)
      ? {
          op: node.op,
          rules: node.rules
            .map(canonical)
            .map((n) => JSON.stringify(n))
            .sort(),
        }
      : Array.isArray(node.value)
        ? { ...node, value: [...node.value].map(String).sort() }
        : node;
  const rules = tree.rules.map(canonical);
  return rules
    .map((r) => JSON.stringify(r))
    .sort()
    .join("&");
}

/** Whether two addresses show the same view state — the "unsaved" check. */
export function sameViewState(a: ParamSource, b: ParamSource): boolean {
  return (
    VIEW_SETTING_KEYS.every(
      (key) => normalized(a, key) === normalized(b, key),
    ) && filterSignature(a) === filterSignature(b)
  );
}

/** Only the view-state parameters of an address — what gets saved. */
export function pickViewState(source: ParamSource): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keysOf(source)) {
    if (
      !(VIEW_SETTING_KEYS as readonly string[]).includes(key) &&
      !isViewFilterKey(key)
    )
      continue;
    const value = read(source, key);
    if (value) out[key] = value;
  }
  return out;
}

/** Path of a view inside its project. */
export function viewPath(
  workspaceId: string,
  /** `null` for a cross-project view (V8). */
  projectSlug: string | null,
  viewSlug: string,
): string {
  return projectSlug
    ? `/${workspaceId}/project/${projectSlug}/view/${viewSlug}`
    : `/${workspaceId}/view/${viewSlug}`;
}

/** The display settings an address spells out — what a view page draws
 *  with and what "Save" stores. Anything implausible is dropped. */
export function displayFromParams(
  source: ParamSource,
): Required<Omit<ViewDisplay, "widgets">> {
  const list = (key: string) =>
    (read(source, key) ?? "").split(",").filter(Boolean);
  return {
    hiddenGroups: sanitizeHiddenGroups(list("hide")),
    groupOrder: sanitizeGroupOrder(list("order")),
    hiddenFields: list("fields").filter(isCardFieldKey),
    hideEmptyGroups: read(source, "empty") === "1",
    showSubIssues: read(source, "sub") === "1",
    hideEmptyLanes: read(source, "emptylanes") === "1",
    columns: sanitizeListColumns(list("cols")),
  };
}
