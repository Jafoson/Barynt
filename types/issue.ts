import type { AuditEntry } from "@/lib/audit/actions";
import type { PMDoc } from "@/lib/richtext/types";
import type { SearchableIssue } from "./workspace";

/** How an issue or comment was created — `APP` for the web app itself,
 *  `API`/`MCP` for the two `features/api-v1/mutations.ts` callers
 *  (`app/api/v1`, `app/api/mcp`). Drives the small source badge next to the
 *  reporter/author (`IssueMeta`, `CommentThread`). Mirrors the
 *  `ContentSource` Prisma enum as a plain string union, same convention as
 *  every other enum in this file. */
export type ContentSource = "APP" | "API" | "MCP";

/** Unit a time estimate was entered in (BARY-4) — `Issue.estimateHours`
 *  itself always stores the value normalized to hours; this says which
 *  unit to redisplay it in (see `features/issues/estimate.ts` for the
 *  conversion). `null` exactly when `estimateHours` is `null`. */
export type EstimateUnit = "hours" | "days" | "weeks" | "months" | "years";

export interface Status {
  id: string;
  name: string;
  short: string;
  color: string;
  isColumn: boolean;
}

export interface Priority {
  id: number;
  key: string;
  name: string;
  color: string;
}

export interface Label {
  id: string;
  name: string;
  slug: string;
  color: string;
  projectId?: string | null;
  /**
   * Projects where this workspace label is not offered.
   *
   * Hidden in the project's label settings. Anyone building a selection list
   * must check this list — on issues that already carry the label, it stays
   * visible.
   */
  hiddenIn?: string[];
}

export interface IssueType {
  id: string;
  name: string;
  color: string;
}

/** A reaction, already grouped by emoji. */
export interface CommentReactionSummary {
  emoji: string;
  count: number;
  /** Whether the current viewer reacted with this emoji themselves — drives
   *  the pill's highlight and the click-to-toggle behavior. */
  reactedByMe: boolean;
}

export interface Comment {
  id: string;
  author: string;
  time: number;
  /** `null` = never edited — drives the "edited" note. */
  updated: number | null;
  /** `null` = top-level comment, otherwise the id of the parent comment. */
  parentId: string | null;
  /** ProseMirror document — rendered by `components/ui/atoms/RichText`. */
  body: PMDoc;
  reactions: CommentReactionSummary[];
  source: ContentSource;
}

/**
 * An attachment as loaded by the detail view — already resolved: for
 * `kind: "file"`, `url` is a presigned S3 address (valid for one hour,
 * freshly generated on every render); for `kind: "link"`, it's the
 * externally entered address unchanged. `null` for `kind: "file"` means:
 * storage not configured, or the object is missing.
 */
export interface IssueAttachment {
  id: string;
  kind: "file" | "link";
  name: string;
  url: string | null;
  mimeType: string | null;
  size: number | null;
  createdAt: number;
  authorId: string;
}

export interface Issue {
  id: string;
  key: number;
  title: string;
  status: string;
  priority: number;
  assignee: string | null;
  reporter: string;
  labels: string[];
  rank: number;
  created: number;
  updated: number;
  /** ProseMirror document — rendered by `components/ui/atoms/RichText`. */
  description: PMDoc;
  comments: Comment[];
  project: string;
  type: string;
  /** Absolute URL of the public read link, `null` when sharing is off
   *  (`lib/issue-share.ts`). Assembled fully on the server — the client
   *  never builds URLs itself, since `lib/app-url.ts` reads environment
   *  variables that never reach the browser. */
  shareUrl: string | null;
  source: ContentSource;
  /** Epoch ms, same convention as `created`/`updated` — `null` when unset. */
  dueDate: number | null;
  /** Story points (BARY-4) — typically a Fibonacci value (1/2/3/5/8/13),
   *  but not enforced server-side. Independent of `estimateHours`: an issue
   *  can carry either, both, or neither. */
  storyPoints: number | null;
  /** Time estimate, normalized to hours (BARY-4), e.g. `2.5`. */
  estimateHours: number | null;
  /** Which unit `estimateHours` was entered in — `null` iff `estimateHours` is. */
  estimateUnit: EstimateUnit | null;
}

/**
 * What the current user is allowed to do with this one issue — depends on
 * role AND ownership (`issue.update.own`/`issue.delete.own` only apply to the
 * reporter/assignee), so it's computed per issue rather than derivable from
 * the role alone. Mirrors exactly the checks in `updateIssue`/`deleteIssue`
 * (`features/issues/actions.ts`) — the detail view never offers a control
 * that the server would reject anyway.
 */
export interface IssueAccess {
  /** `issue.update.any`, or (`issue.update.own` and reporter/assignee). */
  canEdit: boolean;
  /** `canEdit` AND `issue.assign` — only relevant once `canEdit` already holds. */
  canAssign: boolean;
  /** `issue.delete.any`, or (`issue.delete.own` and reporter/assignee). */
  canDelete: boolean;
  /** `issue.share.manage` — create/revoke the public read link. */
  canShare: boolean;
  /** `comment.update.any` — edit other people's comments, not just your own. */
  canUpdateAnyComment: boolean;
  /** `comment.delete.any` — delete other people's comments, not just your own. */
  canDeleteAnyComment: boolean;
}

/** `IssueRelation.type` (Prisma enum) as a plain string union — same
 *  convention as `ContentSource`. Mirrors `prisma/schema.prisma`. */
export type IssueRelationKind = "BLOCKS" | "RELATES_TO" | "DUPLICATES";

/**
 * A parent/child/related issue as shown in `IssueRelations` — a
 * `SearchableIssue` plus its assignee id and its own `IssueAccess`, so the
 * row can show a status/assignee and offer status/assignee/title editing
 * right there. `access` is resolved per row the same way
 * `getIssuesByProject` resolves it per board/list card — this issue may sit
 * in a different project than the one currently open, so its permissions
 * can't be assumed to match. The assignee id is looked up against
 * `data.members` on the client, the same way `IssueMeta` resolves the
 * reporter, rather than carried as a full `User` object here.
 */
export interface LinkedIssue extends SearchableIssue {
  assignee: string | null;
  access: IssueAccess;
}

/**
 * One relation edge as shown from the current issue's point of view.
 *
 * `BLOCKS`/`DUPLICATES` carry a direction as part of their meaning ("this
 * issue blocks that one" isn't the same statement the other way round) —
 * `direction` says which end the *current* issue is on: `outgoing` means
 * this issue is the source (it blocks/duplicates `issue`), `incoming` means
 * it's the target (it's blocked by/duplicated by `issue`). `RELATES_TO` has
 * no real direction; it's always stored and shown as `outgoing` (see
 * `addIssueRelation`, `features/issues/actions.ts`).
 */
export interface IssueRelationRef {
  id: string;
  type: IssueRelationKind;
  direction: "outgoing" | "incoming";
  issue: LinkedIssue;
}

/** An issue as loaded by the detail view (panel, dialog, full page). */
export interface IssueDetail extends Issue {
  access: IssueAccess;
  attachments: IssueAttachment[];
  /** Parent of a sub-issue — `null` for a top-level issue (BARY-1). */
  parent: LinkedIssue | null;
  /** Issues that have this one as their `parent`. */
  children: LinkedIssue[];
  /** Blocks/relates to/duplicates edges, both directions. */
  relations: IssueRelationRef[];
  /** Field-change history (status/priority/assignee/labels/…), newest
   *  first — the same `AuditLog` rows the workspace/project activity log
   *  reads, filtered to this one issue (`listAudit({ targetId })`). */
  activity: AuditEntry[];
}
