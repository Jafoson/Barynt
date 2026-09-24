import { describe, expect, it } from "bun:test";
import { isIntegrityHash } from "@/lib/plugins/hashFormat";
import {
  DEFAULT_ACTIVE_STORES,
  decideExecution,
  describeDecision,
  type ExecutionDecision,
  type ExecutionInput,
  isActiveStore,
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

/** The decision with the stores that are on by default, unless a test says otherwise. */
const decide = (
  value: ExecutionInput,
  stores: readonly string[] = DEFAULT_ACTIVE_STORES,
): ExecutionDecision => decideExecution(value, stores);

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
    ["from another store", { origin: "https://example.com/store" }],
    ["with no hash and no approval", { integrity: "", codeApprovalHash: null }],
  ])("runs, %s", (_name, more) => {
    expect(decide(input({ manifest: {}, ...more }))).toEqual({
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
    "runs in-process with %s, from an active store, approved for its files",
    (_name, manifest) => {
      expect(decide(input({ manifest }))).toEqual({
        mode: "in-process",
      });
    },
  );

  it("is blocked when its store is not active, however well approved", () => {
    for (const more of [
      { origin: "https://example.com/my-store" },
      { origin: null },
      { origin: "" },
      { origin: "https://github.com/Jafoson/barynt-plugin-store.evil" },
    ]) {
      expect(decide(input(more))).toEqual(blocked("store-not-active"));
    }
  });

  it("is blocked as unsigned when it is not from a store at all, however well approved", () => {
    for (const more of [
      { source: "UPLOAD" },
      { source: "DIRECTORY" },
      { source: "UPLOAD", origin: OFFICIAL_STORE_URL },
      { source: "DIRECTORY", origin: OFFICIAL_STORE_URL },
      { source: "store" },
      { source: "" },
    ]) {
      expect(decide(input(more))).toEqual(blocked("unsigned-not-allowed"));
    }
  });

  it("is blocked without an approval", () => {
    expect(decide(input({ codeApprovalHash: null }))).toEqual(
      blocked("not-approved"),
    );
    expect(decide(input({ codeApprovalHash: "" }))).toEqual(
      blocked("not-approved"),
    );
  });

  it("is blocked when the approval is for other files, as after an update", () => {
    expect(decide(input({ codeApprovalHash: OTHER_HASH }))).toEqual(
      blocked("approval-outdated"),
    );
  });

  it("is blocked without a valid hash on record, even if an approval says the same", () => {
    for (const bad of ["", "trust me", "sha512-short"]) {
      expect(decide(input({ integrity: bad, codeApprovalHash: bad }))).toEqual(
        blocked("not-approved"),
      );
    }
  });

  it("says store-not-active before it says not-approved", () => {
    expect(
      decide(
        input({ origin: "https://example.com/s", codeApprovalHash: null }),
      ),
    ).toEqual(blocked("store-not-active"));
  });

  it("counts a value that is there as code, even an empty one", () => {
    expect(
      decide(input({ manifest: { server: "" }, codeApprovalHash: null })),
    ).toEqual(blocked("not-approved"));
    expect(decide(input({ manifest: { client: "" }, origin: null }))).toEqual(
      blocked("store-not-active"),
    );
  });
});

describe("which stores are on", () => {
  const OWN = "https://git.example.com/team/plugins";
  const codeFrom = (origin: string, more: Partial<ExecutionInput> = {}) =>
    input({ origin, ...more });

  it("has the official store on by default, and only that one", () => {
    expect(DEFAULT_ACTIVE_STORES).toEqual([OFFICIAL_STORE_URL]);
  });

  it("lets a plugin from a store the admin added run, once it is approved", () => {
    expect(decide(codeFrom(OWN), [OFFICIAL_STORE_URL, OWN])).toEqual({
      mode: "in-process",
    });
    expect(decide(codeFrom(OWN), [OWN])).toEqual({ mode: "in-process" });
  });

  it("still needs the approval for a plugin from the admin's own store: connecting a store runs nothing by itself", () => {
    expect(decide(codeFrom(OWN, { codeApprovalHash: null }), [OWN])).toEqual(
      blocked("not-approved"),
    );
    expect(
      decide(codeFrom(OWN, { codeApprovalHash: OTHER_HASH }), [OWN]),
    ).toEqual(blocked("approval-outdated"));
  });

  it("blocks a store that is not on, and that includes the official one when the admin switched it off", () => {
    expect(decide(codeFrom(OWN), [OFFICIAL_STORE_URL])).toEqual(
      blocked("store-not-active"),
    );
    // Only the admin's own store is on: the official one is not.
    expect(decide(input(), [OWN])).toEqual(blocked("store-not-active"));
    expect(decide(codeFrom(OWN), [OWN])).toEqual({ mode: "in-process" });
  });

  it("runs plugins from two stores that are both on", () => {
    const stores = [OFFICIAL_STORE_URL, OWN];
    expect(decide(input(), stores)).toEqual({ mode: "in-process" });
    expect(decide(codeFrom(OWN), stores)).toEqual({ mode: "in-process" });
  });

  it("matches a store however its address is written", () => {
    expect(decide(codeFrom(`${OWN}.git/`), [OWN])).toEqual({
      mode: "in-process",
    });
    expect(decide(codeFrom(OWN), [`  ${OWN.toUpperCase()}.git `])).toEqual({
      mode: "in-process",
    });
  });

  it("does not take a look-alike of a store that is on for that store", () => {
    for (const origin of [
      `${OWN}.evil`,
      `${OWN}/sub`,
      `${OWN}?x=1`,
      `http://git.example.com/team/plugins`,
      `https://git.example.com.evil.com/team/plugins`,
      `https://user@git.example.com/team/plugins`,
    ]) {
      expect(decide(codeFrom(origin), [OWN])).toEqual(
        blocked("store-not-active"),
      );
    }
  });

  it("blocks everything with code when no store is on", () => {
    expect(decide(input(), [])).toEqual(blocked("store-not-active"));
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["a string", OFFICIAL_STORE_URL],
    ["an object", { 0: OFFICIAL_STORE_URL }],
    ["a number", 5],
  ])(
    "blocks everything with code when the list is %s, and does not throw",
    (_name, stores) => {
      // Not through `decide`: an `undefined` there would fall back to the default list.
      expect(decideExecution(input(), stores as unknown as string[])).toEqual(
        blocked("store-not-active"),
      );
    },
  );

  it("ignores entries in the list that are no store address, without letting them match", () => {
    const stores = [
      5,
      null,
      undefined,
      {},
      "not a url",
      "",
    ] as unknown as string[];
    expect(decide(input(), stores)).toEqual(blocked("store-not-active"));
    expect(decide(input(), [...stores, OFFICIAL_STORE_URL])).toEqual({
      mode: "in-process",
    });
  });

  it("does not match two things that are both no address: garbage is never equal to garbage", () => {
    for (const origin of ["not a url", "", "git@host:team/plugins.git"]) {
      expect(decide(input({ origin }), [origin, "also not a url"])).toEqual(
        blocked("store-not-active"),
      );
    }
    expect(isActiveStore("not a url", ["not a url"])).toBe(false);
  });

  it("does not let a store that is on vouch for an upload or a directory", () => {
    for (const source of ["UPLOAD", "DIRECTORY"]) {
      expect(decide(input({ source, origin: OWN }), [OWN])).toEqual(
        blocked("unsigned-not-allowed"),
      );
      // Not even when unsigned plugins are allowed: it does not become in-process.
      expect(
        decideExecution(input({ source, origin: OWN }), [OWN], {
          allowUnsigned: true,
        }),
      ).toEqual(blocked("unsigned-code"));
    }
  });

  it("does not need a store for a plugin without code, so it still runs with none on", () => {
    expect(
      decide(input({ manifest: {}, origin: OFFICIAL_STORE_URL }), []),
    ).toEqual({
      mode: "declarative",
    });
  });

  it("says isActiveStore the same, and marks only the official store as official", () => {
    expect(isActiveStore(OWN, [OWN])).toBe(true);
    expect(isActiveStore(OWN, [OFFICIAL_STORE_URL])).toBe(false);
    expect(isActiveStore(OWN, undefined as unknown as string[])).toBe(false);
    expect(isOfficialStore(OWN)).toBe(false);
    expect(isOfficialStore(OFFICIAL_STORE_URL)).toBe(true);
  });
});

describe("a plugin from no store (unsigned)", () => {
  const OWN = "https://git.example.com/team/plugins";
  const SOURCES = ["UPLOAD", "DIRECTORY", "URL", "store", "", "STORE "];
  const MANIFESTS = [
    ["without code", {}],
    ["with a server module", { server: "server.js" }],
    ["with a client bundle", { client: "client.js" }],
    ["with both", { server: "server.js", client: "client.js" }],
  ] as const;
  const unsigned = (more: Partial<ExecutionInput> = {}) =>
    input({ source: "UPLOAD", origin: null, ...more });

  it("is blocked when nothing says it is allowed, with or without code", () => {
    for (const source of SOURCES) {
      for (const [, manifest] of MANIFESTS) {
        const value = unsigned({ source, manifest });
        expect(decideExecution(value, DEFAULT_ACTIVE_STORES)).toEqual(
          blocked("unsigned-not-allowed"),
        );
        expect(decideExecution(value, DEFAULT_ACTIVE_STORES, {})).toEqual(
          blocked("unsigned-not-allowed"),
        );
        expect(
          decideExecution(value, DEFAULT_ACTIVE_STORES, {
            allowUnsigned: false,
          }),
        ).toEqual(blocked("unsigned-not-allowed"));
      }
    }
  });

  it.each([
    ["the text true", "true"],
    ["the text TRUE", "TRUE"],
    ["1", 1],
    ["a non-empty text", "yes"],
    ["an object", {}],
    ["a list", [true]],
    ["null", null],
    ["nothing", undefined],
  ])(
    "is still blocked when the setting is %s: only the value true allows it",
    (_name, allow) => {
      const options = { allowUnsigned: allow } as unknown as {
        allowUnsigned: boolean;
      };
      for (const [, manifest] of MANIFESTS) {
        expect(
          decideExecution(
            unsigned({ manifest }),
            DEFAULT_ACTIVE_STORES,
            options,
          ),
        ).toEqual(blocked("unsigned-not-allowed"));
      }
    },
  );

  it("is blocked, without throwing, when the options are not an object", () => {
    for (const options of [null, undefined, "yes", 5, true]) {
      expect(
        decideExecution(
          unsigned(),
          DEFAULT_ACTIVE_STORES,
          options as unknown as { allowUnsigned: boolean },
        ),
      ).toEqual(blocked("unsigned-not-allowed"));
    }
  });

  it("runs, when allowed, if it has no code", () => {
    for (const source of SOURCES) {
      expect(
        decideExecution(unsigned({ source, manifest: {} }), [], {
          allowUnsigned: true,
        }),
      ).toEqual({ mode: "declarative" });
    }
  });

  it("does not need a hash or an approval to run without code, when allowed", () => {
    expect(
      decideExecution(
        unsigned({ manifest: {}, integrity: "", codeApprovalHash: null }),
        [],
        { allowUnsigned: true },
      ),
    ).toEqual({ mode: "declarative" });
  });

  it("stays blocked, when allowed, if it has code: unreviewed code does not run in the process", () => {
    for (const source of SOURCES) {
      for (const [, manifest] of MANIFESTS.filter(
        ([, m]) => "server" in m || "client" in m,
      )) {
        expect(
          decideExecution(
            unsigned({ source, manifest }),
            DEFAULT_ACTIVE_STORES,
            {
              allowUnsigned: true,
            },
          ),
        ).toEqual(blocked("unsigned-code"));
      }
    }
  });

  it("never becomes in-process, whatever else is true of it", () => {
    // Every mix of source, code, store, origin, hash and approval, with the
    // setting on: none may end in-process.
    for (const source of SOURCES) {
      for (const [, manifest] of MANIFESTS) {
        for (const origin of [null, OFFICIAL_STORE_URL, OWN]) {
          for (const codeApprovalHash of [null, HASH, OTHER_HASH]) {
            for (const stores of [[], DEFAULT_ACTIVE_STORES, [OWN]]) {
              const decision = decideExecution(
                input({ source, manifest, origin, codeApprovalHash }),
                stores,
                { allowUnsigned: true },
              );
              expect(decision.mode).not.toBe("in-process");
            }
          }
        }
      }
    }
  });

  it("does not change what a plugin from a store gets, whatever the setting", () => {
    const cases: Partial<ExecutionInput>[] = [
      {},
      { manifest: {} },
      { codeApprovalHash: null },
      { codeApprovalHash: OTHER_HASH },
      { origin: OWN },
      { origin: null },
      { integrity: "" },
    ];
    for (const more of cases) {
      const without = decideExecution(input(more), DEFAULT_ACTIVE_STORES);
      for (const allowUnsigned of [true, false]) {
        expect(
          decideExecution(input(more), DEFAULT_ACTIVE_STORES, {
            allowUnsigned,
          }),
        ).toEqual(without);
      }
    }
    expect(
      decideExecution(input(), DEFAULT_ACTIVE_STORES, { allowUnsigned: true }),
    ).toEqual({ mode: "in-process" });
  });

  it("does not read the setting for a plugin from a store", () => {
    const options = {
      get allowUnsigned(): boolean {
        throw new Error("never read");
      },
    };
    expect(decideExecution(input(), DEFAULT_ACTIVE_STORES, options)).toEqual({
      mode: "in-process",
    });
  });

  it("is blocked as invalid, not allowed, when the setting cannot be read", () => {
    const options = {
      get allowUnsigned(): boolean {
        throw new Error("unreadable");
      },
    };
    expect(decideExecution(unsigned(), DEFAULT_ACTIVE_STORES, options)).toEqual(
      blocked("invalid"),
    );
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
    expect(decide(value as unknown as ExecutionInput)).toEqual(
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
      expect(decide(value as unknown as ExecutionInput)).toEqual(
        blocked("invalid"),
      );
    }
  });

  it("blocks a plugin whose source cannot be read, code or not: where it came from decides whether it runs at all", () => {
    for (const manifest of [{}, { server: "server.js" }]) {
      const value = {
        manifest,
        get source(): string {
          throw new Error("unreadable");
        },
      };
      expect(decide(value as unknown as ExecutionInput)).toEqual(
        blocked("invalid"),
      );
    }
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["a number", 5],
    ["an object", { toString: () => "STORE" }],
    ["a list", ["STORE"]],
  ])(
    "blocks a source that is %s, even with unsigned plugins allowed",
    (_name, source) => {
      for (const manifest of [{}, { server: "server.js" }]) {
        const value = input({ manifest, source: source as unknown as string });
        expect(decide(value)).toEqual(blocked("invalid"));
        expect(
          decideExecution(value, DEFAULT_ACTIVE_STORES, {
            allowUnsigned: true,
          }),
        ).toEqual(blocked("invalid"));
      }
    },
  );
});

describe("the English text", () => {
  const all: ExecutionDecision[] = [
    { mode: "declarative" },
    { mode: "in-process" },
    blocked("invalid"),
    blocked("unsigned-not-allowed"),
    blocked("unsigned-code"),
    blocked("store-not-active"),
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
