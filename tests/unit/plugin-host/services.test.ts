import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// The services a plugin's `boot` gets from the host. They answer for the request
// they are asked in and say `null` outside one, and they never tell a plugin more
// than the signed-in user of that request may see: a workspace only for someone who
// may enter it. Plugin code could reach the session or the database another way,
// because it runs with the app's privileges; these hold to the app's own rules for
// the way the host offers. No real session, no real database.

const mockAuth = mock();
const mockWorkspaceId = mock();
const mockCanEnter = mock();
const mockWorkspaceFind = mock();

mock.module("@/auth", () => ({ auth: mockAuth }));
mock.module("@/lib/permissions", () => ({ canEnterWorkspace: mockCanEnter }));
mock.module("@/lib/db", () => ({
  db: { workspace: { findUnique: mockWorkspaceFind } },
}));

import { getRegistryState } from "@/lib/plugins/registryState";
import { createHostServices } from "@/lib/plugins/services";

// Where `setCurrentWorkspaceId` publishes the reader of the request's workspace.
const READER = Symbol.for("barynt.currentWorkspaceReader");
const holder = globalThis as unknown as Record<symbol, unknown>;

const PLUGIN = { id: "calendar", version: "1.0.0" };
// What the services need of the manifest: its level and what it declares.
const MANIFEST = { scope: "workspace", contributes: {} } as const;

function signedIn(more: Record<string, unknown> = {}) {
  mockAuth.mockResolvedValue({
    user: { id: "u1", firstName: "Mara", lastName: "Velez", ...more },
  });
}

beforeEach(() => {
  for (const m of [
    mockAuth,
    mockWorkspaceId,
    mockCanEnter,
    mockWorkspaceFind,
  ]) {
    m.mockReset();
  }
  mockAuth.mockResolvedValue(null);
  mockWorkspaceId.mockReturnValue(null);
  holder[READER] = mockWorkspaceId;
  mockCanEnter.mockResolvedValue(false);
  mockWorkspaceFind.mockResolvedValue(null);
});

describe("user.current", () => {
  it("is the signed-in user, with the name in one piece", async () => {
    signedIn();
    expect(await createHostServices(PLUGIN, MANIFEST).user.current()).toEqual({
      id: "u1",
      name: "Mara Velez",
    });
  });

  it("uses the account's single name when there is no first and last name", async () => {
    signedIn({ firstName: "", lastName: "", name: "Mara" });
    expect(
      (await createHostServices(PLUGIN, MANIFEST).user.current())?.name,
    ).toBe("Mara");
  });

  it("has an empty name rather than none at all when the account has no name", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    expect(await createHostServices(PLUGIN, MANIFEST).user.current()).toEqual({
      id: "u1",
      name: "",
    });
  });

  it("gives the id and the name and nothing else", async () => {
    signedIn({ email: "mara@example.com", image: "x.png", color: "#fff" });
    const user = await createHostServices(PLUGIN, MANIFEST).user.current();
    expect(Object.keys(user ?? {}).sort()).toEqual(["id", "name"]);
  });

  it.each([
    ["nobody is signed in", null],
    ["the session has no user", {}],
    ["the user has no id", { user: {} }],
    ["the id is empty", { user: { id: "" } }],
  ])("is null when %s", async (_name, session) => {
    mockAuth.mockResolvedValue(session);
    expect(
      await createHostServices(PLUGIN, MANIFEST).user.current(),
    ).toBeNull();
  });

  it("is null, and does not throw, outside a request where there is no session to read", async () => {
    mockAuth.mockRejectedValue(
      new Error("cookies was called outside a request scope"),
    );
    expect(
      await createHostServices(PLUGIN, MANIFEST).user.current(),
    ).toBeNull();
  });
});

