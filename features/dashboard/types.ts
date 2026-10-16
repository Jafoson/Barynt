import type { DashboardScope } from "@/features/dashboard/scope";
import type { Widget } from "@/features/dashboard/widgets";
import type { AuditEntry } from "@/lib/audit/actions";
import type { BucketUnit, RangeKey } from "@/lib/buckets";
import type { User } from "@/types";

// What a dashboard's widgets display — fully computed on the server, as
// everywhere in this project. The widgets just render.

/** Which dashboard: a project's, the workspace's, or a dashboard view's. */
export type DashboardTarget =
  | { kind: "project"; id: string }
  | { kind: "workspace"; id: string }
  | { kind: "view"; id: string };

/** Why an issue appears in "needs attention" — most severe first. */
export type AttentionReason = "overdue" | "unassigned" | "urgent" | "stale";

/** An issue as the list widgets show it. */
export interface DashboardIssue {
  id: string;
  /** `NIM-142`. */
  ref: string;
  title: string;
  statusName: string;
  statusColor: string;
  priority: number;
  assignee: User | null;
  /** Milliseconds. */
  updated: number;
  dueDate: number | null;
  reason?: AttentionReason;
}

/** One part of a distribution or one axis entry of a matrix. */
export interface Slice {
  key: string;
  label: string;
  color: string;
  count: number;
  /** For the assignee axis. */
  user?: User | null;
}

export interface FlowPoint {
  /** Bucket start, `YYYY-MM-DD`. */
  date: string;
  created: number;
  closed: number;
}

export interface BurnupPoint {
  date: string;
  /** Every issue that existed by the bucket's end. */
  total: number;
  /** Of those, closed by then. */
  done: number;
}

export interface CyclePoint {
  id: string;
  ref: string;
  title: string;
  /** Closed at, milliseconds. */
  closed: number;
  days: number;
}

export interface WorkloadRow {
  /** `null` is the unassigned pile. */
  user: User | null;
  open: number;
  inProgress: number;
}

export interface AboutData {
  kind: "project" | "workspace";
  name: string;
  desc: string;
  color: string;
  avatarUrl: string | null;
  /** The project's issue prefix; `null` for the workspace. */
  prefix: string | null;
  createdAt: number;
  members: User[];
  memberCount: number;
  open: number;
  /** Projects in the workspace; `null` for a project. */
  projects: number | null;
  /** Teams working on it. */
  teams: number;
  links: { id: string; label: string; url: string }[];
  /** Settings — only for who may change name and description. */
  editHref: string | null;
}

export interface MemberRow {
  user: User;
  /** Their open issues as a list. */
  href: string;
}

export interface RoleGroup {
  key: string;
  name: string;
  rank: number;
  members: MemberRow[];
}

export interface TeamRow {
  id: string;
  name: string;
  key: string;
  color: string;
  members: number;
  lead: User | null;
  /** Its people, for the face stack. */
  people: User[];
  /** The open issues of everyone in it, as a list. */
  href: string | null;
}

export interface LabelRow {
  id: string;
  name: string;
  color: string;
  /** Open issues carrying it, within the dashboard's projects. */
  open: number;
  /** Belongs to the project alone, not the whole workspace. */
  own: boolean;
  /** Its open issues as a list. */
  href: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  prefix: string;
  color: string;
  avatarUrl: string | null;
  open: number;
  href: string;
}

export interface Shortcut {
  key:
    | "board"
    | "list"
    | "members"
    | "settings"
    | "activity"
    | "issues"
    | "projects"
    | "views"
    | "teams";
  icon: string;
  href: string;
}

export type WidgetData =
  | {
      type: "kpi";
      value: number | null;
      /** The same over the previous range — `null` for stocks without
       *  history and when there's nothing to compare with. */
      previous: number | null;
      /** One value per bucket, oldest first. */
      spark: number[] | null;
    }
  | { type: "progress"; done: number; inProgress: number; total: number }
  | { type: "distribution"; slices: Slice[]; total: number }
  | { type: "attention"; issues: DashboardIssue[]; total: number }
  | { type: "issues"; issues: DashboardIssue[]; total: number }
  | { type: "flow"; points: FlowPoint[]; created: number; closed: number }
  | { type: "burnup"; points: BurnupPoint[] }
  | {
      type: "cycle";
      avg: number | null;
      previous: number | null;
      p50: number | null;
      p75: number | null;
      p95: number | null;
      points: CyclePoint[];
      /** Average per bucket, `null` where nothing closed. */
      spark: (number | null)[];
    }
  | { type: "workload"; rows: WorkloadRow[] }
  | {
      type: "matrix";
      rows: Slice[];
      cols: Slice[];
      cells: number[][];
      max: number;
    }
  | {
      type: "age";
      /** <1 W, 1–2 W, 2–4 W, 1–3 M, >3 M. */
      buckets: number[];
      avg: number | null;
      oldest: DashboardIssue[];
    }
  | { type: "about"; about: AboutData | null }
  | { type: "activity"; entries: AuditEntry[] }
  | {
      type: "members";
      groups: RoleGroup[];
      total: number;
      /** The member list — `null` without the permission to see it. */
      href: string | null;
    }
  | { type: "teams"; teams: TeamRow[]; href: string | null }
  | {
      type: "labels";
      labels: LabelRow[];
      /** Where a new label goes: the project, or the workspace (`null`). */
      projectId: string | null;
      workspaceId: string;
      canCreate: boolean;
      href: string | null;
    }
  | { type: "projects"; projects: ProjectRow[]; href: string }
  | {
      type: "links";
      links: { id: string; label: string; url: string }[];
      href: string | null;
    }
  | { type: "shortcuts"; items: Shortcut[] }
  | { type: "note" };

/** Widget id → its data. */
export type WidgetDataMap = Record<string, WidgetData>;

/** Where the widgets came from and who may change what. */
export interface DashboardLayoutInfo {
  widgets: Widget[];
  /** Read from the person's own row. */
  personal: boolean;
  /** Admins have set a default for everyone (project/workspace only). */
  hasShared: boolean;
  /** May change their own layout (everyone who sees a project/workspace
   *  dashboard; for a view: whoever may edit it). */
  canEdit: boolean;
  /** May save the default for everyone (`project.update`/`workspace.update`). */
  canEditShared: boolean;
}

export interface DashboardView {
  target: DashboardTarget;
  range: RangeKey;
  unit: BucketUnit;
  /** The scope actually applied — "mine" without `dashboard.view.all`. */
  scope: DashboardScope;
  canViewAll: boolean;
  layout: DashboardLayoutInfo;
  data: WidgetDataMap;
}
