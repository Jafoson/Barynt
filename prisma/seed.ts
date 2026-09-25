import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { DEFAULT_HIDDEN_DETAIL_FIELDS } from "../features/projects/detail-fields";
import { type Prisma, PrismaClient } from "../lib/generated/prisma/client";
import { enrollWorkspaceMembers } from "../lib/project-membership";
import { systemRoleId } from "../lib/rbac";
import { fromMarkdown } from "../lib/richtext/fromMarkdown";
import { toPlainText } from "../lib/richtext/text";
import { uid } from "../lib/utils/id";
import {
  DEFAULT_ISSUE_TYPES,
  DEFAULT_PRIORITIES,
  DEFAULT_STATUSES,
  isClosedStatus,
} from "../lib/workspace-defaults";
import { bootstrapSystemData } from "./bootstrap";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

const WS = "nimbus";

// Bootstrap: first platform admin (SaaS operator level, above all workspaces).
// u1 (Mara) is globally appointed platform admin. Has no reach into
// tenant content, only into platform operations.
const PLATFORM_ADMIN_IDS = new Set(["u1"]);

// Platform Support carries `tenant.access` — the only master key that
// overrides every lock (locked workspace, private project, `blocked`).
// Deliberately kept separate from `platform_admin`, which explicitly may NOT do this, for testing purposes.
const PLATFORM_SUPPORT_IDS = new Set(["u18"]);

// u20 (deactivated1) tests the lock at login itself: `auth.ts` rejects a
// deactivated account before any role is even loaded.
const DEACTIVATED_USER_IDS = new Set(["u20"]);

// ─── Workspace Config ─────────────────────────────────────────────────────────
// Statuses/priorities/issue types themselves now live in `./bootstrap.ts`
// (shared with the production bootstrap path) — only the demo workspace's
// join rows are set up here, looping over the same `DEFAULT_*` arrays.

const LABELS = [
  { id: "l1", workspaceId: WS, name: "Bug", slug: "bug", color: "#e5664a" },
  {
    id: "l2",
    workspaceId: WS,
    name: "Feature",
    slug: "feature",
    color: "#6e63e6",
  },
  {
    id: "l3",
    workspaceId: WS,
    name: "Improvement",
    slug: "improvement",
    color: "#3b9d6e",
  },
  {
    id: "l4",
    workspaceId: WS,
    name: "Design",
    slug: "design",
    color: "#cf6fb0",
  },
  {
    id: "l5",
    workspaceId: WS,
    name: "Frontend",
    slug: "frontend",
    color: "#3b7bd5",
  },
  {
    id: "l6",
    workspaceId: WS,
    name: "Backend",
    slug: "backend",
    color: "#c2904a",
  },
  {
    id: "l7",
    workspaceId: WS,
    name: "Tech Debt",
    slug: "tech-debt",
    color: "#8a7f6b",
  },
  {
    id: "l8",
    workspaceId: WS,
    name: "Customer",
    slug: "customer",
    color: "#d5733b",
  },
  { id: "l9", workspaceId: WS, name: "Docs", slug: "docs", color: "#5aa0a0" },
];

// ─── Seed Data ───────────────────────────────────────────────────────────────

