import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

// ── Mocks ─────────────────────────────────────────────────────────────────────
//
// Attachments in the public API and the MCP server. Mocks `@/lib/api-auth`,
// `@/lib/permissions` and `@/lib/storage/config` — its own `bun test`
// invocation (`scripts/run-tests.ts`), like `route.test.ts`. Storage itself
// runs for real (signing, key scheme, size checks) against a stubbed
// `fetch`, so the PUT/GET/DELETE it would send to S3 can be inspected.

const mockResolveApiUser = mock();
mock.module("@/lib/api-auth", () => ({
  resolveApiUser: mockResolveApiUser,
  hasScope: (auth: { scopes: string[] }, scope: string) =>
    auth.scopes.includes(scope),
}));

const mockCan = mock();
mock.module("@/lib/permissions", () => ({
  can: mockCan,
  canEnterWorkspace: mock(async () => true),
  accessibleProjectIds: mock(async () => new Set()),
}));

mock.module("@/lib/api/rateLimit", () => ({
  checkRateLimit: mock(async () => ({
    ok: true,
    info: { limit: 120, remaining: 119, resetAt: Date.now() + 60_000 },
  })),
}));

const STORAGE = {
  endpoint: "http://s3.internal:9000",
  publicEndpoint: "https://files.example.com",
  region: "us-east-1",
  accessKeyId: "id",
  secretAccessKey: "secret",
  bucketAvatars: "avatars",
  bucketIssues: "issues" as string | null,
};
const mockStorageConfig = mock(() => STORAGE as typeof STORAGE | null);
mock.module("@/lib/storage/config", () => ({
  storageConfig: mockStorageConfig,
  isStorageConfigured: () => mockStorageConfig() !== null,
  isAttachmentsConfigured: () => !!mockStorageConfig()?.bucketIssues,
}));

/** What `fetch` answers for S3 — the object store's side of each call. */
const s3 = {
  calls: [] as { method: string; url: string; body?: Uint8Array }[],
  getBody: new Uint8Array() as Uint8Array<ArrayBuffer>,
  getType: "application/octet-stream",
  headSize: 0,
};
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  const body =
    request.method === "PUT"
      ? new Uint8Array(await request.arrayBuffer())
      : undefined;
  s3.calls.push({ method: request.method, url: request.url, body });
  if (request.method === "GET") {
    return new Response(s3.getBody, {
      headers: {
        "content-type": s3.getType,
        "content-length": String(s3.getBody.byteLength),
      },
    });
  }
  if (request.method === "HEAD") {
    return new Response(null, {
      headers: { "content-length": String(s3.headSize) },
    });
  }
  return new Response(null, { status: 200 });
}) as typeof fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

const mockIssueFindUnique = mock();
const mockAttachmentFindMany = mock();
const mockAttachmentFindUnique = mock();
const mockAttachmentCreate = mock();
const mockAttachmentDelete = mock();
const mockAuditLogCreate = mock(async () => ({}));

const db = {
  issue: { findUnique: mockIssueFindUnique },
  project: { findMany: mock(async () => []) },
  attachment: {
    findMany: mockAttachmentFindMany,
    findUnique: mockAttachmentFindUnique,
    create: mockAttachmentCreate,
    delete: mockAttachmentDelete,
  },
  user: { findUnique: mock(async () => null) },
  auditLog: { create: mockAuditLogCreate },
};
mock.module("@/lib/db", () => ({ db }));

import {
  DELETE as deleteAttachment,
  GET as getAttachment,
} from "@/app/api/v1/attachments/[id]/route";
import {
  GET as listAttachments,
  POST as postAttachment,
} from "@/app/api/v1/issues/[id]/attachments/route";
import { POST as postUpload } from "@/app/api/v1/issues/[id]/attachments/uploads/route";
import type { ApiAttachment } from "@/features/api-v1/queries";
import { attachmentContent } from "@/lib/mcp/attachments";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AUTH = {
  userId: "u-1",
  keyId: "k-1",
  scopes: ["issues:read", "issues:write"],
};

const ISSUE = {
  id: "i-1",
  key: 7,
  title: "Checkout",
  projectId: "p-1",
  reporterId: "u-1",
  assigneeId: null,
  project: { workspaceId: "w-1", prefix: "PRJ" },
};

