import { beforeEach, describe, expect, it, mock } from "bun:test";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const ACTOR = "u-actor";
const ISSUE_ID = "i1";

const mockIssueFindUnique = mock();
const mockCommentFindUnique = mock();
const mockCommentCreate = mock();
const mockCommentUpdate = mock();
const mockCommentReactionCreate = mock();
const mockCommentReactionDelete = mock();

mock.module("@/lib/db", () => ({
  db: {
    issue: { findUnique: mockIssueFindUnique },
    comment: {
      findUnique: mockCommentFindUnique,
      create: mockCommentCreate,
      update: mockCommentUpdate,
    },
    commentReaction: {
      create: mockCommentReactionCreate,
      delete: mockCommentReactionDelete,
    },
  },
}));

const mockRequirePermission = mock(async () => ACTOR);
const mockRequirePermissionOr = mock(async () => ACTOR);
class MockPermissionError extends Error {}
mock.module("@/lib/permissions", () => ({
  requirePermission: mockRequirePermission,
  requirePermissionOr: mockRequirePermissionOr,
  PermissionError: MockPermissionError,
}));

// Not the real `notify()` — that would need `db.userPreferences`, which the
// `@/lib/db` mock above doesn't know about. This only tests *who* gets
// notified for a reply (`commentReply` to the parent author instead of the
// generic `comment` row), not the sending itself — that's covered by
// `tests/unit/notifications/notify.test.ts`, in its own process.
const mockNotify = mock();
mock.module("@/lib/notify", () => ({ notify: mockNotify }));

mock.module("next/cache", () => ({ revalidatePath: mock() }));

import {
  addComment,
  toggleCommentReaction,
  updateComment,
} from "@/features/issues/actions";
import { Prisma } from "@/lib/generated/prisma/client";
import { emptyDoc } from "@/lib/richtext/doc";

/** The state of an issue, as `addComment` reads it for recipients/context.
 *  Reporter = actor and no assignee, so no `notify()` call is triggered
 *  — its own behavior has its own test file. */
function issueRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    projectId: "p1",
    assigneeId: null,
    reporterId: ACTOR,
    project: { workspaceId: "ws1" },
    ...overrides,
  };
}

function reset() {
  for (const m of [
    mockIssueFindUnique,
    mockCommentFindUnique,
    mockCommentCreate,
    mockCommentUpdate,
    mockCommentReactionCreate,
    mockCommentReactionDelete,
    mockRequirePermission,
    mockRequirePermissionOr,
    mockNotify,
  ]) {
    m.mockReset();
  }
  mockIssueFindUnique.mockResolvedValue(issueRow());
  mockRequirePermission.mockResolvedValue(ACTOR);
  mockRequirePermissionOr.mockResolvedValue(ACTOR);
  mockCommentCreate.mockResolvedValue({ id: "c-new" });
  // Base fallback for `db.comment.findUnique` — `addComment` calls this
  // twice when replying: once for the parent-comment tamper check (tests
  // below override that call specifically via `mockResolvedValueOnce`),
  // and always a second time via `getCommentUnchecked` to build the
  // `comment.created` webhook payload, which needs a full row incl.
  // `author` — this is what that second call falls back to.
  mockCommentFindUnique.mockResolvedValue({
    id: "c-new",
    issueId: ISSUE_ID,
    authorId: ACTOR,
    parentId: null,
    bodyText: "",
    created: new Date(),
    updated: null,
    author: { id: ACTOR, firstName: "Actor", lastName: "Person" },
  });
}