// Handle/email carry the role being tested in their name (owner@, manager1@, …)
// instead of a made-up name — this makes it immediately obvious, when clicking
// through the member list, who carries which permissions and which account
// needs to be logged into to verify them.
const USERS = [
  {
    id: "u1",
    firstName: "Mara",
    lastName: "Velez",
    handle: "owner",
    email: "owner@nimbus.io",
    color: "#6e63e6",
  },
  {
    id: "u2",
    firstName: "Tomas",
    lastName: "Køhler",
    handle: "member1",
    email: "member1@nimbus.io",
    color: "#d5733b",
  },
  {
    id: "u3",
    firstName: "Aisha",
    lastName: "Rahman",
    handle: "member2",
    email: "member2@nimbus.io",
    color: "#3b9d6e",
  },
  {
    id: "u4",
    firstName: "Devon",
    lastName: "Park",
    handle: "member3",
    email: "member3@nimbus.io",
    color: "#c2456b",
  },
  {
    id: "u5",
    firstName: "Lena",
    lastName: "Brandt",
    handle: "admin",
    email: "admin@nimbus.io",
    color: "#3b7bd5",
  },
  {
    id: "u6",
    firstName: "Yusuf",
    lastName: "Demir",
    handle: "member4",
    email: "member4@nimbus.io",
    color: "#a05fd0",
  },
  {
    id: "u7",
    firstName: "Priya",
    lastName: "Nair",
    handle: "viewer1",
    email: "viewer1@nimbus.io",
    color: "#cf9a3b",
  },
  // u8+: Covers the remaining workspace roles (manager, project_lead,
  // guest were missing entirely above) and gives each role enough people to
  // test lists, the permission matrix, and member management at a realistic scale.
  {
    id: "u8",
    firstName: "Noah",
    lastName: "Fischer",
    handle: "manager1",
    email: "manager1@nimbus.io",
    color: "#4a90d9",
  },
  {
    id: "u9",
    firstName: "Elif",
    lastName: "Sahin",
    handle: "manager2",
    email: "manager2@nimbus.io",
    color: "#d94a90",
  },
  {
    id: "u10",
    firstName: "Marco",
    lastName: "Rossi",
    handle: "projectlead1",
    email: "projectlead1@nimbus.io",
    color: "#90d94a",
  },
  {
    id: "u11",
    firstName: "Sofia",
    lastName: "Andersson",
    handle: "projectlead2",
    email: "projectlead2@nimbus.io",
    color: "#d9a44a",
  },
  {
    id: "u12",
    firstName: "Kwame",
    lastName: "Boateng",
    handle: "member5",
    email: "member5@nimbus.io",
    color: "#4ad9c2",
  },
  {
    id: "u13",
    firstName: "Ingrid",
    lastName: "Larsen",
    handle: "member6",
    email: "member6@nimbus.io",
    color: "#9a4ad9",
  },
  {
    id: "u14",
    firstName: "Hiro",
    lastName: "Tanaka",
    handle: "viewer2",
    email: "viewer2@nimbus.io",
    color: "#d94a4a",
  },
  {
    id: "u15",
    firstName: "Fatima",
    lastName: "Zahra",
    handle: "viewer3",
    email: "viewer3@nimbus.io",
    color: "#4ad96b",
  },
  {
    id: "u16",
    firstName: "Erik",
    lastName: "Johansson",
    handle: "guest1",
    email: "guest1@nimbus.io",
    color: "#d9d14a",
  },
  {
    id: "u17",
    firstName: "Camila",
    lastName: "Santos",
    handle: "guest2",
    email: "guest2@nimbus.io",
    color: "#4a6ed9",
  },
  // u18+: Edge cases beyond the pure workspace role matrix — support
  // override access, a project guest with no workspace membership at all, a
  // deactivated account, and a still-open invitation.
  {
    id: "u18",
    firstName: "Robin",
    lastName: "Weiss",
    handle: "support",
    email: "support@nimbus.io",
    color: "#5a5f66",
  },
  {
    id: "u19",
    firstName: "Jonas",
    lastName: "Berger",
    handle: "projectguest1",
    email: "projectguest1@nimbus.io",
    color: "#8a6ed9",
  },
  {
    id: "u20",
    firstName: "Petra",
    lastName: "Nowak",
    handle: "deactivated1",
    email: "deactivated1@nimbus.io",
    color: "#8a9099",
  },
  {
    id: "u21",
    firstName: "Samuel",
    lastName: "Ade",
    handle: "pending1",
    email: "pending1@nimbus.io",
    color: "#d9c24a",
  },
];

const WORKSPACE_MEMBERS = [
  { workspaceId: WS, userId: "u1", role: "owner", pending: false },
  { workspaceId: WS, userId: "u2", role: "member", pending: false },
  { workspaceId: WS, userId: "u3", role: "member", pending: false },
  { workspaceId: WS, userId: "u4", role: "member", pending: false },
  { workspaceId: WS, userId: "u5", role: "admin", pending: false },
  { workspaceId: WS, userId: "u6", role: "member", pending: false },
  { workspaceId: WS, userId: "u7", role: "viewer", pending: false },
  { workspaceId: WS, userId: "u8", role: "manager", pending: false },
  { workspaceId: WS, userId: "u9", role: "manager", pending: false },
  { workspaceId: WS, userId: "u10", role: "project_lead", pending: false },
  { workspaceId: WS, userId: "u11", role: "project_lead", pending: false },
  { workspaceId: WS, userId: "u12", role: "member", pending: false },
  { workspaceId: WS, userId: "u13", role: "member", pending: false },
  { workspaceId: WS, userId: "u14", role: "viewer", pending: false },
  { workspaceId: WS, userId: "u15", role: "viewer", pending: false },
  { workspaceId: WS, userId: "u16", role: "guest", pending: false },
  { workspaceId: WS, userId: "u17", role: "guest", pending: false },
  // u18 (support) and u19 (projectguest1) are deliberately left out: one
  // doesn't need workspace membership (tenant.access overrides that
  // anyway), the other is meant to represent exactly the role "only in one
  // project, nowhere else".
  { workspaceId: WS, userId: "u20", role: "member", pending: false },
  { workspaceId: WS, userId: "u21", role: "member", pending: true },
];

// `ownerId` is responsibility, not access — access comes from
// `ProjectMember`. Platform administration reads it to find orphaned
// projects (`features/admin/queries.ts`); without it, every project here
// would look like one that nobody is taking care of anymore.
const PROJECTS = [
  {
    id: "p1",
    workspaceId: WS,
    name: "Web App",
    slug: "web-app",
    desc: "Board, Liste und alles, was im Browser passiert.",
    prefix: "NIM",
    color: "#6e63e6",
    ownerId: "u1",
  },
  {
    id: "p2",
    workspaceId: WS,
    name: "Mobile",
    slug: "mobile",
    desc: "Die App für iOS und Android.",
    prefix: "MOB",
    color: "#3b9d6e",
    ownerId: "u5",
  },
  {
    id: "p3",
    workspaceId: WS,
    name: "Platform",
    slug: "platform",
    desc: "API, Datenbank und Betrieb — die Schicht unter allem.",
    prefix: "PLT",
    color: "#d5733b",
    ownerId: "u1",
  },
  // The only private project in the seed: NOT automatically enrolled for
  // all workspace members (see lib/project-membership.ts).
  // This makes it possible to directly test who can see it (members + whoever
  // carries project.admin.all/project.view.all in the workspace) and who
  // can't (every member without their own row here, e.g. member2).
  {
    id: "p4",
    workspaceId: WS,
    name: "Vault",
    slug: "vault",
    desc: "Vertrauliches Projekt — nur für ausdrücklich eingeladene Personen.",
    prefix: "VLT",
    color: "#5a5f66",
    ownerId: "u1",
    visibility: "private" as const,
  },
];

