import { beforeEach, describe, expect, it, mock } from "bun:test";

// ── Mocks ─────────────────────────────────────────────────────────────────────
//
// This file mocks `@/lib/api-auth` and `@/lib/permissions` directly, so it
// must run in its own `bun test` invocation, separate from `apiAuth.test.ts`
// (which tests the real module) — see CLAUDE.md's testing section on Bun
// 1.3's shared module cache within one process.

const mockResolveApiUser = mock();
mock.module("@/lib/api-auth", () => ({
  resolveApiUser: mockResolveApiUser,
  // The real, trivial implementation — routes call this on the object
  // `resolveApiUser` resolves to, so there's nothing scope-specific to
  // fake here, only `resolveApiUser`'s return value per test matters.
  hasScope: (auth: { scopes: string[] }, scope: string) =>
    auth.scopes.includes(scope),
}));

const mockCan = mock();
const mockCanEnterWorkspace = mock();
mock.module("@/lib/permissions", () => ({
  can: mockCan,
  canEnterWorkspace: mockCanEnterWorkspace,
  accessibleProjectIds: mock(async () => new Set()),
}));

// `createProjectForUser`'s enrollment step is the real
// `lib/project-membership.ts` (not mocked) running against the mocked
// `@/lib/db` below — `enrollMember`/`enrollWorkspaceMembers` aren't the
// subject of these tests, only that they don't blow up the request.

// Defaults to "always allowed" (see `reset()`) so every existing test keeps
// exercising the scope/permission logic it's actually about — the 429 path
// gets its own dedicated tests below.
const mockCheckRateLimit = mock();
mock.module("@/lib/api/rateLimit", () => ({
  checkRateLimit: mockCheckRateLimit,
}));

const mockIssueFindUnique = mock();
const mockIssueFindMany = mock();
const mockIssueUpdate = mock();
const mockIssueCreate = mock();
const mockIssueDeleteMany = mock();
const mockProjectFindUnique = mock();
const mockProjectUpdate = mock();
const mockProjectFindMany = mock();
const mockProjectCreate = mock();
const mockProjectDelete = mock();
const mockCommentFindUnique = mock();
const mockCommentFindMany = mock();
const mockCommentCreate = mock();
const mockCommentUpdate = mock();
const mockCommentDelete = mock();
const mockLabelFindUnique = mock();
const mockLabelFindMany = mock();
const mockLabelCreate = mock();
const mockLabelUpdate = mock();
const mockLabelDelete = mock();
const mockWorkspaceFindUnique = mock();
const mockWorkspaceCreate = mock();
const mockWorkspaceUpdate = mock();
const mockWorkspaceDelete = mock();
const mockWorkspaceStatusCreateMany = mock();
const mockWorkspacePriorityCreateMany = mock();
const mockWorkspacePriorityFindMany = mock();
const mockWorkspaceIssueTypeFindMany = mock();
const mockWorkspaceIssueTypeCreateMany = mock();
const mockWorkspaceMemberFindMany = mock();
const mockWorkspaceMemberCreate = mock();
const mockProjectMemberCreateMany = mock();
const mockProjectMemberFindMany = mock();
const mockWorkspaceStatusFindMany = mock();
const mockViewFindMany = mock();
const mockViewFindUnique = mock();
const mockViewCreate = mock();
const mockViewUpdate = mock();
const mockViewDelete = mock();
// Only exercised through `recordAudit`/`recordIssueAudit` (see
// `features/issues/audit.ts`), now reached by the mutations this file
// tests — not the subject of any test here, just needs to not be
// `undefined` so a real write doesn't throw inside `recordAudit`'s own
// swallowed try/catch.
const mockUserFindUnique = mock(async () => null);
const mockAuditLogCreate = mock(async () => ({}));

// `db.$transaction` in the real mutations either takes a callback (given
// the same `db` this test mocks) or an array of already-built promises —
// both call sites in `features/api-v1/mutations.ts` are covered by mocking
// it as a passthrough rather than picking one shape.
const mockTransaction = mock(
  async (arg: unknown): Promise<unknown> =>
    typeof arg === "function"
      ? arg(db)
      : Promise.all(arg as Promise<unknown>[]),
);

const db = {
  issue: {
    findUnique: mockIssueFindUnique,
    findMany: mockIssueFindMany,
    update: mockIssueUpdate,
    create: mockIssueCreate,
    deleteMany: mockIssueDeleteMany,
  },
  project: {
    findUnique: mockProjectFindUnique,
    update: mockProjectUpdate,
    findMany: mockProjectFindMany,
    create: mockProjectCreate,
    delete: mockProjectDelete,
  },
  comment: {
    findUnique: mockCommentFindUnique,
    findMany: mockCommentFindMany,
    create: mockCommentCreate,
    update: mockCommentUpdate,
    delete: mockCommentDelete,
  },
  label: {
    findUnique: mockLabelFindUnique,
    findMany: mockLabelFindMany,
    create: mockLabelCreate,
    update: mockLabelUpdate,
    delete: mockLabelDelete,
  },
  workspace: {
    findUnique: mockWorkspaceFindUnique,
    create: mockWorkspaceCreate,
    update: mockWorkspaceUpdate,
    delete: mockWorkspaceDelete,
  },
  // `createIssueForUser` asks whether the initial status closes the issue
  // (its category, BARY-161) — `null` = unknown id = open.
  status: {
    findUnique: mock(async () => null),
    // `statusCategory` on every issue (BARY-172).
    findMany: mock(async () => [{ id: "todo", category: "unstarted" }]),
  },
  issueStatusEvent: { create: mock(async () => ({})) },
  workspaceStatus: {
    createMany: mockWorkspaceStatusCreateMany,
    findMany: mockWorkspaceStatusFindMany,
  },
  // Saved views in the API (BARY-172).
  savedView: {
    findMany: mockViewFindMany,
    findUnique: mockViewFindUnique,
    create: mockViewCreate,
    update: mockViewUpdate,
    delete: mockViewDelete,
    aggregate: mock(async () => ({ _max: { position: 1 } })),
  },
  workspacePriority: {
    createMany: mockWorkspacePriorityCreateMany,
    findMany: mockWorkspacePriorityFindMany,
  },
  workspaceIssueType: {
    createMany: mockWorkspaceIssueTypeCreateMany,
    findMany: mockWorkspaceIssueTypeFindMany,
  },
  workspaceMember: {
    findMany: mockWorkspaceMemberFindMany,
    create: mockWorkspaceMemberCreate,
  },
  projectMember: {
    createMany: mockProjectMemberCreateMany,
    findMany: mockProjectMemberFindMany,
  },
  user: { findUnique: mockUserFindUnique },
  auditLog: { create: mockAuditLogCreate },
  $transaction: mockTransaction,
};

