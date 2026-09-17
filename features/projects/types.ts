import type { Role, User } from "@/types";

/**
 * Who gets automatically enrolled on creation and on join. Access is decided
 * solely by `ProjectMember` — so switching to `private` doesn't take anything
 * away from anyone, it only stops the automatic enrollment.
 */
export type ProjectVisibility = "public" | "private";

/** Everything the settings page of a project renders. */
export interface ProjectSettingsView {
  project: {
    id: string;
    name: string;
    slug: string;
    prefix: string;
    color: string;
    avatarUrl: string | null;
    /** Empty if nobody has written a sentence about it. */
    desc: string;
    visibility: ProjectVisibility;
    issueCount: number;
    memberCount: number;
  };
  /** `project.update` — name, prefix, color, visibility. */
  canUpdate: boolean;
  /** `project.delete` — delete the project along with all issues. */
  canDelete: boolean;
}

/** Everything the "Fields" settings page of a project renders (BARY-31). */
export interface ProjectFieldsView {
  projectId: string;
  /** Raw stored keys — resolve with `visibleDetailFields()`
   *  (`features/projects/detail-fields.ts`), don't read directly. */
  hiddenDetailFields: string[];
  /** `project.update` — the only permission this page's toggle needs. */
  canUpdate: boolean;
}

/**
 * Where the role someone holds in the project comes from:
 * `project` = their own project role from `ProjectMember`, the normal case.
 * `workspace` = no project entry, because their workspace role sees through
 * every project (Owner, Admin) — the only remaining source besides the
 * project role.
 */
export type ProjectAccessSource = "project" | "workspace";

export interface ProjectMemberRow {
  user: User;
  /** Role key that actually applies in this project. */
  role: string;
  /** Resolved display name of the role — the UI needs no lookup table. */
  roleName: string;
  /** Rank of the role, for coloring. Comes from the database. */
  roleRank: number;
  source: ProjectAccessSource;
  /**
   * Only for `source: "project"`: whether the role was set by a project
   * lead or was taken over from a team (`ProjectMember.origin`). A `team`
   * row can be changed like any other — setting it makes it permanently
   * `manual`, see `setProjectMemberRole`.
   */
  origin?: "manual" | "team";
  /** Only for `origin: "team"`: which team most recently justified the role. */
  originTeam?: { id: string; name: string; color: string };
  /** The workspace invitation has not been accepted yet. */
  pending: boolean;
  /** This is the currently logged-in user — the row marks itself. */
  you: boolean;
  /**
   * Whether the current user is allowed to touch this row: rank, self-
   * reference, and the workspace leadership don't stand in the way. Decided
   * server-side — the ranking of roles doesn't belong on the client.
   *
   * Whether the specific action is allowed is answered by the view's
   * `canSetRole` and `canRemove`: the three `member.*` permissions are
   * grantable separately, so the UI must not collapse them into one flag.
   */
  manageable: boolean;
}

/** Everything the members page of a project renders. */
export interface ProjectMembersView {
  rows: ProjectMemberRow[];
  /**
   * Workspace members without their own project entry — the suggestion list
   * in the add dialog. Also includes people who don't (yet) have any access
   * to the project and are therefore missing from `rows`. Empty without
   * `member.invite`: without that permission there is nobody to add, so
   * nothing to suggest either.
   */
  candidates: User[];
  /** Roles the current user is allowed to assign. Empty without management rights. */
  assignableRoles: Role[];
  /** Preselection in the add dialog. */
  defaultRole: string;
  /** `member.invite` — add or invite members into the project. */
  canAdd: boolean;
  /** `member.role.update` — change a member's project role. */
  canSetRole: boolean;
  /** `member.remove` — remove someone from the project. */
  canRemove: boolean;
  /** Allowed to invite by email. Tied to the same permission as `canAdd`. */
  canInvite: boolean;
  /**
   * Offset into the combined list (project and inherited workspace members),
   * as a string — `null` if `rows` is already everything. Not a database
   * cursor: the list is assembled in memory from two fully-read sources
   * (`getProjectMembersView`), not from a single query that could resume at
   * an id.
   */
  nextCursor: string | null;
}

/** A label as the management page of a project shows it. */
export interface ProjectLabelRow {
  id: string;
  name: string;
  /** Appears verbatim in filter URLs (`?label=…`) and stays put on rename. */
  slug: string;
  color: string;
  /**
   * How often the label is attached to an issue in **this** project. A
   * workspace label may still be in use elsewhere — this number only says
   * what deleting it here would visibly change.
   */
  issueCount: number;
  /**
   * Hidden in this project — it then no longer appears as an option on any
   * task. Only relevant for inherited labels; the project's own ones get
   * deleted instead.
   */
  hidden: boolean;
}

/** Everything the labels page of a project renders. */
export interface ProjectLabelsView {
  /** Labels owned by the project. Only these can be edited here. */
  own: ProjectLabelRow[];
  /**
   * Workspace labels: apply in every project and can be neither renamed nor
   * deleted here — a rename would otherwise bleed into other projects. What
   * this project gets to decide is whether it offers them at all
   * (`ProjectLabelRow.hidden`).
   */
  inherited: ProjectLabelRow[];
  /** `label.create` in project scope. */
  canCreate: boolean;
  /** `label.update` in project scope — edits the project's own labels and
   * decides whether to hide inherited ones. */
  canUpdate: boolean;
  /** `label.delete` in project scope. */
  canDelete: boolean;
  /** Cursor for `own`, `null` when everything is already loaded. */
  ownNextCursor: string | null;
  /** Cursor for `inherited`, `null` when everything is already loaded. */
  inheritedNextCursor: string | null;
}
