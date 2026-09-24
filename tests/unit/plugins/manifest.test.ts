import { describe, expect, it } from "bun:test";
import {
  CONTRIBUTION_POINTS,
  PLUGIN_CATEGORIES,
  pluginTier,
  RESERVED_PLUGIN_IDS,
} from "@/lib/plugins/manifest";
import {
  formatIssues,
  type ManifestIssue,
  parseManifest,
  validateManifest,
} from "@/lib/plugins/validate";

// The plugin manifest is the one file the host reads about a plugin before it
// trusts any of its code, so what it accepts is a security decision, not just
// a formatting one. Pure logic, no database.

/** The smallest manifest that is valid; tests change one thing at a time. */
function manifest(overrides: Record<string, unknown> = {}) {
  return {
    manifestVersion: 1,
    id: "demo",
    name: "Demo",
    version: "1.0.0",
    description: "A demo plugin",
    author: "Someone",
    license: "MIT",
    categories: ["other"],
    barynt: ">=1.0.0 <2.0.0",
    ...overrides,
  };
}

/** The issues of a manifest that is expected to be invalid. */
function issues(overrides: Record<string, unknown>): ManifestIssue[] {
  const result = validateManifest(manifest(overrides));
  if (result.ok) throw new Error("expected the manifest to be invalid");
  return result.issues;
}

/** Is there an issue on exactly this path, with a message containing this text? */
function hasIssue(list: ManifestIssue[], path: string, text?: string) {
  return list.some(
    (issue) => issue.path === path && (!text || issue.message.includes(text)),
  );
}

describe("a valid manifest", () => {
  it("is accepted and gets its defaults", () => {
    const result = validateManifest(manifest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.keywords).toEqual([]);
    expect(result.manifest.dependencies).toEqual({});
    expect(result.manifest.capabilities).toEqual([]);
    expect(result.manifest.contributes).toEqual({});
  });

  it("does not run any code: it is data in, data out", () => {
    const input = manifest();
    validateManifest(input);
    // The input is left as it was; defaults are added to a copy.
    expect(input).toEqual(manifest());
  });
});

describe("plugin id", () => {
  it.each([
    "ab",
    "demo",
    "release-notes",
    "a1",
    "kalender-ansicht",
    "a".repeat(63),
  ])("accepts %s", (id) => {
    expect(validateManifest(manifest({ id })).ok).toBe(true);
  });

  it.each([
    ["a", "too short"],
    ["Release", "uppercase"],
    ["1abc", "starts with a digit"],
    ["a--b", "double dash"],
    ["a-", "trailing dash"],
    ["-a", "leading dash"],
    ["a_b", "underscore"],
    ["a b", "space"],
    ["äb", "non-ascii"],
    ["a".repeat(64), "too long"],
  ])("rejects %s (%s)", (id) => {
    expect(hasIssue(issues({ id }), "id")).toBe(true);
  });

  it("keeps the platform's own names for itself", () => {
    for (const id of RESERVED_PLUGIN_IDS) {
      expect(hasIssue(issues({ id }), "id", "reserved")).toBe(true);
    }
  });
});

describe("version and compatibility", () => {
  it.each(["1.0.0", "0.0.1", "10.20.30", "2.0.0-beta.1", "1.0.0-rc-1"])(
    "accepts the version %s",
    (version) => {
      expect(validateManifest(manifest({ version })).ok).toBe(true);
    },
  );

  it.each(["1.0", "01.0.0", "1.0.0+build.5", "v1.0.0", "1.0.0.0", ""])(
    "rejects the version %j",
    (version) => {
      expect(hasIssue(issues({ version }), "version")).toBe(true);
    },
  );

  it("names the reason for build metadata, the one most likely to be tried", () => {
    expect(
      hasIssue(issues({ version: "1.0.0+1" }), "version", "no build metadata"),
    ).toBe(true);
  });

  it.each([">=1.0.0 <2.0.0", "^1.2.0", "~1.2", "1.x", "1.2.3 || ^2.0.0"])(
    "accepts the Barynt range %s",
    (barynt) => {
      expect(validateManifest(manifest({ barynt })).ok).toBe(true);
    },
  );

  it.each(["wat", ">=", "1.2.3.4"])(
    "rejects the range %j as not a range",
    (barynt) => {
      expect(
        hasIssue(issues({ barynt }), "barynt", "not a valid SemVer range"),
      ).toBe(true);
    },
  );

  it.each(["*", "x", "X", " * "])(
    "refuses %j because it claims nothing",
    (barynt) => {
      expect(hasIssue(issues({ barynt }), "barynt", "every version")).toBe(
        true,
      );
    },
  );
});