mock.module("@/lib/db", () => ({ db }));

const mockGetSystemSettings = mock(async () => ({
  allowWorkspaceCreation: true,
  defaultWorkspaceId: null as string | null,
}));
mock.module("@/lib/system-settings", () => ({
  getSystemSettings: mockGetSystemSettings,
  canCreateWorkspace: (s: {
    allowWorkspaceCreation: boolean;
    defaultWorkspaceId: string | null;
  }) => s.allowWorkspaceCreation || !s.defaultWorkspaceId,
}));

import {
  DELETE as deleteComment,
  PATCH as patchComment,
} from "@/app/api/v1/comments/[id]/route";
import {
  GET as getComments,
  POST as postComment,
} from "@/app/api/v1/issues/[id]/comments/route";
import {
  GET as getIssue,
  PATCH as patchIssue,
} from "@/app/api/v1/issues/[id]/route";
import {
  DELETE as deleteLabel,
  PATCH as patchLabel,
} from "@/app/api/v1/labels/[id]/route";
import {
  GET as getIssues,
  POST as postIssue,
} from "@/app/api/v1/projects/[id]/issues/route";
import { GET as getProjectMembers } from "@/app/api/v1/projects/[id]/members/route";
import {
  DELETE as deleteProject,
  PATCH as patchProject,
} from "@/app/api/v1/projects/[id]/route";
import {
  GET as getProjectViews,
  POST as postProjectView,
} from "@/app/api/v1/projects/[id]/views/route";
import { GET as getViewIssues } from "@/app/api/v1/views/[id]/issues/route";
import {
  DELETE as deleteView,
  GET as getView,
  PATCH as patchView,
} from "@/app/api/v1/views/[id]/route";
import { GET as getIssueTypes } from "@/app/api/v1/workspaces/[id]/issue-types/route";
import {
  GET as getLabels,
  POST as postLabel,
} from "@/app/api/v1/workspaces/[id]/labels/route";
import { GET as getWorkspaceMembers } from "@/app/api/v1/workspaces/[id]/members/route";
import { GET as getPriorities } from "@/app/api/v1/workspaces/[id]/priorities/route";
import { POST as postProject } from "@/app/api/v1/workspaces/[id]/projects/route";
import {
  DELETE as deleteWorkspace,
  PATCH as patchWorkspace,
} from "@/app/api/v1/workspaces/[id]/route";
import { GET as getStatuses } from "@/app/api/v1/workspaces/[id]/statuses/route";
import { GET as getWorkspaceViews } from "@/app/api/v1/workspaces/[id]/views/route";
import {
  GET as getWorkspaces,
  POST as postWorkspace,
} from "@/app/api/v1/workspaces/route";

// Read-only across every resource, but no write scope at all — exercises
// the 403 "insufficient_scope" path on every mutating route.
const AUTH_READ_ONLY = {
  userId: "u-1",
  keyId: "k-1",
  scopes: [
    "workspaces:read",
    "projects:read",
    "issues:read",
    "comments:read",
    "labels:read",
  ],
};
// Every scope this API currently defines.
const AUTH_FULL = {
  userId: "u-1",
  keyId: "k-1",
  scopes: [
    "workspaces:read",
    "workspaces:write",
    "projects:read",
    "projects:write",
    "issues:read",
    "issues:write",
    "comments:read",
    "comments:write",
    "labels:read",
    "labels:write",
    "members:read",
  ],
};

function req(body?: unknown): Request {
  return new Request("https://example.com/api/v1", {
    method: body === undefined ? "GET" : "POST",
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const ALLOW_RATE_LIMIT = {
  ok: true,
  info: { limit: 120, remaining: 119, resetAt: Date.now() + 60_000 },
};

function reset() {
  for (const m of [
    mockResolveApiUser,
    mockCan,
    mockCanEnterWorkspace,
    mockCheckRateLimit,
    mockIssueFindUnique,
    mockIssueFindMany,
    mockIssueUpdate,
    mockIssueCreate,
    mockIssueDeleteMany,
    mockProjectFindUnique,
    mockProjectUpdate,
    mockProjectFindMany,
    mockProjectCreate,
    mockProjectDelete,
    mockCommentFindUnique,
    mockCommentFindMany,
    mockCommentCreate,
    mockCommentUpdate,
    mockCommentDelete,
    mockLabelFindUnique,
    mockLabelFindMany,
    mockLabelCreate,
    mockLabelUpdate,
    mockLabelDelete,
    mockWorkspaceFindUnique,
    mockWorkspaceCreate,
    mockWorkspaceUpdate,
    mockWorkspaceDelete,
    mockWorkspaceStatusCreateMany,
    mockWorkspacePriorityCreateMany,
    mockWorkspaceIssueTypeCreateMany,
    mockWorkspaceMemberFindMany,
    mockWorkspaceMemberCreate,
    mockProjectMemberCreateMany,
    mockProjectMemberFindMany,
    mockTransaction,
    mockGetSystemSettings,
    mockWorkspaceStatusFindMany,
    mockWorkspacePriorityFindMany,
    mockWorkspaceIssueTypeFindMany,
    mockViewFindMany,
    mockViewFindUnique,
    mockViewCreate,
    mockViewUpdate,
    mockViewDelete,
  ]) {
    m.mockReset();
  }
  mockCheckRateLimit.mockResolvedValue(ALLOW_RATE_LIMIT);
  mockGetSystemSettings.mockResolvedValue({
    allowWorkspaceCreation: true,
    defaultWorkspaceId: null,
  });
  // `resolveLabels` (`features/api-v1/queries.ts`) always calls this once
  // an issue has any labels — irrelevant to what these tests are about, so
  // it defaults to "resolves to nothing" rather than being set up per test.
  mockLabelFindMany.mockResolvedValue([]);
  // `getIssueForUser`'s ref-lookup fallback (`resolveIssueRef`, BARY-1)
  // calls this whenever the id-first lookup misses — which happens for
  // every "issue doesn't exist" test here, since a plain id like "i-1"
  // *also* happens to match the ref pattern. Empty by default so that
  // fallback resolves to "no match" instead of throwing on an unconfigured
  // mock's `undefined` return.
  mockProjectFindMany.mockResolvedValue([]);
  // Enrollment during project creation (`enrollWorkspaceMembers`, the real
  // `lib/project-membership.ts`) is a no-op with no members — irrelevant to
  // what these tests are about.
  mockWorkspaceMemberFindMany.mockResolvedValue([]);
  mockTransaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? arg(db)
      : Promise.all(arg as Promise<unknown>[]),
  );
}

/** A full `issueSelect`-shaped row (`features/api-v1/queries.ts`) —
 *  `assignee`/`reporter` are relation objects there, not the flat
 *  `assigneeId`/`reporterId` scalars other layers use. `parent`/
 *  `subIssues`/`relationsFrom`/`relationsTo` default to "none" (BARY-1) —
 *  `mapApiIssue` reads them unconditionally, so a fixture without them
 *  would throw on `.map()` over `undefined`. */
function issueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "i-1",
    projectId: "p-1",
    key: 1,
    title: "t",
    status: "backlog",
    priority: 0,
    type: "feature",
    labels: [],
    assignee: null,
    reporter: { id: "u-2", firstName: "Rep", lastName: "Orter" },
    descriptionText: "",
    created: new Date(),
    updated: new Date(),
    closedAt: null,
    project: { id: "p-1", name: "Project", prefix: "PRJ" },
    parent: null,
    subIssues: [],
    relationsFrom: [],
    relationsTo: [],
    ...overrides,
  };
}