describe("addComment() — Replies", () => {
  beforeEach(reset);

  it("sets parentId when the parent comment belongs to the same issue", async () => {
    mockCommentFindUnique.mockResolvedValueOnce({ issueId: ISSUE_ID });

    await addComment(ISSUE_ID, emptyDoc(), ACTOR, "c-parent");

    expect(mockCommentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        issueId: ISSUE_ID,
        authorId: ACTOR,
        parentId: "c-parent",
      }),
    });
  });

  it("rejects a reply to a comment on another issue", async () => {
    mockCommentFindUnique.mockResolvedValue({ issueId: "i-other" });

    await expect(
      addComment(ISSUE_ID, emptyDoc(), ACTOR, "c-parent"),
    ).rejects.toThrow();
    expect(mockCommentCreate).not.toHaveBeenCalled();
  });

  it("rejects when the given parent comment doesn't exist at all", async () => {
    mockCommentFindUnique.mockResolvedValue(null);

    await expect(
      addComment(ISSUE_ID, emptyDoc(), ACTOR, "c-missing"),
    ).rejects.toThrow();
    expect(mockCommentCreate).not.toHaveBeenCalled();
  });

  it("omits parentId when none is passed (top-level)", async () => {
    await addComment(ISSUE_ID, emptyDoc(), ACTOR);

    // No parent to tamper-check, but still one call: `getCommentUnchecked`
    // looks the new comment back up to build the `comment.created` webhook
    // payload (`fireWebhookEvent`).
    expect(mockCommentFindUnique).toHaveBeenCalledTimes(1);
    expect(mockCommentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ parentId: undefined }),
    });
  });

  it("notifies the parent author with `commentReply`, not `comment` — even if they happen to be the assignee", async () => {
    // Assignee = parent author: without the exclusion logic in `addComment`,
    // this person would get both notifications for the same reply.
    mockIssueFindUnique.mockResolvedValue(
      issueRow({ assigneeId: "u-parent-author" }),
    );
    mockCommentFindUnique.mockResolvedValueOnce({
      issueId: ISSUE_ID,
      authorId: "u-parent-author",
    });

    await addComment(ISSUE_ID, emptyDoc(), ACTOR, "c-parent");

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-parent-author",
        type: "commentReply",
        actorId: ACTOR,
      }),
    );
    // Exactly one call: the generic "comment" notification to the assignee
    // is skipped, because here they're the same person as the parent author.
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("notifies no one when replying to one's own comment", async () => {
    mockCommentFindUnique.mockResolvedValueOnce({
      issueId: ISSUE_ID,
      authorId: ACTOR,
    });

    await addComment(ISSUE_ID, emptyDoc(), ACTOR, "c-parent");

    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("updateComment() — Editing", () => {
  beforeEach(reset);

  it("checks the same permission as deleteComment, just for update", async () => {
    mockCommentFindUnique.mockResolvedValue({
      authorId: "u-author",
      issue: { projectId: "p1" },
    });

    await updateComment("c1", emptyDoc());

    expect(mockRequirePermissionOr).toHaveBeenCalledWith([
      { permission: "comment.update.any", ctx: { projectId: "p1" } },
      {
        permission: "comment.update.own",
        ctx: { projectId: "p1" },
        ownerIds: ["u-author"],
      },
    ]);
  });

  it("writes body, derived text, and the edited timestamp", async () => {
    mockCommentFindUnique.mockResolvedValue({
      authorId: ACTOR,
      issue: { projectId: "p1" },
    });

    await updateComment("c1", emptyDoc());

    expect(mockCommentUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({
        updated: expect.any(Date),
      }),
    });
  });

  it("rejects when the comment doesn't exist", async () => {
    mockCommentFindUnique.mockResolvedValue(null);

    await expect(updateComment("c-missing", emptyDoc())).rejects.toThrow();
    expect(mockCommentUpdate).not.toHaveBeenCalled();
  });
});

describe("toggleCommentReaction() — Reactions", () => {
  beforeEach(reset);

  it("creates a reaction when none exists yet", async () => {
    mockCommentFindUnique.mockResolvedValue({
      issue: { projectId: "p1" },
    });
    mockCommentReactionCreate.mockResolvedValue({});

    await toggleCommentReaction("c1", "👍");

    expect(mockCommentReactionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        commentId: "c1",
        userId: ACTOR,
        emoji: "👍",
      }),
    });
    expect(mockCommentReactionDelete).not.toHaveBeenCalled();
  });

  it("removes the reaction again when it already exists (P2002)", async () => {
    mockCommentFindUnique.mockResolvedValue({
      issue: { projectId: "p1" },
    });
    mockCommentReactionCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    mockCommentReactionDelete.mockResolvedValue({});

    await toggleCommentReaction("c1", "👍");

    expect(mockCommentReactionDelete).toHaveBeenCalledWith({
      where: {
        commentId_userId_emoji: {
          commentId: "c1",
          userId: ACTOR,
          emoji: "👍",
        },
      },
    });
  });

  it("rethrows other errors unchanged instead of reading them as a toggle", async () => {
    mockCommentFindUnique.mockResolvedValue({
      issue: { projectId: "p1" },
    });
    mockCommentReactionCreate.mockRejectedValue(new Error("connection lost"));

    await expect(toggleCommentReaction("c1", "👍")).rejects.toThrow(
      "connection lost",
    );
    expect(mockCommentReactionDelete).not.toHaveBeenCalled();
  });
});