describe("texts a person reads", () => {
  it("takes a plain string or one string per language", () => {
    expect(validateManifest(manifest({ name: "Demo" })).ok).toBe(true);
    expect(
      validateManifest(
        manifest({ name: { en: "Demo", de: "Beispiel", "pt-BR": "Exemplo" } }),
      ).ok,
    ).toBe(true);
  });

  it("requires English when there are several languages, it is the fallback", () => {
    expect(hasIssue(issues({ name: { de: "Beispiel" } }), "name", '"en"')).toBe(
      true,
    );
  });

  it("rejects malformed language codes, empty and oversized texts", () => {
    expect(hasIssue(issues({ name: { en: "x", German: "y" } }), "name")).toBe(
      true,
    );
    expect(hasIssue(issues({ name: "" }), "name")).toBe(true);
    expect(hasIssue(issues({ name: "x".repeat(81) }), "name")).toBe(true);
    expect(
      hasIssue(issues({ description: "x".repeat(501) }), "description"),
    ).toBe(true);
    expect(hasIssue(issues({ name: 5 }), "name", "text of 1 to 80")).toBe(true);
  });
});

describe("author, license and links", () => {
  it("accepts an author as a name or as an object", () => {
    expect(validateManifest(manifest({ author: "Jane" })).ok).toBe(true);
    expect(
      validateManifest(
        manifest({
          author: {
            name: "Jane",
            email: "jane@example.com",
            url: "https://example.com",
          },
        }),
      ).ok,
    ).toBe(true);
  });

  it("rejects an author without a name or with a bad email", () => {
    expect(
      hasIssue(issues({ author: { email: "jane@example.com" } }), "author"),
    ).toBe(true);
    expect(
      hasIssue(
        issues({ author: { name: "Jane", email: "nope" } }),
        "author.email",
      ),
    ).toBe(true);
    expect(hasIssue(issues({ author: "" }), "author")).toBe(true);
  });

  it.each([
    "MIT",
    "Apache-2.0",
    "Apache-2.0 OR MIT",
    "GPL-3.0-or-later",
    "MIT WITH Classpath-exception-2.0",
  ])("accepts the license %s", (license) => {
    expect(validateManifest(manifest({ license })).ok).toBe(true);
  });

  it.each(["", "not a license!", "MIT OR", "MIT,Apache-2.0"])(
    "rejects the license %j",
    (license) => {
      expect(hasIssue(issues({ license }), "license", "SPDX")).toBe(true);
    },
  );

  it("only takes https links, a plugin page must not send people over plain http", () => {
    expect(
      validateManifest(manifest({ homepage: "https://example.com" })).ok,
    ).toBe(true);
    expect(
      hasIssue(
        issues({ homepage: "http://example.com" }),
        "homepage",
        "https://",
      ),
    ).toBe(true);
    expect(
      hasIssue(issues({ repository: "ftp://example.com/x" }), "repository"),
    ).toBe(true);
    expect(hasIssue(issues({ homepage: "not a url" }), "homepage")).toBe(true);
  });
});