/** A full `commentSelect`-shaped row. */
function commentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    issueId: "i-1",
    author: { id: "u-1", firstName: "Actor", lastName: "Person" },
    parentId: null,
    bodyText: "hi",
    created: new Date(),
    updated: null,
    ...overrides,
  };
}

describe("GET /api/v1/workspaces", () => {
  beforeEach(reset);

  it("401s without a valid token", async () => {
    mockResolveApiUser.mockResolvedValue(null);
    const res = await getWorkspaces(req());
    expect(res.status).toBe(401);
  });

  it("200s with a valid token", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    mockWorkspaceMemberFindMany.mockResolvedValue([]);
    const res = await getWorkspaces(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("119");
  });

  it("429s once the key's budget is used up, before the scope check", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    mockCheckRateLimit.mockResolvedValue({
      ok: false,
      info: { limit: 120, remaining: 0, resetAt: Date.now() + 30_000 },
    });
    const res = await getWorkspaces(req());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(mockWorkspaceMemberFindMany).not.toHaveBeenCalled();
  });

  it("403s a key without workspaces:read scope", async () => {
    mockResolveApiUser.mockResolvedValue({
      userId: "u-1",
      keyId: "k-1",
      scopes: ["issues:read"],
    });
    const res = await getWorkspaces(req());
    expect(res.status).toBe(403);
    expect(mockWorkspaceMemberFindMany).not.toHaveBeenCalled();
  });
});

describe("GET/PATCH /api/v1/issues/:id", () => {
  beforeEach(reset);

  it("401s without a valid token", async () => {
    mockResolveApiUser.mockResolvedValue(null);
    const res = await getIssue(req(), params("i-1"));
    expect(res.status).toBe(401);
  });

  it("404s when the issue doesn't exist", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    mockIssueFindUnique.mockResolvedValue(null);
    const res = await getIssue(req(), params("i-1"));
    expect(res.status).toBe(404);
    expect(await res.json()).toBeNull();
  });

  it("404s when can() denies project.view — not 403", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    mockIssueFindUnique.mockResolvedValue(issueRow());
    mockCan.mockResolvedValue(false);
    const res = await getIssue(req(), params("i-1"));
    expect(res.status).toBe(404);
  });

  it("200s with the issue when visible", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    mockIssueFindUnique.mockResolvedValue(issueRow());
    mockCan.mockResolvedValue(true);
    const res = await getIssue(req(), params("i-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ref).toBe("PRJ-1");
    expect(body.data.reporter).toEqual({ id: "u-2", name: "Rep Orter" });
    expect(body.data.project).toEqual({ id: "p-1", name: "Project" });
  });

  it("403s a key without issues:read scope on GET", async () => {
    mockResolveApiUser.mockResolvedValue({
      userId: "u-1",
      keyId: "k-1",
      scopes: ["issues:write"],
    });
    const res = await getIssue(req(), params("i-1"));
    expect(res.status).toBe(403);
    expect(mockIssueFindUnique).not.toHaveBeenCalled();
  });

  it("403s a key without issues:write scope on PATCH", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    const res = await patchIssue(req({ title: "x" }), params("i-1"));
    expect(res.status).toBe(403);
    expect(mockIssueFindUnique).not.toHaveBeenCalled();
  });

  it("422s an invalid PATCH body", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    const res = await patchIssue(
      new Request("https://example.com/api/v1", {
        method: "PATCH",
        body: "not json",
      }),
      params("i-1"),
    );
    expect(res.status).toBe(422);
  });
});