const AUTHOR = {
  id: "u-1",
  firstName: "Actor",
  lastName: "Person",
  handle: "actor",
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "att-1",
    issueId: "i-1",
    kind: "file",
    name: "shot.png",
    key: "attachments/i-1/abc.png",
    url: null,
    mimeType: "image/png",
    size: 42,
    created: new Date("2026-03-01T00:00:00Z"),
    author: AUTHOR,
    ...overrides,
  };
}

function req(body?: unknown): Request {
  return new Request("https://example.com/api/v1", {
    method: body === undefined ? "GET" : "POST",
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function reset() {
  for (const m of [
    mockResolveApiUser,
    mockCan,
    mockIssueFindUnique,
    mockAttachmentFindMany,
    mockAttachmentFindUnique,
    mockAttachmentCreate,
    mockAttachmentDelete,
  ]) {
    m.mockReset();
  }
  mockAuditLogCreate.mockClear();
  mockStorageConfig.mockReturnValue(STORAGE);
  s3.calls = [];
  s3.getBody = new Uint8Array();
  s3.getType = "application/octet-stream";
  s3.headSize = 0;

  mockResolveApiUser.mockResolvedValue(AUTH);
  mockCan.mockResolvedValue(true);
  mockIssueFindUnique.mockResolvedValue(ISSUE);
  // `create` echoes what was written, shaped like `attachmentSelect`.
  mockAttachmentCreate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) =>
      row({ ...data, created: new Date(), author: AUTHOR }),
  );
}

function base64(bytes: number): string {
  return Buffer.alloc(bytes, 1).toString("base64");
}

// ── Reading ───────────────────────────────────────────────────────────────────

describe("GET /api/v1/issues/:id/attachments", () => {
  beforeEach(reset);

  it("lists files with a signed url and links with their own", async () => {
    mockAttachmentFindMany.mockResolvedValue([
      row(),
      row({
        id: "att-2",
        kind: "link",
        name: "github.com",
        key: null,
        url: "https://github.com/acme/web/pull/1",
        mimeType: null,
        size: null,
      }),
    ]);
    const res = await listAttachments(req(), params("i-1"));
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data[0].kind).toBe("file");
    expect(data[0].url).toStartWith(
      "https://files.example.com/issues/attachments/i-1/abc.png?",
    );
    expect(data[0].url).toContain("X-Amz-Signature=");
    expect(data[0].urlExpiresAt).not.toBeNull();
    expect(data[0]).not.toHaveProperty("key");
    expect(data[0].author).toEqual({
      id: "u-1",
      name: "Actor Person",
      handle: "actor",
    });

    expect(data[1].url).toBe("https://github.com/acme/web/pull/1");
    expect(data[1].urlExpiresAt).toBeNull();
  });

  it("gives a file no url when storage isn't configured", async () => {
    mockStorageConfig.mockReturnValue(null);
    mockAttachmentFindMany.mockResolvedValue([row()]);
    const { data } = await (await listAttachments(req(), params("i-1"))).json();
    expect(data[0].url).toBeNull();
    expect(data[0].urlExpiresAt).toBeNull();
  });

  it("404s when the issue isn't visible", async () => {
    mockCan.mockResolvedValue(false);
    const res = await listAttachments(req(), params("i-1"));
    expect(res.status).toBe(404);
    expect(mockAttachmentFindMany).not.toHaveBeenCalled();
  });

  it("403s without issues:read", async () => {
    mockResolveApiUser.mockResolvedValue({ ...AUTH, scopes: ["issues:write"] });
    const res = await listAttachments(req(), params("i-1"));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/attachments/:id", () => {
  beforeEach(reset);

  it("returns one attachment with a fresh url", async () => {
    mockAttachmentFindUnique.mockResolvedValue({
      ...row(),
      issue: { projectId: "p-1" },
    });
    const res = await getAttachment(req(), params("att-1"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.id).toBe("att-1");
    expect(data.url).toContain("X-Amz-Signature=");
    expect(data).not.toHaveProperty("issue");
  });

  it("404s an attachment of an issue the caller can't see", async () => {
    mockAttachmentFindUnique.mockResolvedValue({
      ...row(),
      issue: { projectId: "p-1" },
    });
    mockCan.mockResolvedValue(false);
    expect((await getAttachment(req(), params("att-1"))).status).toBe(404);
  });
});

// ── Writing ───────────────────────────────────────────────────────────────────

describe("POST /api/v1/issues/:id/attachments", () => {
  beforeEach(reset);

  it("attaches a link, named after its host by default", async () => {
    const res = await postAttachment(
      req({ url: "https://www.figma.com/file/abc" }),
      params("i-1"),
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({
      kind: "link",
      name: "figma.com",
      url: "https://www.figma.com/file/abc",
    });
    expect(mockAuditLogCreate).toHaveBeenCalled();
  });

  it("rejects a non-http link", async () => {
    const res = await postAttachment(
      req({ url: "javascript:alert(1)" }),
      params("i-1"),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("invalid_url");
    expect(mockAttachmentCreate).not.toHaveBeenCalled();
  });

  it("wants exactly one source", async () => {
    const none = await postAttachment(req({ name: "x" }), params("i-1"));
    expect((await none.json()).error.code).toBe("invalid_source");
    const two = await postAttachment(
      req({ url: "https://a.example", content: base64(3), name: "x" }),
      params("i-1"),
    );
    expect((await two.json()).error.code).toBe("invalid_source");
  });

  it("stores inline base64 and guesses the type from the name", async () => {
    const res = await postAttachment(
      req({ name: "notes.txt", content: base64(5) }),
      params("i-1"),
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({
      kind: "file",
      name: "notes.txt",
      mimeType: "text/plain",
      size: 5,
    });

    const put = s3.calls.find((c) => c.method === "PUT");
    expect(put?.url).toStartWith(
      "http://s3.internal:9000/issues/attachments/i-1/",
    );
    expect(put?.url).toEndWith(".txt");
    expect(put?.body?.byteLength).toBe(5);
  });

  it("takes the type from a data: URL", async () => {
    const res = await postAttachment(
      req({ name: "pixel", content: `data:image/gif;base64,${base64(4)}` }),
      params("i-1"),
    );
    expect((await res.json()).data.mimeType).toBe("image/gif");
  });

  it("requires a file name for a file", async () => {
    const res = await postAttachment(
      req({ content: base64(4) }),
      params("i-1"),
    );
    expect((await res.json()).error.code).toBe("invalid_name");
  });

  it("rejects content that isn't base64", async () => {
    const res = await postAttachment(
      req({ name: "a.bin", content: "not base64!" }),
      params("i-1"),
    );
    expect((await res.json()).error.code).toBe("invalid_content");
  });

  it("caps inline content at 10 MB", async () => {
    const res = await postAttachment(
      req({ name: "big.bin", content: base64(10 * 1024 * 1024 + 1) }),
      params("i-1"),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("too_large");
    expect(s3.calls).toHaveLength(0);
  });

  it("says so when storage isn't configured", async () => {
    mockStorageConfig.mockReturnValue(null);
    const res = await postAttachment(
      req({ name: "a.txt", content: base64(3) }),
      params("i-1"),
    );
    expect((await res.json()).error).toEqual({
      code: "upload_rejected",
      message: "Attachment uploads are not configured.",
    });
  });

  it("confirms an upload by key, with the size S3 reports", async () => {
    s3.headSize = 2048;
    const res = await postAttachment(
      req({ name: "clip.mp4", key: "attachments/i-1/xyz.mp4" }),
      params("i-1"),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({
      kind: "file",
      size: 2048,
      mimeType: "video/mp4",
    });
  });

  it("refuses a key that belongs to another issue", async () => {
    const res = await postAttachment(
      req({ name: "clip.mp4", key: "attachments/i-9/xyz.mp4" }),
      params("i-1"),
    );
    expect((await res.json()).error.code).toBe("upload_rejected");
    expect(mockAttachmentCreate).not.toHaveBeenCalled();
  });

  it("404s without the right to edit the issue", async () => {
    mockCan.mockResolvedValue(false);
    const res = await postAttachment(
      req({ url: "https://a.example" }),
      params("i-1"),
    );
    expect(res.status).toBe(404);
  });

  it("403s without issues:write", async () => {
    mockResolveApiUser.mockResolvedValue({ ...AUTH, scopes: ["issues:read"] });
    const res = await postAttachment(
      req({ url: "https://a.example" }),
      params("i-1"),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/v1/issues/:id/attachments/uploads", () => {
  beforeEach(reset);

  it("hands out a presigned PUT url under the issue's prefix", async () => {
    const res = await postUpload(
      req({ fileName: "clip.mp4", contentLength: 1000 }),
      params("i-1"),
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.key).toStartWith("attachments/i-1/");
    expect(data.uploadUrl).toStartWith("https://files.example.com/issues/");
    expect(data.method).toBe("PUT");
    expect(data.headers).toEqual({ "Content-Type": "video/mp4" });
  });

  it("rejects a file over 100 MB up front", async () => {
    const res = await postUpload(
      req({ fileName: "huge.bin", contentLength: 101 * 1024 * 1024 }),
      params("i-1"),
    );
    expect((await res.json()).error.code).toBe("upload_rejected");
  });
});

describe("DELETE /api/v1/attachments/:id", () => {
  beforeEach(reset);

  it("removes the row and the stored file", async () => {
    mockAttachmentFindUnique.mockResolvedValue({
      id: "att-1",
      kind: "file",
      key: "attachments/i-1/abc.png",
      name: "shot.png",
      issueId: "i-1",
    });
    const res = await deleteAttachment(req(), params("att-1"));
    expect(res.status).toBe(200);
    expect(mockAttachmentDelete).toHaveBeenCalledWith({
      where: { id: "att-1" },
    });
    expect(s3.calls.map((c) => c.method)).toEqual(["DELETE"]);
  });

  it("404s without the right to edit the issue", async () => {
    mockAttachmentFindUnique.mockResolvedValue({
      id: "att-1",
      kind: "link",
      key: null,
      name: "x",
      issueId: "i-1",
    });
    mockCan.mockResolvedValue(false);
    expect((await deleteAttachment(req(), params("att-1"))).status).toBe(404);
    expect(mockAttachmentDelete).not.toHaveBeenCalled();
  });
});

// ── MCP: get_attachment with content ──────────────────────────────────────────

describe("attachmentContent()", () => {
  beforeEach(reset);

  const file = (overrides: Partial<ApiAttachment> = {}): ApiAttachment => ({
    id: "att-1",
    issueId: "i-1",
    kind: "file",
    name: "shot.png",
    url: "https://files.example.com/x",
    urlExpiresAt: new Date(),
    mimeType: "image/png",
    size: 3,
    author: { id: "u-1", name: "Actor Person", handle: "actor" },
    created: new Date(),
    ...overrides,
  });

  it("returns an image as an image block", async () => {
    s3.getBody = new Uint8Array([1, 2, 3]);
    const result = await attachmentContent(file(), "attachments/i-1/a.png");
    expect(result.content[1]).toEqual({
      type: "image",
      data: Buffer.from([1, 2, 3]).toString("base64"),
      mimeType: "image/png",
    });
  });

  it("returns a text file as text", async () => {
    s3.getBody = new TextEncoder().encode("line 1\nline 2");
    const result = await attachmentContent(
      file({ name: "build.log", mimeType: "application/octet-stream" }),
      "attachments/i-1/a.log",
    );
    expect(result.content[1]).toEqual({ type: "text", text: "line 1\nline 2" });
  });

  it("leaves out a file that's too large", async () => {
    s3.getBody = new Uint8Array(512 * 1024 + 1);
    const result = await attachmentContent(
      file({ name: "big.txt", mimeType: "text/plain" }),
      "attachments/i-1/a.txt",
    );
    expect(result.content).toHaveLength(1);
    expect(
      JSON.parse((result.content[0] as { text: string }).text).note,
    ).toContain("over 512 KB");
  });

  it("never fetches a link", async () => {
    const result = await attachmentContent(
      file({
        kind: "link",
        name: "x",
        mimeType: null,
        url: "https://a.example",
      }),
      null,
    );
    expect(s3.calls).toHaveLength(0);
    expect(
      JSON.parse((result.content[0] as { text: string }).text).note,
    ).toContain("isn't fetched");
  });

  it("only describes other file types", async () => {
    const result = await attachmentContent(
      file({ name: "spec.pdf", mimeType: "application/pdf" }),
      "attachments/i-1/a.pdf",
    );
    expect(s3.calls).toHaveLength(0);
    expect(result.content).toHaveLength(1);
  });
});
