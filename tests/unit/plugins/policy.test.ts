import { describe, expect, it } from "bun:test";
import { isIntegrityHash } from "@/lib/plugins/hashFormat";
import {
  decideExecution,
  describeDecision,
  type ExecutionDecision,
  type ExecutionInput,
  isOfficialStore,
  normalizeStoreUrl,
  OFFICIAL_STORE_URL,
} from "@/lib/plugins/policy";

// This decides what runs with the full power of the app, so every way in has a
// test, and every missing, odd or malformed value has to end in "blocked". Pure
// logic, no database.

const HASH = `sha512-${"A".repeat(86)}==`;
const OTHER_HASH = `sha512-${"B".repeat(86)}==`;

/** A plugin with code from the official store that was approved for its current files. */
function input(more: Partial<ExecutionInput> = {}): ExecutionInput {
  return {
    manifest: { server: "server.js" },
    source: "STORE",
    origin: OFFICIAL_STORE_URL,
    integrity: HASH,
    codeApprovalHash: HASH,
    ...more,
  };
}

const blocked = (reason: string): ExecutionDecision =>
  ({ mode: "blocked", reason }) as ExecutionDecision;

describe("the hash format", () => {
  it("accepts sha512-<88 characters of base64> and nothing else", () => {
    expect(isIntegrityHash(HASH)).toBe(true);
    for (const value of [
      "",
      "sha512-abc",
      `sha256-${"A".repeat(86)}==`,
      `sha512-${"A".repeat(87)}=`,
      null,
      undefined,
      5,
    ]) {
      expect(isIntegrityHash(value)).toBe(false);
    }
  });
});

describe("the official store", () => {
  it.each([
    OFFICIAL_STORE_URL,
    `${OFFICIAL_STORE_URL}.git`,
    `${OFFICIAL_STORE_URL}/`,
    ` ${OFFICIAL_STORE_URL} `,
    "https://GITHUB.com/jafoson/Barynt-Plugin-Store",
    "HTTPS://github.com/Jafoson/barynt-plugin-store.GIT/",
  ])("recognises %j", (url) => {
    expect(isOfficialStore(url)).toBe(true);
  });

  it.each([
    ["another repository", "https://github.com/Jafoson/other-store"],
    ["another owner", "https://github.com/someone/barynt-plugin-store"],
    ["another host", "https://gitlab.com/Jafoson/barynt-plugin-store"],
    [
      "a look-alike host",
      "https://github.com.evil.com/Jafoson/barynt-plugin-store",
    ],
    [
      "a look-alike host name",
      "https://evilgithub.com/Jafoson/barynt-plugin-store",
    ],
    [
      "a look-alike repository",
      "https://github.com/Jafoson/barynt-plugin-store.evil",
    ],
    ["a sub-path", "https://github.com/Jafoson/barynt-plugin-store/tree/main"],
    ["plain http", "http://github.com/Jafoson/barynt-plugin-store"],
    ["the ssh form", "git@github.com:Jafoson/barynt-plugin-store.git"],
    ["credentials", "https://user:pw@github.com/Jafoson/barynt-plugin-store"],
    ["a user name only", "https://user@github.com/Jafoson/barynt-plugin-store"],
    ["a port", "https://github.com:8443/Jafoson/barynt-plugin-store"],
    ["a query", "https://github.com/Jafoson/barynt-plugin-store?x=1"],
    ["a fragment", "https://github.com/Jafoson/barynt-plugin-store#x"],
    ["a file url", "file:///Jafoson/barynt-plugin-store"],
    ["text that is no url", "the official store"],
    ["the empty string", ""],
    ["only a host", "https://github.com"],
  ])("does not take %s for it", (_name, url) => {
    expect(isOfficialStore(url)).toBe(false);
  });

  it.each([
    null,
    undefined,
    5,
    {},
    // A row that is itself an array would be spread into arguments, so it is wrapped.
    [["https://github.com/Jafoson/barynt-plugin-store"]],
  ])("does not take %j for it", (value) => {
    expect(isOfficialStore(value)).toBe(false);
    expect(normalizeStoreUrl(value)).toBeNull();
  });

  it("normalises to host and path, lowercase", () => {
    expect(normalizeStoreUrl("https://GitHub.com/Foo/Bar.git/")).toBe(
      "github.com/foo/bar",
    );
  });
});

describe("a plugin without code", () => {
  it.each([
    ["from the official store", {}],
    ["from an upload", { source: "UPLOAD", origin: null }],
    ["from a directory", { source: "DIRECTORY", origin: null }],
    ["from another store", { origin: "https://example.com/store" }],
    ["with no hash and no approval", { integrity: "", codeApprovalHash: null }],
  ])("runs, %s", (_name, more) => {
    expect(decideExecution(input({ manifest: {}, ...more }))).toEqual({
      mode: "declarative",
    });
  });
});