describe("GET/POST /api/v1/projects/:id/issues", () => {
  beforeEach(reset);

  it("401s without a valid token", async () => {
    mockResolveApiUser.mockResolvedValue(null);
    const res = await getIssues(req(), params("p-1"));
    expect(res.status).toBe(401);
  });

  it("404s when can() denies project.view on list", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    mockCan.mockResolvedValue(false);
    const res = await getIssues(req(), params("p-1"));
    expect(res.status).toBe(404);
  });

  it("429s a write past the budget, before the scope check", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCheckRateLimit.mockResolvedValue({
      ok: false,
      info: { limit: 120, remaining: 0, resetAt: Date.now() + 30_000 },
    });
    const res = await postIssue(req({ title: "New" }), params("p-1"));
    expect(res.status).toBe(429);
    expect(mockIssueCreate).not.toHaveBeenCalled();
  });

  it("403s a key without issues:write scope on POST", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    const res = await postIssue(req({ title: "New" }), params("p-1"));
    expect(res.status).toBe(403);
  });

  it("creates an issue for a WRITE-scoped key with issue.create", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCan.mockResolvedValue(true);
    mockProjectUpdate.mockResolvedValue({
      lastIssueKey: 5,
      workspaceId: "ws-1",
    });
    mockIssueCreate.mockResolvedValue({});
    // `createIssueForUser` writes via `db.issue.create` (mocked above,
    // return value unused) and re-fetches the result via
    // `getIssueUnchecked` for the response/webhook payload — this is what
    // that second lookup returns.
    mockIssueFindUnique.mockResolvedValue(
      issueRow({
        key: 5,
        title: "New",
        reporter: { id: "u-1", firstName: "Actor", lastName: "Person" },
      }),
    );

    const res = await postIssue(req({ title: "New" }), params("p-1"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.ref).toBe("PRJ-5");
    expect(body.data.reporter).toEqual({ id: "u-1", name: "Actor Person" });
    expect(mockIssueCreate.mock.calls[0][0].data.reporterId).toBe("u-1");
  });
});

describe("GET/POST /api/v1/issues/:id/comments", () => {
  beforeEach(reset);

  it("401s without a valid token", async () => {
    mockResolveApiUser.mockResolvedValue(null);
    const res = await getComments(req(), params("i-1"));
    expect(res.status).toBe(401);
  });

  it("404s when the issue doesn't exist", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    mockIssueFindUnique.mockResolvedValue(null);
    const res = await getComments(req(), params("i-1"));
    expect(res.status).toBe(404);
  });

  it("403s a key without comments:write scope on POST", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    const res = await postComment(req({ body: "hi" }), params("i-1"));
    expect(res.status).toBe(403);
  });

  it("creates a comment, authored by the token's user", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockIssueFindUnique.mockResolvedValue({
      key: 5,
      title: "Some issue",
      projectId: "p-1",
      project: { workspaceId: "ws-1", prefix: "PRJ" },
    });
    mockCan.mockResolvedValue(true);
    mockCommentCreate.mockResolvedValue({ id: "c-1" });
    // `createCommentForUser` writes via `db.comment.create` (mocked above,
    // return value unused beyond its id) and re-fetches the result via
    // `getCommentUnchecked` for the response/webhook payload.
    mockCommentFindUnique.mockResolvedValue(
      commentRow({
        author: { id: "u-1", firstName: "Actor", lastName: "Person" },
      }),
    );

    const res = await postComment(req({ body: "hi" }), params("i-1"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.author).toEqual({ id: "u-1", name: "Actor Person" });
    expect(mockCommentCreate.mock.calls[0][0].data.authorId).toBe("u-1");
  });
});

describe("PATCH/DELETE /api/v1/comments/:id", () => {
  beforeEach(reset);

  it("401s without a valid token", async () => {
    mockResolveApiUser.mockResolvedValue(null);
    const res = await patchComment(req({ body: "edited" }), params("c-1"));
    expect(res.status).toBe(401);
  });

  it("403s a key without comments:write scope", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    const res = await patchComment(req({ body: "edited" }), params("c-1"));
    expect(res.status).toBe(403);
  });

  it("404s when the comment doesn't exist", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCommentFindUnique.mockResolvedValue(null);
    const res = await patchComment(req({ body: "edited" }), params("c-1"));
    expect(res.status).toBe(404);
  });

  it("404s editing someone else's comment without comment.update.any — not 403", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCommentFindUnique.mockResolvedValue({
      authorId: "u-2",
      issue: { projectId: "p-1" },
    });
    mockCan.mockResolvedValue(false);
    const res = await patchComment(req({ body: "edited" }), params("c-1"));
    expect(res.status).toBe(404);
    expect(mockCommentUpdate).not.toHaveBeenCalled();
  });

  it("updates the caller's own comment", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCommentFindUnique.mockResolvedValue({
      authorId: "u-1",
      issue: { projectId: "p-1", project: { workspaceId: "ws-1" } },
    });
    // Only `comment.update.own` is granted — proves the own-comment path
    // doesn't depend on `comment.update.any`.
    mockCan.mockImplementation(
      async (_userId: string, permission: string) =>
        permission === "comment.update.own",
    );
    mockCommentUpdate.mockResolvedValue({});

    const res = await patchComment(req({ body: "edited" }), params("c-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: "c-1" });
    expect(mockCommentUpdate.mock.calls[0][0].data.bodyText).toBe("edited");
  });

  it("422s an empty body", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCommentFindUnique.mockResolvedValue({
      authorId: "u-1",
      issue: { projectId: "p-1" },
    });
    mockCan.mockResolvedValue(true);
    const res = await patchComment(req({ body: "  " }), params("c-1"));
    expect(res.status).toBe(422);
  });

  it("deletes the caller's own comment", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCommentFindUnique.mockResolvedValue({
      authorId: "u-1",
      issueId: "i-1",
      body: { type: "doc", content: [] },
      issue: {
        key: 5,
        title: "Some issue",
        projectId: "p-1",
        project: { workspaceId: "ws-1", prefix: "PRJ" },
      },
    });
    mockCan.mockImplementation(
      async (_userId: string, permission: string) =>
        permission === "comment.delete.own",
    );
    mockCommentDelete.mockResolvedValue({});

    const res = await deleteComment(req(), params("c-1"));
    expect(res.status).toBe(200);
    expect(mockCommentDelete).toHaveBeenCalledWith({ where: { id: "c-1" } });
  });

  it("404s deleting someone else's comment without comment.delete.any", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCommentFindUnique.mockResolvedValue({
      authorId: "u-2",
      issue: { projectId: "p-1" },
    });
    mockCan.mockResolvedValue(false);
    const res = await deleteComment(req(), params("c-1"));
    expect(res.status).toBe(404);
    expect(mockCommentDelete).not.toHaveBeenCalled();
  });
});