const TEAMS = [
  {
    id: "t1",
    workspaceId: WS,
    name: "Web Platform",
    key: "WEB",
    color: "#6e63e6",
    lead: "u1",
    members: ["u1", "u2", "u3", "u6"],
    projects: ["p1"],
    desc: "Owns the web app, board experience and core UX.",
  },
  {
    id: "t2",
    workspaceId: WS,
    name: "Mobile",
    key: "MOB",
    color: "#3b9d6e",
    lead: "u5",
    members: ["u5", "u4", "u7"],
    projects: ["p2"],
    desc: "iOS & Android apps and shared mobile tooling.",
  },
  {
    id: "t3",
    workspaceId: WS,
    name: "Infrastructure",
    key: "INF",
    color: "#d5733b",
    lead: "u6",
    members: ["u6", "u3", "u5"],
    projects: ["p3"],
    desc: "APIs, billing, webhooks and reliability.",
  },
];

const H = 3_600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(Date.now() - ms);

const projectOf: Record<string, string> = {
  i1: "p1",
  i2: "p1",
  i3: "p1",
  i5: "p1",
  i6: "p1",
  i8: "p1",
  i9: "p1",
  i11: "p1",
  i17: "p1",
  i22: "p1",
  i24: "p1",
  i14: "p2",
  i7: "p2",
  i13: "p2",
  i15: "p2",
  i19: "p2",
  i4: "p3",
  i10: "p3",
  i12: "p3",
  i16: "p3",
  i18: "p3",
  i20: "p3",
  i21: "p3",
  i23: "p3",
};
const typeOf: Record<string, string> = {
  i1: "bug",
  i2: "feature",
  i3: "improvement",
  i4: "bug",
  i5: "bug",
  i6: "feature",
  i7: "feature",
  i8: "feature",
  i9: "improvement",
  i10: "bug",
  i11: "feature",
  i12: "bug",
  i13: "feature",
  i14: "bug",
  i15: "feature",
  i16: "improvement",
  i17: "feature",
  i18: "feature",
  i19: "feature",
  i20: "feature",
  i21: "chore",
  i22: "bug",
  i23: "feature",
  i24: "feature",
};

