import type { CardCustomFields } from "@/features/custom-fields/cardFields";
import type { CustomFieldRow } from "@/features/custom-fields/types";
import type { PMDoc } from "@/lib/richtext/types";
import type {
  EstimateUnit,
  IssueType,
  Label,
  Priority,
  Project,
  SearchableIssue,
  Status,
  User,
} from "@/types";

/**
 * Lookup data an issue card uses to resolve the IDs on the issue: project
 * prefix, assignee, label names, type color.
 *
 * Deliberately a single bundle rather than individual props — the board
 * and its columns don't use any of it themselves, they only pass it
 * through to the card.
 */
export interface IssueLookups {
  projects: Project[];
  members: User[];
  labels: Label[];
  issueTypes: IssueType[];
  /** The custom fields this person shows on cards and rows, with the answers of the view's issues (BARY-81). */
  customFields: CardCustomFields;
}

/**
 * Workspace data an editing UI for an issue needs: every picker (status,
 * priority, assignee, label, project) operates on one of these lists, and
 * `me` identifies the record making the edit.
 *
 * Fetched by a server component and passed down as a prop — modals are
 * opened from client contexts and can't query for themselves.
 */
export interface IssueEditorData {
  workspaceId: string;
  me: User;
  projects: Project[];
  members: User[];
  labels: Label[];
  statuses: Status[];
  priorities: Priority[];
  /** For the `#` trigger in the editor — the workspace's issues to link to. */
  searchIssues: SearchableIssue[];
}

/** The composer additionally needs the issue types for its type picker. */
export interface IssueComposerData extends IssueEditorData {
  issueTypes: IssueType[];
  /**
   * Projects where the user has `issue.create` — the subset of `projects`
   * a new issue can actually be created in.
   *
   * Deliberately its own list rather than a filtered version of `projects`:
   * that list also serves as the lookup table for existing issues (prefix,
   * color). Trimming it to hide buttons would leave cards without project
   * names.
   *
   * Empty means: no "New issue" — anywhere. That's decided in
   * `features/issues/editor-data.ts`, not in the four individual buttons.
   */
  creatableProjectIds: string[];
  /**
   * The custom fields a new issue can be answered with (BARY-81): the workspace-wide ones and those
   * of the projects in `creatableProjectIds`, in their order. The composer shows the ones that
   * apply to the project it is on.
   */
  customFields: CustomFieldRow[];
}

/**
 * A partial change to an issue — exactly the fields `updateIssue` writes.
 * Every UI that offers a picker (list, board, detail view) passes its
 * change through this.
 */
export interface IssuePatch {
  status?: string;
  priority?: number;
  type?: string;
  assignee?: string | null;
  labels?: string[];
  title?: string;
  description?: PMDoc;
  /** Epoch ms; `null` clears it. */
  dueDate?: number | null;
  storyPoints?: number | null;
  estimateHours?: number | null;
  estimateUnit?: EstimateUnit | null;
}