describe("GET/POST /api/v1/workspaces/:id/labels", () => {
  beforeEach(reset);

  it("401s without a valid token", async () => {
    mockResolveApiUser.mockResolvedValue(null);
    const res = await getLabels(req(), params("ws-1"));
    expect(res.status).toBe(401);
  });

  it("403s a key without labels:read scope on GET", async () => {
    mockResolveApiUser.mockResolvedValue({
      userId: "u-1",
      keyId: "k-1",
      scopes: [],
    });
    const res = await getLabels(req(), params("ws-1"));
    expect(res.status).toBe(403);
    expect(mockCanEnterWorkspace).not.toHaveBeenCalled();
  });

  it("404s when the caller can't enter the workspace", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    mockCanEnterWorkspace.mockResolvedValue(false);
    const res = await getLabels(req(), params("ws-1"));
    expect(res.status).toBe(404);
    expect(mockLabelFindMany).not.toHaveBeenCalled();
  });

  it("200s with the workspace's labels when visible", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    mockCanEnterWorkspace.mockResolvedValue(true);
    mockLabelFindMany.mockResolvedValue([
      {
        id: "l-1",
        name: "bug",
        slug: "bug",
        color: "#e05252",
        projectId: null,
      },
    ]);
    const res = await getLabels(req(), params("ws-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([
      {
        id: "l-1",
        name: "bug",
        slug: "bug",
        color: "#e05252",
        projectId: null,
      },
    ]);
  });

  it("403s a key without labels:write scope on POST", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    const res = await postLabel(
      req({ name: "bug", color: "#e05252" }),
      params("ws-1"),
    );
    expect(res.status).toBe(403);
  });

  it("422s an empty name", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    const res = await postLabel(
      req({ name: "  ", color: "#e05252" }),
      params("ws-1"),
    );
    expect(res.status).toBe(422);
  });

  it("creates a workspace-wide label", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCan.mockResolvedValue(true);
    mockLabelFindUnique.mockResolvedValue(null); // no slug collision
    mockLabelCreate.mockResolvedValue({
      id: "l-1",
      name: "bug",
      slug: "bug",
      color: "#e05252",
      projectId: null,
    });

    const res = await postLabel(
      req({ name: "bug", color: "#e05252" }),
      params("ws-1"),
    );
    expect(res.status).toBe(201);
    expect(mockLabelCreate.mock.calls[0][0].data.workspace).toEqual({
      connect: { id: "ws-1" },
    });
  });

  it("404s a project-scoped label when the project doesn't exist", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockProjectFindUnique.mockResolvedValue(null);
    const res = await postLabel(
      req({ name: "bug", color: "#e05252", projectId: "p-1" }),
      params("ws-1"),
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH/DELETE /api/v1/labels/:id", () => {
  beforeEach(reset);

  it("401s without a valid token", async () => {
    mockResolveApiUser.mockResolvedValue(null);
    const res = await patchLabel(req({ name: "x" }), params("l-1"));
    expect(res.status).toBe(401);
  });

  it("403s a key without labels:write scope", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    const res = await patchLabel(req({ name: "x" }), params("l-1"));
    expect(res.status).toBe(403);
  });

  it("404s when the label doesn't exist", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockLabelFindUnique.mockResolvedValue(null);
    const res = await patchLabel(req({ name: "x" }), params("l-1"));
    expect(res.status).toBe(404);
  });

  it("404s when can() denies label.update — not 403", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockLabelFindUnique.mockResolvedValue({
      id: "l-1",
      name: "bug",
      workspaceId: "ws-1",
      projectId: null,
    });
    mockCan.mockResolvedValue(false);
    const res = await patchLabel(req({ name: "x" }), params("l-1"));
    expect(res.status).toBe(404);
  });

  it("updates a label", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockLabelFindUnique.mockResolvedValue({
      id: "l-1",
      name: "bug",
      workspaceId: "ws-1",
      projectId: null,
    });
    mockCan.mockResolvedValue(true);
    mockLabelUpdate.mockResolvedValue({});
    const res = await patchLabel(req({ name: "critical" }), params("l-1"));
    expect(res.status).toBe(200);
    expect(mockLabelUpdate.mock.calls[0][0].data).toEqual({ name: "critical" });
  });

  it("deletes a label and scrubs it from tagged issues", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockLabelFindUnique.mockResolvedValue({
      id: "l-1",
      name: "bug",
      workspaceId: "ws-1",
      projectId: null,
    });
    mockCan.mockResolvedValue(true);
    mockIssueFindMany.mockResolvedValue([
      { id: "i-1", labels: ["l-1", "l-2"] },
    ]);
    mockIssueUpdate.mockResolvedValue({});
    mockLabelDelete.mockResolvedValue({});

    const res = await deleteLabel(req(), params("l-1"));
    expect(res.status).toBe(200);
    expect(mockIssueUpdate.mock.calls[0][0].data.labels).toEqual(["l-2"]);
  });
});

