import { z } from "zod";
import { type IssueFilter, issueFilterSchema } from "@/features/issues/filter";
import { GROUP_KEYS, type GroupKey } from "@/features/issues/group";
import { SORT_KEYS, type SortKey } from "@/features/issues/sort";

/**
 * Saved views (BARY-163): what a view stores and how it's validated. No
 * dependencies beyond zod — the editor (V4/V6) validates with the same
 * schema the server functions do.
 */

/** How a view is drawn. Table, calendar and timeline join later (V13–V16). */
export const VIEW_LAYOUTS = ["board", "list", "dashboard"] as const;
export type ViewLayout = (typeof VIEW_LAYOUTS)[number];

export const VIEW_VISIBILITIES = ["PRIVATE", "PROJECT", "WORKSPACE"] as const;
export type ViewVisibility = (typeof VIEW_VISIBILITIES)[number];

export const SORT_DIRS = ["asc", "desc"] as const;
export type SortDir = (typeof SORT_DIRS)[number];

/**
 * What a view shows beyond the filter. Every field is optional: what's
 * missing falls back to the layout's default, so a view saved before a new
 * option existed keeps working.
 *
 * `hiddenGroups`/`groupOrder` use the same "<groupKey>:<groupId>" entries as
 * `IssueViewPreference.hiddenGroups` (`features/issues/hidden-groups.ts`).
 */
export const viewDisplaySchema = z
  .object({
    hiddenFields: z.array(z.string().max(100)).max(100).optional(),
    hiddenGroups: z.array(z.string().max(200)).max(500).optional(),
    groupOrder: z.array(z.string().max(200)).max(500).optional(),
    hideEmptyGroups: z.boolean().optional(),
    showSubIssues: z.boolean().optional(),
  })
  .strict();
export type ViewDisplay = z.infer<typeof viewDisplaySchema>;

const groupKey = z.enum(GROUP_KEYS as unknown as [GroupKey, ...GroupKey[]]);
const sortKey = z.enum(SORT_KEYS as unknown as [SortKey, ...SortKey[]]);

/** The editable fields of a view — shared by create and update. */
const viewFields = {
  name: z.string().trim().min(1).max(80),
  icon: z.string().max(80).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable()
    .optional(),
  visibility: z.enum(VIEW_VISIBILITIES),
  layout: z.enum(VIEW_LAYOUTS),
  filter: issueFilterSchema,
  groupBy: groupKey.nullable().optional(),
  subGroupBy: groupKey.nullable().optional(),
  sortBy: sortKey.optional(),
  sortDir: z.enum(SORT_DIRS).optional(),
  display: viewDisplaySchema.optional(),
};

export const createViewSchema = z
  .object({
    workspaceId: z.string().min(1),
    /** `null` = cross-project view. */
    projectId: z.string().min(1).nullable(),
    ...viewFields,
    visibility: viewFields.visibility.default("PRIVATE"),
    filter: viewFields.filter.optional(),
  })
  .strict();
export type CreateViewInput = z.input<typeof createViewSchema>;

/** Everything optional — only what's passed changes. Scope (workspace,
 *  project) never changes; a view can't move between projects. */
export const updateViewSchema = z
  .object({
    name: viewFields.name.optional(),
    icon: viewFields.icon,
    color: viewFields.color,
    visibility: viewFields.visibility.optional(),
    layout: viewFields.layout.optional(),
    filter: viewFields.filter.optional(),
    groupBy: viewFields.groupBy,
    subGroupBy: viewFields.subGroupBy,
    sortBy: viewFields.sortBy,
    sortDir: viewFields.sortDir,
    display: viewFields.display,
  })
  .strict();
export type UpdateViewInput = z.input<typeof updateViewSchema>;

export const viewUserStateSchema = z
  .object({
    pinned: z.boolean().optional(),
    favorite: z.boolean().optional(),
    favoritePosition: z.number().finite().nullable().optional(),
    /** This project's start view for the caller (V7). */
    startView: z.boolean().optional(),
    collapsedGroups: z.array(z.string().max(200)).max(500).optional(),
  })
  .strict();
export type ViewUserStateInput = z.input<typeof viewUserStateSchema>;

/** A saved view as the app reads it — filter and display already parsed,
 *  plus the viewer's own state and whether they may change it. */
export interface SavedView {
  id: string;
  workspaceId: string;
  projectId: string | null;
  ownerId: string | null;
  visibility: ViewVisibility;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  position: number;
  layout: ViewLayout;
  filter: IssueFilter;
  groupBy: GroupKey | null;
  subGroupBy: GroupKey | null;
  sortBy: SortKey;
  sortDir: SortDir;
  display: ViewDisplay;
  createdAt: Date;
  updatedAt: Date;
  /** The viewer's own state (`SavedViewUserState`). */
  pinned: boolean;
  favorite: boolean;
  favoritePosition: number | null;
  /** The caller's start view of its project (V7). */
  startView: boolean;
  collapsedGroups: string[];
  /** Whether the viewer may edit or delete it (`canEditView`). */
  canEdit: boolean;
}