describe("a plugin with code", () => {
  it.each([
    ["a server module", { server: "server.js" }],
    ["a client bundle", { client: "client.js" }],
    ["both", { server: "server.js", client: "client.js" }],
  ])(
    "runs in-process with %s, from the official store, approved for its files",
    (_name, manifest) => {
      expect(decideExecution(input({ manifest }))).toEqual({
        mode: "in-process",
      });
    },
  );

  it("is blocked when it is not from the official store, however well approved", () => {
    for (const more of [
      { origin: "https://example.com/my-store" },
      { origin: null },
      { origin: "" },
      { origin: "https://github.com/Jafoson/barynt-plugin-store.evil" },
      { source: "UPLOAD" },
      { source: "DIRECTORY" },
      { source: "UPLOAD", origin: OFFICIAL_STORE_URL },
      { source: "DIRECTORY", origin: OFFICIAL_STORE_URL },
      { source: "store" },
      { source: "" },
    ]) {
      expect(decideExecution(input(more))).toEqual(
        blocked("not-official-store"),
      );
    }
  });

  it("is blocked without an approval", () => {
    expect(decideExecution(input({ codeApprovalHash: null }))).toEqual(
      blocked("not-approved"),
    );
    expect(decideExecution(input({ codeApprovalHash: "" }))).toEqual(
      blocked("not-approved"),
    );
  });

  it("is blocked when the approval is for other files, as after an update", () => {
    expect(decideExecution(input({ codeApprovalHash: OTHER_HASH }))).toEqual(
      blocked("approval-outdated"),
    );
  });

  it("is blocked without a valid hash on record, even if an approval says the same", () => {
    for (const bad of ["", "trust me", "sha512-short"]) {
      expect(
        decideExecution(input({ integrity: bad, codeApprovalHash: bad })),
      ).toEqual(blocked("not-approved"));
    }
  });

  it("says not-official-store before it says not-approved", () => {
    expect(
      decideExecution(
        input({ origin: "https://example.com/s", codeApprovalHash: null }),
      ),
    ).toEqual(blocked("not-official-store"));
  });

  it("counts a value that is there as code, even an empty one", () => {
    expect(
      decideExecution(
        input({ manifest: { server: "" }, codeApprovalHash: null }),
      ),
    ).toEqual(blocked("not-approved"));
    expect(
      decideExecution(input({ manifest: { client: "" }, origin: null })),
    ).toEqual(blocked("not-official-store"));
  });
});

describe("input that cannot be trusted", () => {
  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a string", "plugin"],
    ["a number", 5],
    [
      "no manifest",
      {
        source: "STORE",
        origin: OFFICIAL_STORE_URL,
        integrity: HASH,
        codeApprovalHash: HASH,
      },
    ],
    ["a manifest that is null", { manifest: null }],
    ["a manifest that is a string", { manifest: "server.js" }],
  ])("is blocked as invalid: %s", (_name, value) => {
    expect(decideExecution(value as unknown as ExecutionInput)).toEqual(
      blocked("invalid"),
    );
  });

  it("never throws, and blocks what it cannot read", () => {
    const hostile = [
      {
        manifest: {
          get server(): string {
            throw new Error("no");
          },
        },
      },
      {
        manifest: { server: "server.js" },
        source: "STORE",
        get origin(): string {
          throw new Error("no");
        },
      },
      {
        manifest: { server: "server.js" },
        source: "STORE",
        origin: OFFICIAL_STORE_URL,
        integrity: HASH,
        get codeApprovalHash(): string {
          throw new Error("no");
        },
      },
    ];
    for (const value of hostile) {
      expect(decideExecution(value as unknown as ExecutionInput)).toEqual(
        blocked("invalid"),
      );
    }
  });

  it("does not read what it does not need: a plugin without code does not depend on its source", () => {
    const value = {
      manifest: {},
      get source(): string {
        throw new Error("never read");
      },
    };
    expect(decideExecution(value as unknown as ExecutionInput)).toEqual({
      mode: "declarative",
    });
  });
});

describe("the English text", () => {
  const all: ExecutionDecision[] = [
    { mode: "declarative" },
    { mode: "in-process" },
    blocked("invalid"),
    blocked("not-official-store"),
    blocked("not-approved"),
    blocked("approval-outdated"),
  ];

  it.each(all)("says something specific for %j", (decision) => {
    expect(describeDecision(decision).length).toBeGreaterThan(15);
  });

  it("gives each decision its own text", () => {
    expect(new Set(all.map(describeDecision)).size).toBe(all.length);
  });
});