describe("POST /api/v1/workspaces and PATCH/DELETE /:id", () => {
  beforeEach(reset);

  it("401s without a valid token", async () => {
    mockResolveApiUser.mockResolvedValue(null);
    const res = await postWorkspace(req({ name: "Acme", slug: "acme" }));
    expect(res.status).toBe(401);
  });

  it("403s a key without workspaces:write scope", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    const res = await postWorkspace(req({ name: "Acme", slug: "acme" }));
    expect(res.status).toBe(403);
  });

  it("422s a missing slug", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    const res = await postWorkspace(req({ name: "Acme" }));
    expect(res.status).toBe(422);
  });

  it("403s when workspace creation is disabled platform-wide", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockGetSystemSettings.mockResolvedValue({
      allowWorkspaceCreation: false,
      defaultWorkspaceId: "acme",
    });
    const res = await postWorkspace(req({ name: "Acme", slug: "acme" }));
    expect(res.status).toBe(403);
    expect(mockWorkspaceCreate).not.toHaveBeenCalled();
  });

  it("creates a workspace and enrolls the caller as owner", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockWorkspaceFindUnique.mockResolvedValue(null); // slug is free
    mockWorkspaceCreate.mockResolvedValue({});

    const res = await postWorkspace(req({ name: "Acme", slug: "acme" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toEqual({
      id: "acme",
      name: "Acme",
      color: "#6e63e6",
      avatarUrl: null,
    });
    expect(mockWorkspaceMemberCreate.mock.calls[0][0].data.userId).toBe("u-1");
  });

  it("404s a PATCH when can() denies workspace.update — not 403", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCan.mockResolvedValue(false);
    const res = await patchWorkspace(req({ name: "New" }), params("ws-1"));
    expect(res.status).toBe(404);
  });

  it("updates a workspace", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCan.mockResolvedValue(true);
    mockWorkspaceUpdate.mockResolvedValue({});
    const res = await patchWorkspace(req({ name: "New" }), params("ws-1"));
    expect(res.status).toBe(200);
  });

  it("deletes a workspace", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCan.mockResolvedValue(true);
    const res = await deleteWorkspace(req(), params("ws-1"));
    expect(res.status).toBe(200);
    expect(mockIssueDeleteMany).toHaveBeenCalled();
  });

  it("404s a DELETE when can() denies workspace.delete", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCan.mockResolvedValue(false);
    const res = await deleteWorkspace(req(), params("ws-1"));
    expect(res.status).toBe(404);
    expect(mockIssueDeleteMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/workspaces/:id/projects and PATCH/DELETE /projects/:id", () => {
  beforeEach(reset);

  it("401s without a valid token", async () => {
    mockResolveApiUser.mockResolvedValue(null);
    const res = await postProject(
      req({ name: "Website", color: "#3b7bd5" }),
      params("ws-1"),
    );
    expect(res.status).toBe(401);
  });

  it("403s a key without projects:write scope", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_READ_ONLY);
    const res = await postProject(
      req({ name: "Website", color: "#3b7bd5" }),
      params("ws-1"),
    );
    expect(res.status).toBe(403);
  });

  it("404s when can() denies project.create — not 403", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCan.mockResolvedValue(false);
    const res = await postProject(
      req({ name: "Website", color: "#3b7bd5" }),
      params("ws-1"),
    );
    expect(res.status).toBe(404);
  });

  it("422s an empty name", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCan.mockResolvedValue(true);
    const res = await postProject(
      req({ name: "  ", color: "#3b7bd5" }),
      params("ws-1"),
    );
    expect(res.status).toBe(422);
  });

  it("creates a project", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCan.mockResolvedValue(true);
    mockProjectFindUnique.mockResolvedValue(null); // prefix/slug are free
    mockProjectCreate.mockResolvedValue({});

    const res = await postProject(
      req({ name: "Website Relaunch", color: "#3b7bd5" }),
      params("ws-1"),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.prefix).toBe("WEBS");
    expect(body.data.name).toBe("Website Relaunch");
  });

  it("updates a project", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockProjectFindUnique.mockResolvedValue({ workspaceId: "ws-1" });
    mockCan.mockResolvedValue(true);
    mockProjectUpdate.mockResolvedValue({ id: "p-1", workspaceId: "ws-1" });
    const res = await patchProject(req({ name: "New" }), params("p-1"));
    expect(res.status).toBe(200);
  });

  it("404s a PATCH when the project doesn't exist", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockProjectFindUnique.mockResolvedValue(null);
    const res = await patchProject(req({ name: "New" }), params("p-1"));
    expect(res.status).toBe(404);
  });

  it("deletes a project", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCan.mockResolvedValue(true);
    const res = await deleteProject(req(), params("p-1"));
    expect(res.status).toBe(200);
    expect(mockIssueDeleteMany).toHaveBeenCalled();
  });
});

describe("GET /api/v1/workspaces/:id/members", () => {
  beforeEach(reset);

  it("401s without a valid token", async () => {
    mockResolveApiUser.mockResolvedValue(null);
    const res = await getWorkspaceMembers(req(), params("ws-1"));
    expect(res.status).toBe(401);
  });

  it("403s a key without members:read scope", async () => {
    mockResolveApiUser.mockResolvedValue({
      userId: "u-1",
      keyId: "k-1",
      scopes: [],
    });
    const res = await getWorkspaceMembers(req(), params("ws-1"));
    expect(res.status).toBe(403);
    expect(mockCanEnterWorkspace).not.toHaveBeenCalled();
  });

  it("404s when the caller can't enter the workspace", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCanEnterWorkspace.mockResolvedValue(false);
    const res = await getWorkspaceMembers(req(), params("ws-1"));
    expect(res.status).toBe(404);
  });

  it("200s with the workspace's members when visible", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCanEnterWorkspace.mockResolvedValue(true);
    mockWorkspaceMemberFindMany.mockResolvedValue([
      {
        user: {
          id: "u-2",
          firstName: "Priya",
          lastName: "Shah",
          email: "priya@example.com",
          handle: "priya",
        },
        role: { key: "admin" },
      },
    ]);
    const res = await getWorkspaceMembers(req(), params("ws-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([
      {
        id: "u-2",
        name: "Priya Shah",
        email: "priya@example.com",
        handle: "priya",
        role: "admin",
      },
    ]);
  });
});

describe("GET /api/v1/projects/:id/members", () => {
  beforeEach(reset);

  it("401s without a valid token", async () => {
    mockResolveApiUser.mockResolvedValue(null);
    const res = await getProjectMembers(req(), params("p-1"));
    expect(res.status).toBe(401);
  });

  it("403s a key without members:read scope", async () => {
    mockResolveApiUser.mockResolvedValue({
      userId: "u-1",
      keyId: "k-1",
      scopes: [],
    });
    const res = await getProjectMembers(req(), params("p-1"));
    expect(res.status).toBe(403);
    expect(mockCan).not.toHaveBeenCalled();
  });

  it("404s when the caller can't view the project", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCan.mockResolvedValue(false);
    const res = await getProjectMembers(req(), params("p-1"));
    expect(res.status).toBe(404);
  });

  it("200s with the project's members when visible", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    mockCan.mockResolvedValue(true);
    mockProjectMemberFindMany.mockResolvedValue([
      {
        user: {
          id: "u-2",
          firstName: "Priya",
          lastName: "Shah",
          email: "priya@example.com",
          handle: "priya",
        },
        role: { key: "contributor" },
      },
    ]);
    const res = await getProjectMembers(req(), params("p-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([
      {
        id: "u-2",
        name: "Priya Shah",
        email: "priya@example.com",
        handle: "priya",
        role: "contributor",
      },
    ]);
  });
});

