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
const mockWorkspaceIssueTypeCreateMany = mock();
const mockWorkspaceMemberFindMany = mock();
const mockWorkspaceMemberCreate = mock();
const mockProjectMemberCreateMany = mock();

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
  workspaceStatus: { createMany: mockWorkspaceStatusCreateMany },
  workspacePriority: { createMany: mockWorkspacePriorityCreateMany },
  workspaceIssueType: { createMany: mockWorkspaceIssueTypeCreateMany },
  workspaceMember: {
    findMany: mockWorkspaceMemberFindMany,
    create: mockWorkspaceMemberCreate,
  },
  projectMember: { createMany: mockProjectMemberCreateMany },
  $transaction: mockTransaction,
};

mock.module("@/lib/db", () => ({ db }));

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
import {
  DELETE as deleteProject,
  PATCH as patchProject,
} from "@/app/api/v1/projects/[id]/route";
import {
  GET as getLabels,
  POST as postLabel,
} from "@/app/api/v1/workspaces/[id]/labels/route";
import { POST as postProject } from "@/app/api/v1/workspaces/[id]/projects/route";
import {
  DELETE as deleteWorkspace,
  PATCH as patchWorkspace,
} from "@/app/api/v1/workspaces/[id]/route";
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
    mockTransaction,
  ]) {
    m.mockReset();
  }
  mockCheckRateLimit.mockResolvedValue(ALLOW_RATE_LIMIT);
  // `resolveLabels` (`features/api-v1/queries.ts`) always calls this once
  // an issue has any labels — irrelevant to what these tests are about, so
  // it defaults to "resolves to nothing" rather than being set up per test.
  mockLabelFindMany.mockResolvedValue([]);
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
 *  `assigneeId`/`reporterId` scalars other layers use. */
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
      projectId: "p-1",
      project: { workspaceId: "ws-1" },
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
      issue: { projectId: "p-1" },
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
      issue: { projectId: "p-1" },
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
