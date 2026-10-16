import type { DashboardIssue, WidgetData } from "@/features/dashboard/types";
import type { Widget } from "@/features/dashboard/widgets";
import type { User } from "@/types";

// Made-up numbers for the gallery's previews — every kind looks filled and
// the same each time, with nothing to fetch. Names are people and places,
// not words, so they need no translation; status names come in from the
// caller.

const person = (
  id: string,
  firstName: string,
  lastName: string,
  color: string,
): User => ({
  id,
  firstName,
  lastName,
  handle: firstName.toLowerCase(),
  email: null,
  color,
});

const MARA = person("s-mara", "Mara", "Velez", "#6e63e6");
const JASON = person("s-jason", "Jason", "Mund", "#2fb3a0");
const HIRO = person("s-hiro", "Hiro", "Tanaka", "#a274d9");
const LEA = person("s-lea", "Lea", "Koch", "#e0992b");
const NOAH = person("s-noah", "Noah", "Frey", "#3b7bd5");
const PEOPLE = [MARA, JASON, HIRO, LEA, NOAH];

export interface SampleWords {
  statuses: [string, string, string, string, string];
  priorities: [string, string, string, string];
  titles: string[];
  role: (key: "lead" | "member" | "viewer") => string;
}

const STATUS_COLORS = ["#8a9099", "#b8bcc4", "#e0992b", "#5b9bd5", "#5ab98a"];
const PRIORITY_COLORS = ["#e05252", "#d5733b", "#e2b340", "#3b9d6e"];

function issues(words: SampleWords, count: number): DashboardIssue[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: `s-issue-${i}`,
    ref: `MOB-${21 - i * 3}`,
    title: words.titles[i % words.titles.length],
    statusName: words.statuses[(i + 1) % 5],
    statusColor: STATUS_COLORS[(i + 1) % 5],
    priority: 4 - (i % 4),
    assignee: i % 3 === 2 ? null : PEOPLE[i % PEOPLE.length],
    updated: now - (i + 1) * 5 * 3_600_000,
    dueDate: now + (i - 1) * 2 * 86_400_000,
  }));
}

/** Twelve bucket keys, a week apart — whatever the dashboard's unit. */
const KEYS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 6, 20 + i * 7));
  return d.toISOString().slice(0, 10);
});