// ─── Views and statuses (BARY-172) ───────────────────────────────────────────

const AUTH_VIEWS = {
  userId: "u-1",
  keyId: "k-1",
  scopes: ["views:read", "views:write", "issues:read", "workspaces:read"],
};

/** A `viewSelect`-shaped row (`features/api-v1/views.ts`). */
function viewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "v-1",
    name: "Urgent",
    slug: "urgent",
    systemKey: null,
    workspaceId: "ws-1",
    projectId: "p-1",
    ownerId: "u-1",
    visibility: "PRIVATE",
    layout: "list",
    icon: null,
    color: null,
    filter: { op: "and", rules: [] },
    groupBy: null,
    subGroupBy: null,
    sortBy: "manual",
    sortDir: "asc",
    createdAt: new Date(),
    updatedAt: new Date(),
    project: { id: "p-1", name: "Project" },
    owner: {
      id: "u-1",
      firstName: "Actor",
      lastName: "Person",
      handle: "actor",
    },
    userStates: [],
    ...overrides,
  };
}

/** `can()` for views: sees the project; `view.share`/`view.manage` as
 *  given. */
function allow({ share = false, manage = false } = {}) {
  mockCan.mockImplementation(async (_user: string, permission: string) =>
    permission === "view.share"
      ? share
      : permission === "view.manage"
        ? manage
        : true,
  );
  mockCanEnterWorkspace.mockResolvedValue(true);
}

function patchReq(body: unknown): Request {
  return new Request("https://example.com/api/v1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("GET /api/v1/projects/:id/views", () => {
  beforeEach(reset);

  it("403s a key without views:read", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_FULL);
    const res = await getProjectViews(req(), params("p-1"));
    expect(res.status).toBe(403);
  });

  it("404s without project.view", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    mockCan.mockResolvedValue(false);
    const res = await getProjectViews(req(), params("p-1"));
    expect(res.status).toBe(404);
  });

  it("lists shared views and only the caller's own private ones", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    allow();
    mockProjectFindUnique.mockResolvedValue({ workspaceId: "ws-1" });
    mockViewFindMany.mockResolvedValue([
      viewRow({ id: "mine" }),
      viewRow({ id: "theirs", ownerId: "u-2" }),
      viewRow({ id: "shared", ownerId: "u-2", visibility: "PROJECT" }),
    ]);
    const res = await getProjectViews(req(), params("p-1"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.map((v: { id: string }) => v.id)).toEqual(["mine", "shared"]);
    // Someone else's shared view: visible, not editable without view.manage.
    expect(data[0].canEdit).toBe(true);
    expect(data[1].canEdit).toBe(false);
    expect(data[1].owner).toEqual({
      id: "u-1",
      name: "Actor Person",
      handle: "actor",
    });
  });
});

describe("GET /api/v1/workspaces/:id/views", () => {
  beforeEach(reset);

  it("includes the built-in views under their English names", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    allow();
    mockViewFindMany.mockImplementation(
      async (args: { where: { systemKey?: unknown } }) =>
        args.where.systemKey
          ? // `ensureSystemViews`: both exist already, nothing to create.
            [
              { systemKey: "my-issues", slug: "my-issues" },
              { systemKey: "created-by-me", slug: "created-by-me" },
            ]
          : [
              viewRow({
                id: "sys",
                systemKey: "my-issues",
                name: "my-issues",
                ownerId: null,
                owner: null,
                projectId: null,
                project: null,
                visibility: "WORKSPACE",
              }),
            ],
    );
    const res = await getWorkspaceViews(req(), params("ws-1"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data[0]).toMatchObject({
      name: "My issues",
      systemKey: "my-issues",
      project: null,
      canEdit: false,
    });
    expect(mockViewCreate).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/views/:id/issues", () => {
  beforeEach(reset);

  it("needs issues:read as well as views:read", async () => {
    mockResolveApiUser.mockResolvedValue({
      ...AUTH_VIEWS,
      scopes: ["views:read"],
    });
    const res = await getViewIssues(req(), params("v-1"));
    expect(res.status).toBe(403);
  });

  it("404s a private view of someone else", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    allow();
    mockViewFindUnique.mockResolvedValue(viewRow({ ownerId: "u-2" }));
    const res = await getViewIssues(req(), params("v-1"));
    expect(res.status).toBe(404);
  });

  it("applies the view's filter with the caller's @me, in its project", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    allow();
    mockViewFindUnique.mockResolvedValue(
      viewRow({
        filter: {
          op: "and",
          rules: [{ field: "assignee", is: "any", value: ["@me"] }],
        },
      }),
    );
    mockIssueFindMany.mockResolvedValue([issueRow()]);
    const res = await getViewIssues(req(), params("v-1"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data[0].statusCategory).toBeNull();
    const where = JSON.stringify(mockIssueFindMany.mock.calls[0][0].where);
    expect(where).toContain('"u-1"');
    expect(where).not.toContain("@me");
    expect(where).toContain('"projectId":"p-1"');
  });

  it("a built-in view keeps its fixed condition", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    allow();
    mockViewFindUnique.mockResolvedValue(
      viewRow({
        systemKey: "created-by-me",
        ownerId: null,
        owner: null,
        projectId: null,
        project: null,
        visibility: "WORKSPACE",
      }),
    );
    // No visible project: nothing to ask the database for.
    const res = await getViewIssues(req(), params("v-1"));
    expect((await res.json()).data).toEqual([]);
    expect(mockIssueFindMany).not.toHaveBeenCalled();
  });
});

