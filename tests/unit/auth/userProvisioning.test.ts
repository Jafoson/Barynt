import { beforeEach, describe, expect, it, mock } from "bun:test";

// `@/lib/project-membership` is deliberately left unmocked: `projectMembership.test.ts`
// and `projectMembers.test.ts` run in the same process (see CLAUDE.md) and
// rely on the real `enrollInWorkspaceProjects` — a mock here would win for
// the rest of the process and make both test the wrong thing.
const mockWorkspaceDomainFindUnique = mock();
const mockWorkspaceMemberCreate = mock();
const mockWorkspaceMemberFindUnique = mock();
const mockProjectFindMany = mock();
const mockProjectMemberCreateMany = mock();
const mockUserCount = mock();

const tx = {
  workspaceDomain: { findUnique: mockWorkspaceDomainFindUnique },
  workspaceMember: {
    create: mockWorkspaceMemberCreate,
    findUnique: mockWorkspaceMemberFindUnique,
  },
  project: { findMany: mockProjectFindMany },
  projectMember: { createMany: mockProjectMemberCreateMany },
  user: { count: mockUserCount },
  // biome-ignore lint/suspicious/noExplicitAny: test double for Prisma.TransactionClient
} as any;

import { isFirstAccount, provisionNewUser } from "@/lib/user-provisioning";

describe("provisionNewUser()", () => {
  beforeEach(() => {
    for (const m of [
      mockWorkspaceDomainFindUnique,
      mockWorkspaceMemberCreate,
      mockWorkspaceMemberFindUnique,
      mockProjectFindMany,
      mockProjectMemberCreateMany,
    ]) {
      m.mockReset();
    }
    mockWorkspaceMemberCreate.mockResolvedValue({});
    // `enrollInWorkspaceProjects` runs for real, but finds nothing to enroll
    // here — the membership itself is already proven above via
    // `workspaceMember.create`.
    mockWorkspaceMemberFindUnique.mockResolvedValue(null);
    mockProjectFindMany.mockResolvedValue([]);
  });

  it("joins automatically when the domain is claimed", async () => {
    mockWorkspaceDomainFindUnique.mockResolvedValue({ workspaceId: "acme" });

    await provisionNewUser(tx, { userId: "u-new", email: "new@acme.com" });

    expect(mockWorkspaceDomainFindUnique).toHaveBeenCalledWith({
      where: { domain: "acme.com" },
      select: { workspaceId: true },
    });
    expect(mockWorkspaceMemberCreate.mock.calls[0][0].data).toMatchObject({
      workspaceId: "acme",
      userId: "u-new",
      pending: false,
    });
    // Proves that `enrollInWorkspaceProjects` (real, not mocked) ran for
    // exactly this workspace.
    expect(mockProjectFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "acme", visibility: "public" },
      select: { id: true },
    });
  });

  it("leaves accounts without a matching domain untouched", async () => {
    mockWorkspaceDomainFindUnique.mockResolvedValue(null);

    await provisionNewUser(tx, { userId: "u-new", email: "new@example.com" });

    expect(mockWorkspaceMemberCreate).not.toHaveBeenCalled();
    expect(mockProjectFindMany).not.toHaveBeenCalled();
  });
});

describe("isFirstAccount()", () => {
  beforeEach(() => {
    mockUserCount.mockReset();
  });

  it("is true when no account exists yet — the fresh-instance bootstrap case", async () => {
    mockUserCount.mockResolvedValue(0);
    expect(await isFirstAccount(tx)).toBe(true);
  });

  it("is false once at least one account exists", async () => {
    mockUserCount.mockResolvedValue(1);
    expect(await isFirstAccount(tx)).toBe(false);
  });
});