export function sampleData(widget: Widget, words: SampleWords): WidgetData {
  const by = widget.config.groupBy;
  switch (widget.type) {
    case "kpi":
      return {
        type: "kpi",
        value: widget.config.metric === "cycleTime" ? 9.6 : 24,
        previous: widget.config.metric === "cycleTime" ? 11.2 : 19,
        spark: [12, 14, 13, 17, 16, 19, 21, 20, 24],
      };
    case "progress":
      return { type: "progress", done: 17, inProgress: 3, total: 25 };
    case "distribution": {
      const slices =
        by === "priority"
          ? words.priorities.map((label, i) => ({
              key: `p${i}`,
              label,
              color: PRIORITY_COLORS[i],
              count: [2, 6, 8, 4][i],
            }))
          : by === "assignee"
            ? PEOPLE.map((user, i) => ({
                key: user.id,
                label: user.firstName,
                color: user.color,
                count: [8, 6, 4, 3, 2][i],
                user,
              }))
            : words.statuses.map((label, i) => ({
                key: `s${i}`,
                label,
                color: STATUS_COLORS[i],
                count: [6, 5, 4, 3, 7][i],
              }));
      return {
        type: "distribution",
        slices,
        total: slices.reduce((a, s) => a + s.count, 0),
      };
    }
    case "attention": {
      const list = issues(words, 6).map((issue, i) => ({
        ...issue,
        reason: (["overdue", "unassigned", "urgent", "stale"] as const)[i % 4],
        dueDate: Date.now() - (i + 2) * 86_400_000,
      }));
      return { type: "attention", issues: list, total: 6 };
    }
    case "issues":
      return { type: "issues", issues: issues(words, 8), total: 14 };
    case "flow": {
      const created = [4, 6, 3, 7, 5, 8, 6, 9, 5, 7, 10, 6];
      const closed = [3, 4, 5, 4, 6, 5, 7, 6, 8, 6, 7, 8];
      return {
        type: "flow",
        points: KEYS.map((date, i) => ({
          date,
          created: created[i],
          closed: closed[i],
        })),
        created: created.reduce((a, b) => a + b),
        closed: closed.reduce((a, b) => a + b),
      };
    }
    case "burnup":
      return {
        type: "burnup",
        points: KEYS.map((date, i) => ({
          date,
          total: 30 + i * 3 + (i > 6 ? 4 : 0),
          done: 8 + i * 3,
        })),
      };
    case "cycle": {
      const days = [
        3, 5, 8, 2, 13, 7, 9, 21, 6, 4, 11, 8, 16, 5, 9, 3, 12, 7, 24, 6,
      ];
      const now = Date.now();
      return {
        type: "cycle",
        avg: 9.6,
        previous: 11.2,
        p50: 8,
        p75: 12,
        p95: 22,
        points: days.map((d, i) => ({
          id: `s-c${i}`,
          ref: `MOB-${40 - i}`,
          title: words.titles[i % words.titles.length],
          closed: now - (days.length - i) * 3 * 86_400_000,
          days: d,
        })),
        spark: [12, 11, 13, 10, 9, 11, 9, 8, 10, 9.6],
      };
    }
    case "age":
      return {
        type: "age",
        buckets: [9, 6, 4, 2, 1],
        avg: 16,
        oldest: [],
      };
    case "matrix":
      return {
        type: "matrix",
        rows: [MARA, JASON, HIRO, LEA].map((user) => ({
          key: user.id,
          label: user.firstName,
          color: user.color,
          count: 0,
          user,
        })),
        cols: words.statuses.slice(1).map((label, i) => ({
          key: `s${i}`,
          label,
          color: STATUS_COLORS[i + 1],
          count: 0,
        })),
        cells: [
          [4, 3, 1, 2],
          [2, 2, 1, 0],
          [1, 1, 1, 3],
          [1, 0, 0, 1],
        ],
        max: 4,
      };
    case "workload":
      return {
        type: "workload",
        rows: [
          { user: MARA, open: 8, inProgress: 3 },
          { user: JASON, open: 5, inProgress: 2 },
          { user: HIRO, open: 3, inProgress: 1 },
          { user: LEA, open: 2, inProgress: 1 },
          { user: null, open: 3, inProgress: 0 },
        ],
      };
    case "about":
      return {
        type: "about",
        about: {
          kind: "project",
          name: "Mobile",
          desc: words.titles[words.titles.length - 1],
          color: "#3b9d6e",
          avatarUrl: null,
          prefix: "MOB",
          createdAt: Date.UTC(2026, 2, 1),
          members: PEOPLE,
          memberCount: 6,
          open: 20,
          projects: null,
          links: [],
          editHref: null,
        },
      };
    case "activity":
      return {
        type: "activity",
        entries: [
          ["issue.status.changed", MARA, "MOB-14", 5],
          ["issue.created", JASON, "MOB-22", 60],
          ["issue.comment.added", HIRO, "MOB-3", 300],
          ["issue.created", LEA, "MOB-21", 900],
        ].map(([action, user, target, minutes], i) => ({
          id: `s-a${i}`,
          createdAt: new Date(Date.now() - (minutes as number) * 60_000),
          action: action as string,
          actorId: (user as User).id,
          actorLabel: `${(user as User).firstName} ${(user as User).lastName}`,
          actorColor: (user as User).color,
          actorAvatarUrl: null,
          targetType: "issue",
          targetId: null,
          targetLabel: target as string,
          personColor: null,
          workspaceId: null,
          projectId: null,
          reason: null,
          meta: null,
          projectRef: null,
          workspaceRef: null,
        })),
      };
    case "members":
      return {
        type: "members",
        groups: [
          { key: "lead", name: words.role("lead"), rank: 4, members: [MARA] },
          {
            key: "member",
            name: words.role("member"),
            rank: 3,
            members: [JASON, HIRO, LEA],
          },
          {
            key: "viewer",
            name: words.role("viewer"),
            rank: 2,
            members: [NOAH],
          },
        ],
        total: 5,
        href: null,
      };
    case "teams":
      return {
        type: "teams",
        teams: [
          {
            id: "s-t1",
            name: "Mobile",
            key: "MOB",
            color: "#3b9d6e",
            members: 4,
            lead: MARA,
          },
          {
            id: "s-t2",
            name: "Platform",
            key: "PLT",
            color: "#d5733b",
            members: 3,
            lead: HIRO,
          },
          {
            id: "s-t3",
            name: "Web",
            key: "WEB",
            color: "#6e63e6",
            members: 5,
            lead: JASON,
          },
        ],
        href: null,
      };
    case "labels":
      return {
        type: "labels",
        labels: [
          ["Bug", "#e5664a", 6],
          ["Feature", "#6e63e6", 5],
          ["Frontend", "#3b7bd5", 4],
          ["Backend", "#3b9d6e", 3],
          ["Design", "#e05aa8", 2],
          ["Release 2.4", "#9bc53d", 2],
          ["Docs", "#8a9099", 0],
        ].map(([name, color, open], i) => ({
          id: `s-l${i}`,
          name: name as string,
          color: color as string,
          open: open as number,
          own: i > 4,
        })),
        projectId: null,
        workspaceId: "",
        canCreate: false,
        href: null,
      };
    case "projects":
      return {
        type: "projects",
        projects: [
          ["Mobile", "MOB", "#3b9d6e", 5],
          ["Platform", "PLT", "#d5733b", 4],
          ["Vault", "VLT", "#a274d9", 1],
          ["Web App", "WEB", "#6e63e6", 10],
        ].map(([name, prefix, color, open], i) => ({
          id: `s-p${i}`,
          name: name as string,
          prefix: prefix as string,
          color: color as string,
          avatarUrl: null,
          open: open as number,
          href: "#",
        })),
        href: "#",
      };
    case "links":
      return {
        type: "links",
        links: [
          { id: "s-k1", label: "Docs", url: "#" },
          { id: "s-k2", label: "GitHub", url: "#" },
          { id: "s-k3", label: "Figma", url: "#" },
          { id: "s-k4", label: "Slack", url: "#" },
        ],
        href: null,
      };
    case "shortcuts":
      return {
        type: "shortcuts",
        items: [
          { key: "board", icon: "lucide:kanban", href: "#" },
          { key: "list", icon: "lucide:list", href: "#" },
          { key: "members", icon: "lucide:users", href: "#" },
          { key: "settings", icon: "lucide:settings", href: "#" },
          { key: "activity", icon: "lucide:history", href: "#" },
        ],
      };
    case "note":
      return { type: "note" };
  }
}