describe("PATCH/DELETE /api/v1/views/:id", () => {
  beforeEach(reset);

  it("403s a shared view someone else made", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    allow({ share: true });
    mockViewFindUnique.mockResolvedValue(
      viewRow({ ownerId: "u-2", visibility: "PROJECT" }),
    );
    const res = await patchView(patchReq({ name: "Mine now" }), params("v-1"));
    expect(res.status).toBe(403);
    expect(mockViewUpdate).not.toHaveBeenCalled();
  });

  it("changes the caller's own view", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    allow();
    mockViewFindUnique.mockResolvedValue(viewRow());
    mockViewUpdate.mockResolvedValue(viewRow({ name: "Renamed" }));
    const res = await patchView(patchReq({ name: "Renamed" }), params("v-1"));
    expect(res.status).toBe(200);
    expect(mockViewUpdate.mock.calls[0][0].data).toEqual({ name: "Renamed" });
  });

  it("422s an invalid change", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    allow();
    const res = await patchView(patchReq({ layout: "kanban" }), params("v-1"));
    expect(res.status).toBe(422);
  });

  it("can't delete a built-in view", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    allow({ manage: true });
    mockViewFindUnique.mockResolvedValue(
      viewRow({
        systemKey: "my-issues",
        ownerId: null,
        visibility: "WORKSPACE",
        projectId: null,
      }),
    );
    const res = await deleteView(
      new Request("https://example.com", { method: "DELETE" }),
      params("v-1"),
    );
    expect(res.status).toBe(403);
    expect(mockViewDelete).not.toHaveBeenCalled();
  });

  it("GET 404s an unknown view", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    mockViewFindUnique.mockResolvedValue(null);
    const res = await getView(req(), params("nope"));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/projects/:id/views", () => {
  beforeEach(reset);

  it("creates a private view in the path's project", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    allow();
    mockProjectFindUnique.mockResolvedValue({ workspaceId: "ws-1" });
    mockViewFindUnique.mockResolvedValueOnce(null); // slug is free
    mockViewCreate.mockResolvedValue(viewRow());
    mockViewFindUnique.mockResolvedValue(viewRow());
    const res = await postProjectView(
      req({ name: "Urgent", layout: "list", projectId: "elsewhere" }),
      params("p-1"),
    );
    expect(res.status).toBe(201);
    const data = mockViewCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      projectId: "p-1",
      workspaceId: "ws-1",
      ownerId: "u-1",
      visibility: "PRIVATE",
    });
  });

  it("403s sharing without view.share", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    allow();
    mockProjectFindUnique.mockResolvedValue({ workspaceId: "ws-1" });
    const res = await postProjectView(
      req({ name: "Team", layout: "list", visibility: "PROJECT" }),
      params("p-1"),
    );
    expect(res.status).toBe(403);
    expect(mockViewCreate).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/projects/:id/issues?filter=", () => {
  beforeEach(reset);

  it("422s a filter that isn't a valid tree", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    mockCan.mockResolvedValue(true);
    const res = await getIssues(
      new Request("https://example.com/api/v1?filter=%7Bnope"),
      params("p-1"),
    );
    expect(res.status).toBe(422);
  });

  it("narrows by a filter tree", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    mockCan.mockResolvedValue(true);
    mockIssueFindMany.mockResolvedValue([]);
    const filter = encodeURIComponent(
      JSON.stringify({
        op: "and",
        rules: [{ field: "priority", is: "gte", value: 3 }],
      }),
    );
    const res = await getIssues(
      new Request(`https://example.com/api/v1?filter=${filter}`),
      params("p-1"),
    );
    expect(res.status).toBe(200);
    const where = mockIssueFindMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"priority":{"gte":3}');
    expect(where.projectId).toBe("p-1");
  });
});

describe("GET /api/v1/workspaces/:id/statuses", () => {
  beforeEach(reset);

  it("lists statuses with their categories in board order", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    mockCanEnterWorkspace.mockResolvedValue(true);
    const status = (id: string, category: string, position: number) => ({
      status: {
        id,
        name: id,
        short: id,
        color: "#888888",
        category,
        isColumn: true,
        position,
      },
    });
    mockWorkspaceStatusFindMany.mockResolvedValue([
      status("done", "completed", 3),
      status("todo", "unstarted", 1),
    ]);
    const res = await getStatuses(req(), params("ws-1"));
    const { data } = await res.json();
    expect(data.map((s: { id: string }) => s.id)).toEqual(["todo", "done"]);
    expect(data[0].category).toBe("unstarted");
  });

  it("404s outside the workspace", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    mockCanEnterWorkspace.mockResolvedValue(false);
    const res = await getStatuses(req(), params("ws-1"));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/workspaces/:id/priorities and /issue-types", () => {
  beforeEach(reset);

  it("lists the priorities in order, with the id that priority takes", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    mockCanEnterWorkspace.mockResolvedValue(true);
    const row = (id: number, key: string, position: number) => ({
      priority: { id, key, name: key, color: "#888888", position },
    });
    mockWorkspacePriorityFindMany.mockResolvedValue([
      row(3, "high", 3),
      row(1, "low", 1),
    ]);
    const res = await getPriorities(req(), params("ws-1"));
    const { data } = await res.json();
    expect(data.map((p: { id: number }) => p.id)).toEqual([1, 3]);
    expect(data[0].key).toBe("low");
  });

  it("lists the issue types in order", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    mockCanEnterWorkspace.mockResolvedValue(true);
    const row = (id: string, position: number) => ({
      issueType: { id, name: id, color: "#888888", position },
    });
    mockWorkspaceIssueTypeFindMany.mockResolvedValue([
      row("bug", 2),
      row("feature", 1),
    ]);
    const res = await getIssueTypes(req(), params("ws-1"));
    const { data } = await res.json();
    expect(data.map((t: { id: string }) => t.id)).toEqual(["feature", "bug"]);
  });

  it("404s both outside the workspace", async () => {
    mockResolveApiUser.mockResolvedValue(AUTH_VIEWS);
    mockCanEnterWorkspace.mockResolvedValue(false);
    expect((await getPriorities(req(), params("ws-1"))).status).toBe(404);
    expect((await getIssueTypes(req(), params("ws-1"))).status).toBe(404);
  });
});