const ISSUES = [
  {
    id: "i1",
    key: 142,
    title: "OAuth callback drops session on Safari 17",
    status: "in_progress",
    priority: 4,
    assignee: "u3",
    reporter: "u1",
    labels: ["l1", "l5"],
    created: ago(6 * D),
    updated: ago(2 * H),
    desc: "Users on **Safari 17** are logged out immediately after the OAuth redirect completes.\n\n### Steps to reproduce\n1. Open the app in Safari 17\n2. Click **Sign in with Google**\n3. Complete the consent screen\n\n### Expected\nSession persists and the dashboard loads.\n\n### Actual\nRedirect lands on `/login` again. The `session` cookie is missing the `SameSite=None` attribute.\n\n> Likely related to the ITP cookie partitioning change.",
    comments: [
      {
        id: "c1",
        author: "u1",
        time: ago(5 * D),
        body: "Can repro on my iPhone too — only Safari, Chrome is fine.",
      },
      {
        id: "c2",
        author: "u3",
        time: ago(3 * H),
        body: "Found it: we set the cookie before the redirect resolves. Moving it into the callback handler. PR up shortly.",
      },
    ],
  },
  {
    id: "i2",
    key: 138,
    title: "Add keyboard shortcuts for status changes",
    status: "todo",
    priority: 2,
    assignee: "u2",
    reporter: "u5",
    labels: ["l2", "l5"],
    created: ago(9 * D),
    updated: ago(1 * D),
    desc: "Power users want to move issues without the mouse.\n\n- `1–5` sets priority\n- `s` opens the status menu\n- `a` opens the assignee menu\n\nMirror the command palette grammar so muscle memory transfers.",
    comments: [],
  },
  {
    id: "i3",
    key: 151,
    title: "Board column virtualization for 500+ cards",
    status: "backlog",
    priority: 3,
    assignee: "u6",
    reporter: "u1",
    labels: ["l3", "l7", "l5"],
    created: ago(3 * D),
    updated: ago(3 * D),
    desc: "Large workspaces stutter when a column holds hundreds of cards.\n\nWe should virtualize the column list and only render the visible window. Keep drag-and-drop working across the virtualized boundary.",
    comments: [
      {
        id: "c3",
        author: "u6",
        time: ago(2 * D),
        body: "I'd benchmark with a synthetic 2k-issue workspace before we pick a windowing lib.",
      },
    ],
  },
  {
    id: "i4",
    key: 129,
    title: "Stripe webhook retries create duplicate invoices",
    status: "in_review",
    priority: 4,
    assignee: "u5",
    reporter: "u4",
    labels: ["l1", "l6", "l8"],
    created: ago(12 * D),
    updated: ago(5 * H),
    desc: "When Stripe retries a `invoice.paid` webhook, we occasionally insert a second invoice row.\n\n**Fix:** make the handler idempotent using the Stripe event id as a dedupe key.",
    comments: [
      {
        id: "c4",
        author: "u4",
        time: ago(11 * D),
        body: "Customer Acme hit this twice this month. Bumping priority.",
      },
      {
        id: "c5",
        author: "u5",
        time: ago(6 * H),
        body: "Added a unique constraint on event_id + a guard. In review.",
      },
    ],
  },
  {
    id: "i5",
    key: 160,
    title: "Dark mode contrast fails WCAG on muted text",
    status: "todo",
    priority: 2,
    assignee: "u4",
    reporter: "u3",
    labels: ["l4", "l5"],
    created: ago(2 * D),
    updated: ago(20 * H),
    desc: "Secondary text (`--text-3`) sits at ~3.1:1 against the panel background. Needs to clear **4.5:1** for body text.\n\nProposing a slightly lighter muted token in dark mode.",
    comments: [],
  },
  {
    id: "i6",
    key: 118,
    title: "Bulk-edit selected issues from the list view",
    status: "backlog",
    priority: 1,
    assignee: "u1",
    reporter: "u1",
    labels: ["l2"],
    created: ago(15 * D),
    updated: ago(7 * D),
    desc: "Shift-select rows, then change status / assignee / labels for all of them at once.",
    comments: [],
  },
  {
    id: "i7",
    key: 165,
    title: "Export board to CSV and Markdown",
    status: "backlog",
    priority: 1,
    assignee: "u7",
    reporter: "u2",
    labels: ["l2", "l9"],
    created: ago(1 * D),
    updated: ago(1 * D),
    desc: "Let teams export a filtered view. Start with CSV, add Markdown table later.",
    comments: [],
  },
  {
    id: "i8",
    key: 144,
    title: "Realtime presence avatars on shared boards",
    status: "in_progress",
    priority: 2,
    assignee: "u6",
    reporter: "u5",
    labels: ["l2", "l5"],
    created: ago(5 * D),
    updated: ago(8 * H),
    desc: "Show who else is viewing a board, like cursors-lite.\n\n- Avatar stack in the top-right\n- Soft pulse when someone joins\n- Powered by the existing websocket channel",
    comments: [
      {
        id: "c6",
        author: "u5",
        time: ago(1 * D),
        body: "Let's cap the stack at 5 + an overflow counter.",
      },
    ],
  },
  {
    id: "i9",
    key: 101,
    title: "Onboarding: empty states feel cold",
    status: "done",
    priority: 2,
    assignee: "u4",
    reporter: "u1",
    labels: ["l4", "l3"],
    created: ago(28 * D),
    updated: ago(9 * D),
    desc: "Replace the blank board with a friendly first-run checklist and a sample project.",
    comments: [
      {
        id: "c7",
        author: "u4",
        time: ago(10 * D),
        body: "Shipped the illustrated empty states + sample data toggle.",
      },
    ],
  },
  {
    id: "i10",
    key: 133,
    title: "Slow query on /issues when filtering by label",
    status: "done",
    priority: 3,
    assignee: "u3",
    reporter: "u6",
    labels: ["l1", "l6", "l7"],
    created: ago(20 * D),
    updated: ago(11 * D),
    desc: "Missing composite index on `(workspace_id, label_id)`. Added it; p95 dropped from 900ms to 60ms.",
    comments: [],
  },
  {
    id: "i11",
    key: 157,
    title: "Markdown editor: support task checkboxes",
    status: "todo",
    priority: 2,
    assignee: "u2",
    reporter: "u3",
    labels: ["l2", "l5"],
    created: ago(4 * D),
    updated: ago(2 * D),
    desc: "Render `- [ ]` and `- [x]` as interactive checkboxes inside the description.",
    comments: [],
  },
  {
    id: "i12",
    key: 149,
    title: "Notification digest emails go out at 3am UTC",
    status: "in_progress",
    priority: 3,
    assignee: "u5",
    reporter: "u7",
    labels: ["l1", "l6"],
    created: ago(6 * D),
    updated: ago(12 * H),
    desc: "Digests should respect the recipient's timezone, not the server's. Schedule per-user.",
    comments: [],
  },
  {
    id: "i13",
    key: 170,
    title: "Add 'Urgent' SLA timer to issue cards",
    status: "backlog",
    priority: 3,
    assignee: "u1",
    reporter: "u4",
    labels: ["l2", "l8"],
    created: ago(1 * D),
    updated: ago(1 * D),
    desc: "When an issue is Urgent, show a countdown to the SLA breach on the card.",
    comments: [],
  },
  {
    id: "i14",
    key: 122,
    title: "Drag-and-drop fails on touch devices",
    status: "in_review",
    priority: 3,
    assignee: "u6",
    reporter: "u2",
    labels: ["l1", "l5"],
    created: ago(10 * D),
    updated: ago(4 * H),
    desc: "Touch drag doesn't pick up cards on iPad. Need pointer-events fallback with a long-press to grab.",
    comments: [
      {
        id: "c8",
        author: "u6",
        time: ago(5 * H),
        body: "Switched to Pointer Events with a 180ms long-press threshold. Feels good on iPad now.",
      },
    ],
  },
  {
    id: "i15",
    key: 168,
    title: "Saved filter views per project",
    status: "todo",
    priority: 1,
    assignee: "u7",
    reporter: "u1",
    labels: ["l2"],
    created: ago(2 * D),
    updated: ago(1 * D),
    desc: "Let users name and pin a filter combination as a view in the sidebar.",
    comments: [],
  },
  {
    id: "i16",
    key: 155,
    title: "Avatar uploads not resized server-side",
    status: "done",
    priority: 1,
    assignee: "u3",
    reporter: "u5",
    labels: ["l1", "l6"],
    created: ago(14 * D),
    updated: ago(8 * D),
    desc: "Full-res uploads bloat storage. Resize to 256px on upload and strip EXIF.",
    comments: [],
  },
  {
    id: "i17",
    key: 173,
    title: "Command palette: fuzzy search for issues",
    status: "in_progress",
    priority: 2,
    assignee: "u1",
    reporter: "u1",
    labels: ["l2", "l5"],
    created: ago(3 * D),
    updated: ago(1 * H),
    desc: "Typing in ⌘K should match issue IDs and titles with a forgiving fuzzy matcher.",
    comments: [],
  },
  {
    id: "i18",
    key: 110,
    title: "Audit log for permission changes",
    status: "backlog",
    priority: 2,
    assignee: "u1",
    reporter: "u5",
    labels: ["l2", "l6"],
    created: ago(18 * D),
    updated: ago(16 * D),
    desc: "Track who changed a member's role and when. Admin-only view.",
    comments: [],
  },
  {
    id: "i19",
    key: 162,
    title: "Inline label creation from the issue panel",
    status: "todo",
    priority: 1,
    assignee: "u4",
    reporter: "u3",
    labels: ["l3", "l4"],
    created: ago(3 * D),
    updated: ago(2 * D),
    desc: "Type a new label name in the label menu and create it on the fly with a random color.",
    comments: [],
  },
  {
    id: "i20",
    key: 147,
    title: "Webhook signing secret rotation",
    status: "in_review",
    priority: 2,
    assignee: "u6",
    reporter: "u4",
    labels: ["l6"],
    created: ago(8 * D),
    updated: ago(6 * H),
    desc: "Support two active signing secrets during a rotation window to avoid downtime.",
    comments: [],
  },
  {
    id: "i21",
    key: 175,
    title: "Cancelled: migrate to GraphQL gateway",
    status: "canceled",
    priority: 1,
    assignee: "u5",
    reporter: "u1",
    labels: ["l7", "l6"],
    created: ago(25 * D),
    updated: ago(13 * D),
    desc: "Decided to stay on REST + tRPC for now. Revisit next quarter.",
    comments: [],
  },
  {
    id: "i22",
    key: 158,
    title: "Sidebar collapse state not persisted",
    status: "todo",
    priority: 1,
    assignee: "u2",
    reporter: "u7",
    labels: ["l1", "l5"],
    created: ago(2 * D),
    updated: ago(1 * D),
    desc: "Collapsing the sidebar resets on reload. Persist to localStorage.",
    comments: [],
  },
  {
    id: "i23",
    key: 166,
    title: "AI: suggest labels from issue title",
    status: "backlog",
    priority: 2,
    assignee: "u6",
    reporter: "u1",
    labels: ["l2", "l3"],
    created: ago(1 * D),
    updated: ago(1 * D),
    desc: "When creating an issue, suggest likely labels based on the title text.",
    comments: [],
  },
  {
    id: "i24",
    key: 140,
    title: "Comment editing & @mentions",
    status: "in_progress",
    priority: 2,
    assignee: "u1",
    reporter: "u4",
    labels: ["l2", "l5"],
    created: ago(7 * D),
    updated: ago(3 * H),
    desc: "Allow editing posted comments and @mentioning teammates to notify them.",
    comments: [
      {
        id: "c9",
        author: "u4",
        time: ago(2 * D),
        body: "Mentions should trigger a notification + email if offline.",
      },
    ],
  },
];