describe("workspace.current", () => {
  it("is null outside a workspace, without asking the session or the database", async () => {
    signedIn();
    expect(
      await createHostServices(PLUGIN, MANIFEST).workspace.current(),
    ).toBeNull();
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockWorkspaceFind).not.toHaveBeenCalled();
  });

  it("is the workspace of the request for someone who may enter it", async () => {
    signedIn();
    mockWorkspaceId.mockReturnValue("w1");
    mockCanEnter.mockResolvedValue(true);
    mockWorkspaceFind.mockResolvedValue({
      id: "w1",
      name: "Nimbus",
      secret: "x",
    });
    expect(
      await createHostServices(PLUGIN, MANIFEST).workspace.current(),
    ).toEqual({
      id: "w1",
      name: "Nimbus",
    });
    expect(mockCanEnter).toHaveBeenCalledWith("u1", "w1");
    expect(mockWorkspaceFind).toHaveBeenCalledWith({
      where: { id: "w1" },
      select: { id: true, name: true },
    });
  });

  it("is null for someone who may not enter it, and the database is not asked, so its name cannot leak", async () => {
    signedIn();
    mockWorkspaceId.mockReturnValue("w1");
    mockCanEnter.mockResolvedValue(false);
    expect(
      await createHostServices(PLUGIN, MANIFEST).workspace.current(),
    ).toBeNull();
    expect(mockWorkspaceFind).not.toHaveBeenCalled();
  });

  it("is null when no reader has been published yet, as at server start", async () => {
    delete holder[READER];
    signedIn();
    mockCanEnter.mockResolvedValue(true);
    expect(
      await createHostServices(PLUGIN, MANIFEST).workspace.current(),
    ).toBeNull();
    expect(mockWorkspaceFind).not.toHaveBeenCalled();
  });

  it.each([
    ["something that is not a function", "w1"],
    [
      "a reader that throws",
      () => {
        throw new Error("no request");
      },
    ],
    ["a reader that answers with no text", () => 42],
    ["a reader that answers with an empty text", () => ""],
  ])("is null for %s, and does not throw", async (_name, reader) => {
    holder[READER] = reader;
    signedIn();
    mockCanEnter.mockResolvedValue(true);
    mockWorkspaceFind.mockResolvedValue({ id: "w1", name: "Nimbus" });
    expect(
      await createHostServices(PLUGIN, MANIFEST).workspace.current(),
    ).toBeNull();
    expect(mockWorkspaceFind).not.toHaveBeenCalled();
  });

  it("is null when nobody is signed in, even though a workspace is in the address", async () => {
    mockWorkspaceId.mockReturnValue("w1");
    mockCanEnter.mockResolvedValue(true);
    expect(
      await createHostServices(PLUGIN, MANIFEST).workspace.current(),
    ).toBeNull();
    expect(mockCanEnter).not.toHaveBeenCalled();
    expect(mockWorkspaceFind).not.toHaveBeenCalled();
  });

  it("is null for a workspace that does not exist", async () => {
    signedIn();
    mockWorkspaceId.mockReturnValue("w1");
    mockCanEnter.mockResolvedValue(true);
    mockWorkspaceFind.mockResolvedValue(null);
    expect(
      await createHostServices(PLUGIN, MANIFEST).workspace.current(),
    ).toBeNull();
  });

  it("is null, and does not throw, when there is no session to read", async () => {
    mockAuth.mockRejectedValue(new Error("outside a request"));
    mockWorkspaceId.mockReturnValue("w1");
    expect(
      await createHostServices(PLUGIN, MANIFEST).workspace.current(),
    ).toBeNull();
  });
});

describe("while plugins load", () => {
  // A plugin approved after the server started boots inside whichever request built
  // the registry, and must not see that request's user or workspace.
  const loading = getRegistryState();
  afterEach(() => {
    loading.loading = 0;
  });

  it("does not say who is signed in, and does not even ask the session", async () => {
    signedIn();
    loading.loading = 1;
    expect(
      await createHostServices(PLUGIN, MANIFEST).user.current(),
    ).toBeNull();
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it("does not say which workspace, and does not ask the database or the permissions", async () => {
    signedIn();
    mockWorkspaceId.mockReturnValue("w1");
    mockCanEnter.mockResolvedValue(true);
    mockWorkspaceFind.mockResolvedValue({ id: "w1", name: "Nimbus" });
    loading.loading = 1;
    expect(
      await createHostServices(PLUGIN, MANIFEST).workspace.current(),
    ).toBeNull();
    expect(mockCanEnter).not.toHaveBeenCalled();
    expect(mockWorkspaceFind).not.toHaveBeenCalled();
  });

  it("answers again as soon as the load is over, also for services made during it", async () => {
    signedIn();
    loading.loading = 1;
    const services = createHostServices(PLUGIN, MANIFEST);
    expect(await services.user.current()).toBeNull();
    loading.loading = 0;
    expect(await services.user.current()).toEqual({
      id: "u1",
      name: "Mara Velez",
    });
  });

  it("holds while more than one load runs", async () => {
    signedIn();
    loading.loading = 2;
    expect(
      await createHostServices(PLUGIN, MANIFEST).user.current(),
    ).toBeNull();
    loading.loading = 1;
    expect(
      await createHostServices(PLUGIN, MANIFEST).user.current(),
    ).toBeNull();
  });
});

describe("jobs.enqueue", () => {
  it("says jobs are not there yet instead of pretending to queue one", async () => {
    const jobs = createHostServices(PLUGIN, MANIFEST).jobs;
    await expect(jobs.enqueue("sync")).rejects.toThrow("not available yet");
    await expect(jobs.enqueue("sync", { a: 1 })).rejects.toThrow("BARY-90");
  });

  it("names the plugin that asked", async () => {
    const other = createHostServices(
      { id: "other-plugin", version: "2.0.0" },
      MANIFEST,
    );
    await expect(other.jobs.enqueue("x")).rejects.toThrow("other-plugin");
  });
});

describe("what a plugin can change about them", () => {
  it("nothing: the services and each of them are frozen", () => {
    const services = createHostServices(PLUGIN, MANIFEST);
    for (const value of [
      services,
      services.jobs,
      services.user,
      services.workspace,
      services.settings,
      services.storage,
      services.events,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(() => {
      (services.user as { current: unknown }).current = async () => ({
        id: "someone-else",
        name: "Someone else",
      });
    }).toThrow();
  });

  it("has storage and events with no members until their tickets are built", () => {
    const services = createHostServices(PLUGIN, MANIFEST);
    expect(Object.keys(services.storage)).toEqual([]);
    expect(Object.keys(services.events)).toEqual([]);
  });

  it("gives every plugin services of its own", () => {
    expect(createHostServices(PLUGIN, MANIFEST)).not.toBe(
      createHostServices(PLUGIN, MANIFEST),
    );
    expect(createHostServices(PLUGIN, MANIFEST).jobs).not.toBe(
      createHostServices(PLUGIN, MANIFEST).jobs,
    );
  });

  it("has exactly the six services the loader hands on, and nothing else", () => {
    expect(Object.keys(createHostServices(PLUGIN, MANIFEST)).sort()).toEqual([
      "events",
      "jobs",
      "settings",
      "storage",
      "user",
      "workspace",
    ]);
  });
});