describe("entry points", () => {
  it("accepts server and client bundles as .js or .mjs, styles as .css, an icon and a messages folder", () => {
    const result = validateManifest(
      manifest({
        server: "dist/server.js",
        client: "client.mjs",
        styles: ["client.css", "extra/theme.css"],
        icon: "icon.svg",
        messages: "messages",
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("refuses TypeScript: plugins ship built JavaScript (ADR 0001)", () => {
    expect(
      hasIssue(issues({ server: "server.ts" }), "server", ".js or .mjs"),
    ).toBe(true);
    expect(
      hasIssue(issues({ client: "client.tsx" }), "client", ".js or .mjs"),
    ).toBe(true);
  });

  it.each([
    ["../evil.js", "server"],
    ["a/../b.js", "server"],
    ["./server.js", "server"],
    ["a//b.js", "server"],
    ["dir/.hidden/b.js", "server"],
    [".secret.js", "server"],
    ["a\\b.js", "server"],
    ["a\0b.js", "server"],
    ["C:/x.js", "server"],
  ])(
    "refuses the path %j, it could leave the plugin directory",
    (path, field) => {
      expect(hasIssue(issues({ [field]: path }), field)).toBe(true);
    },
  );

  it("reports an absolute path once, as absolute", () => {
    const list = issues({ client: "/abs/client.js" }).filter(
      (issue) => issue.path === "client",
    );
    expect(list.map((issue) => issue.message)).toEqual([
      "must be relative to the plugin directory",
    ]);
  });

  it("checks every style file and points at the one that is wrong", () => {
    expect(
      hasIssue(
        issues({ client: "client.js", styles: ["ok.css", "bad.scss"] }),
        "styles[1]",
        ".css",
      ),
    ).toBe(true);
  });

  it("does not allow more than 10 style files", () => {
    const styles = Array.from({ length: 11 }, (_, i) => `s${i}.css`);
    expect(hasIssue(issues({ client: "client.js", styles }), "styles")).toBe(
      true,
    );
  });

  it("refuses styles without a client bundle to belong to", () => {
    expect(hasIssue(issues({ styles: ["a.css"] }), "styles", '"client"')).toBe(
      true,
    );
  });

  it("only takes a png or svg icon", () => {
    expect(hasIssue(issues({ icon: "icon.gif" }), "icon", ".svg or .png")).toBe(
      true,
    );
  });
});

describe("tier", () => {
  it("is A without code and B with a server or client entry", () => {
    const declarative = validateManifest(
      manifest({ contributes: { customFields: [{ id: "x" }] } }),
    );
    const withServer = validateManifest(manifest({ server: "server.js" }));
    const withClient = validateManifest(manifest({ client: "client.js" }));
    if (!declarative.ok || !withServer.ok || !withClient.ok)
      throw new Error("fixtures must be valid");
    expect(pluginTier(declarative.manifest)).toBe("A");
    expect(pluginTier(withServer.manifest)).toBe("B");
    expect(pluginTier(withClient.manifest)).toBe("B");
  });
});

describe("categories", () => {
  it.each([...PLUGIN_CATEGORIES])("accepts %s", (category) => {
    expect(validateManifest(manifest({ categories: [category] })).ok).toBe(
      true,
    );
  });

  it("takes up to three", () => {
    const categories = ["planning", "reporting", "integration"];
    expect(validateManifest(manifest({ categories })).ok).toBe(true);
  });

  it("refuses an unknown category and names the ones that exist", () => {
    // A typo must not turn into a filter of its own in the store.
    const list = issues({ categories: ["planing"] });
    expect(hasIssue(list, "categories[0]", "unknown category")).toBe(true);
    for (const category of PLUGIN_CATEGORIES) {
      expect(hasIssue(list, "categories[0]", category)).toBe(true);
    }
  });

  it("needs at least one", () => {
    expect(
      hasIssue(issues({ categories: [] }), "categories", "at least one"),
    ).toBe(true);
  });

  it("allows at most three, so a plugin cannot list itself under everything", () => {
    const categories = ["planning", "reporting", "security", "other"];
    expect(hasIssue(issues({ categories }), "categories", "at most 3")).toBe(
      true,
    );
  });

  it("does not list a category twice", () => {
    expect(
      hasIssue(
        issues({ categories: ["planning", "planning"] }),
        "categories",
        "only be listed once",
      ),
    ).toBe(true);
  });

  it("wants a list, not a single text", () => {
    expect(hasIssue(issues({ categories: "planning" }), "categories")).toBe(
      true,
    );
  });

  it("is spelled the way the store filters: lowercase ids", () => {
    expect(
      hasIssue(issues({ categories: ["Planning"] }), "categories[0]"),
    ).toBe(true);
  });
});

describe("keywords", () => {
  it("are optional and default to none", () => {
    const result = validateManifest(manifest());
    expect(result.ok && result.manifest.keywords).toEqual([]);
  });

  it("accepts lowercase words, digits and single dashes", () => {
    const keywords = ["calendar", "due-date", "2fa", "gantt-chart", "ab"];
    const result = validateManifest(manifest({ keywords }));
    expect(result.ok && result.manifest.keywords).toEqual(keywords);
  });

  it.each([
    ["Kalender", "uppercase"],
    ["a", "too short"],
    ["x".repeat(31), "too long"],
    ["due date", "space"],
    ["due--date", "double dash"],
    ["due-", "trailing dash"],
    ["-due", "leading dash"],
    ["äpfel", "non-ascii"],
    ["due_date", "underscore"],
  ])("rejects %s (%s)", (keyword) => {
    expect(hasIssue(issues({ keywords: [keyword] }), "keywords[0]")).toBe(true);
  });

  it("allows at most ten", () => {
    const keywords = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
    expect(hasIssue(issues({ keywords }), "keywords")).toBe(true);
    expect(
      validateManifest(manifest({ keywords: keywords.slice(0, 10) })).ok,
    ).toBe(true);
  });

  it("does not list a keyword twice", () => {
    expect(
      hasIssue(
        issues({ keywords: ["calendar", "calendar"] }),
        "keywords",
        "only be listed once",
      ),
    ).toBe(true);
  });
});

describe("capabilities", () => {
  it("accepts resource:action, with qualifiers and wildcard hosts", () => {
    const capabilities = [
      "issues:read",
      "comments:write",
      "network:egress:api.github.com",
      "network:egress:*.example.com",
      "storage:records",
    ];
    expect(validateManifest(manifest({ capabilities })).ok).toBe(true);
  });

  it.each([
    "Issues:read",
    "issues",
    "issues:",
    ":read",
    "issues:read write",
    "issues::read",
    "network:egress:-x",
    "x".repeat(121),
  ])("rejects the capability %j", (capability) => {
    expect(
      hasIssue(issues({ capabilities: [capability] }), "capabilities[0]"),
    ).toBe(true);
  });

  it("does not list a capability twice", () => {
    expect(
      hasIssue(
        issues({ capabilities: ["issues:read", "issues:read"] }),
        "capabilities",
        "only be listed once",
      ),
    ).toBe(true);
  });

  it("caps the list at 50", () => {
    const capabilities = Array.from({ length: 51 }, (_, i) => `res:action${i}`);
    expect(hasIssue(issues({ capabilities }), "capabilities")).toBe(true);
  });
});

describe("scope", () => {
  it("defaults to workspace, as a plugin was always meant to work", () => {
    const result = validateManifest(manifest());
    expect(result.ok && result.manifest.scope).toBe("workspace");
  });

  it.each(["workspace", "platform"])("accepts %s", (scope) => {
    const result = validateManifest(manifest({ scope }));
    expect(result.ok && result.manifest.scope).toBe(scope);
  });

  it.each(["Platform", "global", "instance", "", 1, null])(
    "rejects %j and names the two that exist",
    (scope) => {
      expect(
        hasIssue(
          issues({ scope }),
          "scope",
          'must be "workspace" or "platform"',
        ),
      ).toBe(true);
    },
  );
});

describe("dependencies", () => {
  it("takes plugin ids with version ranges", () => {
    expect(
      validateManifest(
        manifest({ dependencies: { "customer-tracking": "^1.0.0" } }),
      ).ok,
    ).toBe(true);
  });

  it("points at the dependency whose range is wrong or whose id is not a plugin id", () => {
    expect(
      hasIssue(
        issues({ dependencies: { other: "wat" } }),
        "dependencies.other",
        "SemVer range",
      ),
    ).toBe(true);
    expect(
      hasIssue(
        issues({ dependencies: { "Not Valid": "^1.0.0" } }),
        "dependencies.Not Valid",
        "not a valid key",
      ),
    ).toBe(true);
    expect(
      hasIssue(
        issues({ dependencies: { other: "*" } }),
        "dependencies.other",
        "every version",
      ),
    ).toBe(true);
  });

  it("does not let a plugin depend on itself", () => {
    expect(
      hasIssue(
        issues({ dependencies: { demo: "^1.0.0" } }),
        "dependencies.demo",
        "itself",
      ),
    ).toBe(true);
  });

  it("allows at most 20", () => {
    const dependencies = Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [`dep-${i}`, "^1.0.0"]),
    );
    expect(
      hasIssue(issues({ dependencies }), "dependencies", "at most 20"),
    ).toBe(true);
  });
});

describe("contributions", () => {
  it("knows every extension point the tickets name", () => {
    expect([...CONTRIBUTION_POINTS].sort() as string[]).toEqual(
      [
        "commands",
        "customFields",
        "dashboardWidgets",
        "events",
        "issueActions",
        "issuePanels",
        "jobs",
        "navigation",
        "notifications",
        "pages",
        "permissions",
        "settings",
        "views",
        "webhooks",
      ].sort(),
    );
  });

  it("accepts items with an id and an optional condition, and leaves other fields to the extension point", () => {
    const contributes = {
      views: [
        {
          id: "calendar",
          when: "project.hasDueDates",
          title: "Calendar",
          icon: "x",
        },
      ],
      pages: [],
    };
    expect(validateManifest(manifest({ contributes })).ok).toBe(true);
  });

  it("rejects an extension point that does not exist, a typo must not be silently ignored", () => {
    expect(
      hasIssue(
        issues({ contributes: { issuePanel: [{ id: "x" }] } }),
        "contributes.issuePanel",
        "not a known field",
      ),
    ).toBe(true);
  });

  it("requires an id on every item and says which item", () => {
    expect(
      hasIssue(
        issues({ contributes: { pages: [{ id: "a" }, {}] } }),
        "contributes.pages[1].id",
        "required",
      ),
    ).toBe(true);
  });

  it("holds ids to the same shape as plugin ids", () => {
    expect(
      hasIssue(
        issues({ contributes: { pages: [{ id: "Not_Ok" }] } }),
        "contributes.pages[0].id",
      ),
    ).toBe(true);
  });

  it("does not repeat an id within one list", () => {
    expect(
      hasIssue(
        issues({ contributes: { pages: [{ id: "a" }, { id: "a" }] } }),
        "contributes.pages",
        "unique",
      ),
    ).toBe(true);
  });

  it("allows the same id in different lists", () => {
    expect(
      validateManifest(
        manifest({
          contributes: { pages: [{ id: "a" }], views: [{ id: "a" }] },
        }),
      ).ok,
    ).toBe(true);
  });
});

describe("what is missing or unknown", () => {
  it.each([
    "manifestVersion",
    "id",
    "name",
    "version",
    "description",
    "author",
    "license",
    "categories",
    "barynt",
  ])("says that %s is required", (field) => {
    const input: Record<string, unknown> = manifest();
    delete input[field];
    const result = validateManifest(input);
    if (result.ok) throw new Error("expected an error");
    expect(hasIssue(result.issues, field, "is required")).toBe(true);
  });

  it("names the manifest format this Barynt reads when the version is another", () => {
    const list = issues({ manifestVersion: 2 });
    expect(hasIssue(list, "manifestVersion", "must be 1")).toBe(true);
  });

  it("rejects unknown top-level fields one by one, a typo like 'capabilites' must be seen", () => {
    const list = issues({ capabilites: [], extra: true });
    expect(hasIssue(list, "capabilites", "not a known field")).toBe(true);
    expect(hasIssue(list, "extra", "not a known field")).toBe(true);
  });

  it("accepts the editor's $schema field", () => {
    expect(
      validateManifest(manifest({ $schema: "https://example.com/schema.json" }))
        .ok,
    ).toBe(true);
  });

  it("rejects a file that is not an object at all", () => {
    for (const value of [[], "text", 5, null]) {
      const result = validateManifest(value);
      if (result.ok) throw new Error("expected an error");
      expect(result.issues[0]?.path).toBe("(manifest)");
    }
  });

  it("reports several problems at once instead of one per attempt", () => {
    expect(
      issues({ id: "Bad", version: "1", license: "?" }).length,
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("parsing the file's text", () => {
  it("accepts the text of a valid file", () => {
    expect(parseManifest(JSON.stringify(manifest())).ok).toBe(true);
  });

  it("copes with a byte order mark an editor may have added", () => {
    expect(parseManifest(`\uFEFF${JSON.stringify(manifest())}`).ok).toBe(true);
  });

  it("says when it is not JSON, instead of throwing", () => {
    const result = parseManifest("{ not json");
    if (result.ok) throw new Error("expected an error");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.path).toBe("(manifest)");
    expect(result.issues[0]?.message).toContain(
      "barynt-plugin.json is not valid JSON",
    );
  });

  it("validates what it parsed", () => {
    const result = parseManifest(JSON.stringify(manifest({ id: "Bad" })));
    expect(result.ok).toBe(false);
  });
});

describe("formatIssues", () => {
  it("prints one 'path: message' line per issue", () => {
    expect(
      formatIssues([
        { path: "id", message: "is required" },
        { path: "(manifest)", message: "no" },
      ]),
    ).toEqual(["id: is required", "(manifest): no"]);
  });
});

describe("hostile input", () => {
  it("never throws, whatever a manifest holds in any field", () => {
    // `homepage: "not a url"` used to make `new URL()` throw inside a rule.
    const hostile: unknown[] = [
      null,
      undefined,
      0,
      -1,
      Number.POSITIVE_INFINITY,
      NaN,
      true,
      "",
      " ",
      "not a url",
      "x".repeat(100_000),
      [],
      [[]],
      [null],
      {},
      { a: { b: { c: [] } } },
      { __proto__: { polluted: true } },
      "\u0000",
      "\uFEFF",
      "http://",
      "https://",
      "https://exa mple.com",
      "javascript:alert(1)",
      Symbol.iterator.toString(),
      () => undefined,
    ];
    const fields = [
      "manifestVersion",
      "id",
      "name",
      "version",
      "description",
      "author",
      "license",
      "homepage",
      "repository",
      "icon",
      "barynt",
      "dependencies",
      "server",
      "client",
      "styles",
      "messages",
      "capabilities",
      "contributes",
      "$schema",
    ];
    for (const field of fields) {
      for (const value of hostile) {
        // Some of these are valid for some fields (an empty object as
        // `dependencies`), so only the outcome's shape is asserted, not its value.
        const result = validateManifest(manifest({ [field]: value }));
        expect(typeof result.ok).toBe("boolean");
        if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
      }
    }
  });

  it("does not let a JSON key called __proto__ smuggle in a field", () => {
    const parsed = parseManifest(
      `{"__proto__": {"id": "evil"}, "manifestVersion": 1, "id": "demo", "name": "D", "version": "1.0.0", "description": "d", "author": "a", "license": "MIT", "barynt": "^1.0.0"}`,
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok)
      expect(hasIssue(parsed.issues, "__proto__", "not a known field")).toBe(
        true,
      );
  });

  it("treats names that exist on every object as ordinary ids", () => {
    // `"constructor" in {}` is true, so an `in` check would misread these.
    for (const id of ["constructor", "tostring", "valueof"]) {
      expect(validateManifest(manifest({ id })).ok).toBe(true);
    }
    expect(
      validateManifest(manifest({ dependencies: { constructor: "^1.0.0" } }))
        .ok,
    ).toBe(true);
    expect(
      hasIssue(
        issues({ id: "constructor", dependencies: { constructor: "^1.0.0" } }),
        "dependencies.constructor",
        "itself",
      ),
    ).toBe(true);
  });
});