// ─── ID Mapping ───────────────────────────────────────────────────────────────
//
// The records above reference each other via short, readable handles
// ("u1", "p1", "l1", "i1", "c1", "t1"). These are seed-internal keys ONLY —
// we write real, non-guessable IDs to the DB, generated with the same
// uid() function used in the server actions
// (lib/utils/id.ts → prefix + crypto.randomUUID()). This prevents the
// DB from containing predictable/enumerable IDs (IDOR protection).
//
// Semantic IDs deliberately stay stable because they're used as values in
// the code: Status.id ("backlog"…), IssueType.id ("feature"…), Priority.id (0…4),
// the workspace slug, and the role keys.

const realUserId = new Map(USERS.map((u) => [u.id, uid("u")]));
const realProjectId = new Map(PROJECTS.map((p) => [p.id, uid("p")]));
const realLabelId = new Map(LABELS.map((l) => [l.id, uid("l")]));
const realTeamId = new Map(TEAMS.map((t) => [t.id, uid("t")]));
const realIssueId = new Map(ISSUES.map((i) => [i.id, uid("i")]));
const realCommentId = new Map(
  ISSUES.flatMap((i) => i.comments.map((c) => [c.id, uid("c")] as const)),
);

// Lookups that fail hard instead of writing a broken reference.
const ref = <K>(map: Map<K, string>, key: K, what: string): string => {
  const id = map.get(key);
  if (!id) throw new Error(`Seed: ${what} "${String(key)}" not mapped`);
  return id;
};

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱  Seeding database…");

  // Clean sweep: with random IDs, upsert-by-id is no longer
  // idempotent — a repeat run would otherwise create duplicates. Delete in
  // FK-safe order (children before parents).
  // The audit log has no foreign keys (see `prisma/schema.prisma`) and
  // would otherwise slip through every net during cleanup.
  await db.auditLog.deleteMany();
  await db.comment.deleteMany();
  await db.issue.deleteMany();
  await db.teamMember.deleteMany();
  await db.teamProject.deleteMany();
  await db.projectMember.deleteMany();
  await db.team.deleteMany();
  await db.label.deleteMany();
  // Memberships before roles: `WorkspaceMember.roleId` is set to
  // `Restrict` (a role that someone still holds cannot be deleted).
  // The other way around, the run fails as soon as the database isn't empty.
  await db.workspaceMember.deleteMany();
  await db.rolePermission.deleteMany();
  await db.role.deleteMany();
  await db.workspaceStatus.deleteMany();
  await db.workspacePriority.deleteMany();
  await db.workspaceIssueType.deleteMany();
  await db.project.deleteMany();
  await db.workspace.deleteMany();
  await db.user.deleteMany();
  await db.permission.deleteMany();
  await db.status.deleteMany();
  await db.priority.deleteMany();
  await db.issueType.deleteMany();
  console.log("   ✓ cleaned existing rows");

  await db.workspace.upsert({
    where: { id: WS },
    update: { name: "Nimbus" },
    create: { id: WS, name: "Nimbus", color: "#6e63e6", slug: "nimbus" },
  });
  console.log("   ✓ 1 workspace");

  // Global Status/Priority/IssueType rows + RBAC — shared with the
  // production bootstrap path (see bootstrap.ts) instead of duplicated here.
  await bootstrapSystemData(db);
  console.log(
    "   ✓ statuses, priorities, issue types, RBAC permissions & shared system roles",
  );

  for (const s of DEFAULT_STATUSES) {
    await db.workspaceStatus.upsert({
      where: { workspaceId_statusId: { workspaceId: WS, statusId: s.id } },
      update: {},
      create: { workspaceId: WS, statusId: s.id },
    });
  }
  for (const p of DEFAULT_PRIORITIES) {
    await db.workspacePriority.upsert({
      where: { workspaceId_priorityId: { workspaceId: WS, priorityId: p.id } },
      update: {},
      create: { workspaceId: WS, priorityId: p.id },
    });
  }
  for (const t of DEFAULT_ISSUE_TYPES) {
    await db.workspaceIssueType.upsert({
      where: {
        workspaceId_issueTypeId: { workspaceId: WS, issueTypeId: t.id },
      },
      update: {},
      create: { workspaceId: WS, issueTypeId: t.id },
    });
  }
  console.log("   ✓ Nimbus workspace wired to all of the above");

  for (const u of USERS) {
    const id = ref(realUserId, u.id, "user");
    const platformRoleKey = PLATFORM_ADMIN_IDS.has(u.id)
      ? "platform_admin"
      : PLATFORM_SUPPORT_IDS.has(u.id)
        ? "platform_support"
        : "platform_member";
    const roleId = systemRoleId("PLATFORM", platformRoleKey);
    await db.user.upsert({
      where: { id },
      update: { platformRoleId: roleId },
      create: {
        id,
        firstName: u.firstName,
        lastName: u.lastName,
        handle: u.handle,
        email: u.email,
        color: u.color,
        platformRoleId: roleId,
        onboardedAt: new Date(),
      },
    });
  }
  await db.user.updateMany({
    where: {
      id: {
        in: [...DEACTIVATED_USER_IDS].map((u) =>
          ref(realUserId, u, "deactivated user"),
        ),
      },
    },
    data: { deactivatedAt: new Date() },
  });
  // No more password. A passkey can only be registered for an already
  // existing address with an active session (next-auth refuses otherwise,
  // `AccountNotLinked`) — so for these seed accounts, only the
  // magic-link path remains, and that requires locally configured SMTP (Mailpit
  // or similar, see example.env). Without SMTP, nobody can currently get
  // into a seed account — accepted deliberately, since it's test data.
  console.log(
    `   ✓ ${USERS.length} users (sign-in only via magic link — SMTP required, see example.env)`,
  );

  for (const m of WORKSPACE_MEMBERS) {
    const userId = ref(realUserId, m.userId, "member user");
    const roleId = systemRoleId("WORKSPACE", m.role);
    await db.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: m.workspaceId, userId },
      },
      update: { roleId, pending: m.pending },
      create: {
        workspaceId: m.workspaceId,
        userId,
        roleId,
        pending: m.pending,
      },
    });
  }
  console.log(`   ✓ ${WORKSPACE_MEMBERS.length} workspace members`);

  for (const p of PROJECTS) {
    const id = ref(realProjectId, p.id, "project");
    const visibility = "visibility" in p ? p.visibility : "public";
    await db.project.upsert({
      where: { id },
      update: { visibility },
      create: {
        id,
        workspaceId: p.workspaceId,
        name: p.name,
        slug: p.slug,
        desc: p.desc,
        prefix: p.prefix,
        color: p.color,
        visibility,
        createdById: ref(realUserId, p.ownerId, "project owner"),
        hiddenDetailFields: DEFAULT_HIDDEN_DETAIL_FIELDS,
      },
    });
    if (visibility === "public") {
      // Whoever is in the workspace is in its public projects — without
      // their own project role; permissions come from the workspace.
      await enrollWorkspaceMembers(db, { id, workspaceId: p.workspaceId });
    }
    // Private projects (currently only "Vault") get their members added
    // explicitly, one by one, further below — that's exactly the point of being private.
  }
  console.log(`   ✓ ${PROJECTS.length} projects`);

  // ── Vault (p4, private): only whoever is explicitly invited ────────────────
  const vaultId = ref(realProjectId, "p4", "vault project");
  const vaultMembers: Array<{ userId: string; roleKey: string }> = [
    { userId: "u1", roleKey: "project_admin" }, // owner, also the creator
    { userId: "u5", roleKey: "project_admin" }, // admin, explicitly added
    { userId: "u2", roleKey: "contributor" }, // member1, working on it
    { userId: "u19", roleKey: "project_guest" }, // projectguest1: member ONLY here
  ];
  for (const vm of vaultMembers) {
    await db.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: vaultId,
          userId: ref(realUserId, vm.userId, "vault member"),
        },
      },
      update: { roleId: systemRoleId("PROJECT", vm.roleKey) },
      create: {
        projectId: vaultId,
        userId: ref(realUserId, vm.userId, "vault member"),
        roleId: systemRoleId("PROJECT", vm.roleKey),
      },
    });
  }
  console.log(`   ✓ vault: ${vaultMembers.length} explicitly invited members`);

  // ── Different managers for different projects ─────────────────────────────
  //
  // `manager` carries neither project.admin.all nor project.view.all (see
  // lib/rbac/roles.ts) — unlike Owner/Admin/Project Lead, access here really
  // does hinge on the individual ProjectMember row.
  // enrollWorkspaceMembers entered both of them above into all three public
  // projects as project_admin; here that gets narrowed down to one project each,
  // so it can be tested whether a manager really only sees "their" project.
  const web = ref(realProjectId, "p1", "web app project");
  const mobile = ref(realProjectId, "p2", "mobile project");
  const platform = ref(realProjectId, "p3", "platform project");
  const manager1 = ref(realUserId, "u8", "manager1");
  const manager2 = ref(realUserId, "u9", "manager2");
  await db.projectMember.deleteMany({
    where: {
      userId: manager1,
      projectId: { in: [mobile, platform] },
    },
  });
  await db.projectMember.deleteMany({
    where: {
      userId: manager2,
      projectId: { in: [web, platform] },
    },
  });
  console.log("   ✓ manager1 → Web App only, manager2 → Mobile only");

  // ── Blocked: with and without effect ────────────────────────────────────────
  //
  // member3 has no master key anywhere else — for her, "blocked" really does
  // lock the project. project_lead2, on the other hand, carries
  // project.admin.all in the workspace; the check in lib/permissions.ts kicks
  // in there before the project role is even loaded, so "blocked" ends up
  // having no effect. Both can be shown side by side on the same dataset.
  const blockedRoleId = systemRoleId("PROJECT", "blocked");
  await db.projectMember.update({
    where: {
      projectId_userId: {
        projectId: mobile,
        userId: ref(realUserId, "u4", "member3"),
      },
    },
    data: { roleId: blockedRoleId },
  });
  await db.projectMember.update({
    where: {
      projectId_userId: {
        projectId: platform,
        userId: ref(realUserId, "u11", "projectlead2"),
      },
    },
    data: { roleId: blockedRoleId },
  });
  console.log(
    "   ✓ member3 blocked in Mobile, project_lead2 blocked in Platform (no effect)",
  );

  for (const l of LABELS) {
    const id = ref(realLabelId, l.id, "label");
    await db.label.upsert({
      where: { id },
      update: {},
      create: {
        id,
        workspaceId: l.workspaceId,
        name: l.name,
        slug: l.slug,
        color: l.color,
      },
    });
  }
  console.log(`   ✓ ${LABELS.length} labels`);

  for (const t of TEAMS) {
    const teamId = ref(realTeamId, t.id, "team");
    await db.team.upsert({
      where: { id: teamId },
      update: {},
      create: {
        id: teamId,
        workspaceId: t.workspaceId,
        name: t.name,
        key: t.key,
        color: t.color,
        desc: t.desc,
        leadId: ref(realUserId, t.lead, "team lead"),
      },
    });
    for (const member of t.members) {
      const userId = ref(realUserId, member, "team member");
      await db.teamMember.upsert({
        where: { teamId_userId: { teamId, userId } },
        update: {},
        create: { teamId, userId },
      });
    }
    for (const project of t.projects) {
      const projectId = ref(realProjectId, project, "team project");
      await db.teamProject.upsert({
        where: { teamId_projectId: { teamId, projectId } },
        update: {},
        create: { teamId, projectId },
      });
    }
  }
  console.log(`   ✓ ${TEAMS.length} teams`);

  // Assign per-project keys starting at 1 (in array order) and track the
  // highest key per project so the project counter can be persisted below.
  const keyCounter: Record<string, number> = {};
  for (const issue of ISSUES) {
    const localProject = projectOf[issue.id] ?? "p1";
    keyCounter[localProject] = (keyCounter[localProject] ?? 0) + 1;
    const key = keyCounter[localProject];
    const issueId = ref(realIssueId, issue.id, "issue");
    await db.issue.upsert({
      where: { id: issueId },
      update: {},
      create: {
        id: issueId,
        key,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        // The seed stays written in Markdown — that's much easier to
        // maintain than ProseMirror JSON. It gets converted at seeding time.
        description: fromMarkdown(
          issue.desc,
        ) as unknown as Prisma.InputJsonValue,
        descriptionText: toPlainText(fromMarkdown(issue.desc)),
        type: typeOf[issue.id] ?? "feature",
        labels: issue.labels.map((l) => ref(realLabelId, l, "issue label")),
        created: issue.created,
        updated: issue.updated,
        // Same approximation as in the migration's backfill: for everything
        // that's already done here, the last update counts as the
        // completion. Without the column, the project dashboard would show no
        // throughput after `db:reset`.
        closedAt: isClosedStatus(issue.status) ? issue.updated : null,
        assigneeId: issue.assignee
          ? ref(realUserId, issue.assignee, "assignee")
          : null,
        reporterId: ref(realUserId, issue.reporter, "reporter"),
        projectId: ref(realProjectId, localProject, "issue project"),
      },
    });
    for (const c of issue.comments) {
      await db.comment.upsert({
        where: { id: ref(realCommentId, c.id, "comment") },
        update: {},
        create: {
          id: ref(realCommentId, c.id, "comment"),
          body: fromMarkdown(c.body) as unknown as Prisma.InputJsonValue,
          bodyText: toPlainText(fromMarkdown(c.body)),
          created: c.time,
          issueId,
          authorId: ref(realUserId, c.author, "comment author"),
        },
      });
    }
  }
  // Persist the counter so newly created issues continue after the seed data.
  for (const [localProject, last] of Object.entries(keyCounter)) {
    await db.project.update({
      where: { id: ref(realProjectId, localProject, "counter project") },
      data: { lastIssueKey: last },
    });
  }
  console.log(`   ✓ ${ISSUES.length} issues`);

  // Custom fields (BARY-79): one that applies in every project of the workspace and one in a single
  // project, each answered on a few issues so the screens have something to show.
  const customerField = await db.customFieldDefinition.upsert({
    where: { workspaceId_key: { workspaceId: WS, key: "customer" } },
    update: {},
    create: {
      id: uid("cf"),
      workspaceId: WS,
      key: "customer",
      name: "Customer",
      description: "Who this is for.",
      type: "text",
      config: { maxLength: 60 },
      position: 0,
    },
  });
  const environmentField = await db.customFieldDefinition.upsert({
    where: { workspaceId_key: { workspaceId: WS, key: "environment" } },
    update: {},
    create: {
      id: uid("cf"),
      workspaceId: WS,
      projectId: ref(realProjectId, "p1", "custom field project"),
      key: "environment",
      name: "Environment",
      type: "select",
      config: {
        options: [
          { id: "staging", label: "Staging", color: "#f59e0b" },
          { id: "production", label: "Production", color: "#ef4444" },
        ],
      },
      position: 1,
    },
  });
  const inFirstProject = ISSUES.filter(
    (issue) => (projectOf[issue.id] ?? "p1") === "p1",
  );
  const answers: [
    (typeof ISSUES)[number] | undefined,
    string,
    { text: string },
  ][] = [
    [ISSUES[0], customerField.id, { text: "Acme Corp" }],
    [ISSUES[1], customerField.id, { text: "Globex" }],
    [inFirstProject[0], environmentField.id, { text: "production" }],
    [inFirstProject[1], environmentField.id, { text: "staging" }],
  ];
  let answered = 0;
  for (const [issue, fieldId, value] of answers) {
    if (!issue) continue;
    const issueId = ref(realIssueId, issue.id, "custom field issue");
    await db.customFieldValue.upsert({
      where: { issueId_fieldId: { issueId, fieldId } },
      update: {},
      create: { issueId, fieldId, ...value },
    });
    answered++;
  }
  console.log(`   ✓ 2 custom fields, ${answered} values`);

  console.log("✅  Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
