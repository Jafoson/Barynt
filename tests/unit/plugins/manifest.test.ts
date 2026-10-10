import { describe, expect, it } from "bun:test";
import {
  CAPABILITIES,
  isCompatible,
  validateManifest,
} from "@/lib/plugins/manifest";
import { compareSemver, parseSemver } from "@/lib/plugins/semver";

const base = {
  id: "gantt-timeline",
  name: "Gantt Timeline",
  version: "1.2.0",
  minBaryntVersion: "0.1.0",
  author: "Acme GmbH",
  description: "Issues on a timeline.",
  license: "MIT",
  kind: "sandbox",
  levels: ["project"],
  capabilities: ["issues:read", "ui:project-view"],
  network: [],
  contributes: { projectViews: [{ id: "timeline", title: "Timeline" }] },
};

function errors(input: unknown) {
  const r = validateManifest(input);
  return r.ok ? [] : r.errors.map((e) => `${e.path}: ${e.message}`);
}

describe("validateManifest", () => {
  it("accepts a complete sandbox plugin", () => {
    const r = validateManifest(base);
    expect(r.ok).toBe(true);
  });

  it("accepts a declarative plugin with fields and a badge", () => {
    const r = validateManifest({
      ...base,
      id: "customer-info",
      kind: "declarative",
      levels: ["workspace", "project"],
      capabilities: ["fields:write", "ui:issue-badge"],
      contributes: {
        fields: [{ key: "customer", name: "Customer", type: "TEXT" }],
        issueBadges: [{ id: "customer", title: "Customer" }],
      },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects unknown fields", () => {
    expect(errors({ ...base, homepage: "x" }).length).toBeGreaterThan(0);
    expect(
      errors({ ...base, contributes: { ...base.contributes, widgets: [] } })
        .length,
    ).toBeGreaterThan(0);
  });

  it("rejects an unknown field inside a contribution", () => {
    const e = errors({
      ...base,
      contributes: {
        projectViews: [
          { id: "timeline", title: "Timeline", url: "https://x.y" },
        ],
      },
    });
    expect(e.length).toBeGreaterThan(0);
  });

  it("rejects an unknown capability", () => {
    expect(
      errors({ ...base, capabilities: ["issues:read", "db:everything"] })
        .length,
    ).toBeGreaterThan(0);
  });

  it("rejects a reserved or malformed id", () => {
    expect(errors({ ...base, id: "core" })[0]).toContain("reserved");
    expect(errors({ ...base, id: "Bad_Id" }).length).toBeGreaterThan(0);
    expect(errors({ ...base, id: "a" }).length).toBeGreaterThan(0);
  });

  it("requires the capability a contribution needs", () => {
    const e = errors({ ...base, capabilities: ["issues:read"] });
    expect(e.join()).toContain("ui:project-view");
  });

  it("keeps a declarative plugin free of code and hosts", () => {
    const e = errors({
      ...base,
      kind: "declarative",
      network: ["api.example.com"],
    });
    expect(e.join()).toContain("cannot call hosts");
    const f = errors({ ...base, kind: "declarative" });
    expect(f.join()).toContain("cannot contribute projectViews");
  });

  it("keeps a service out of the browser surface", () => {
    const e = errors({
      ...base,
      kind: "service",
      network: ["api.acme.example"],
    });
    expect(e.join()).toContain("cannot contribute projectViews");
  });

  it("rejects hosts with scheme, path, port or wildcard", () => {
    for (const host of [
      "https://api.example.com",
      "api.example.com/v1",
      "api.example.com:8080",
      "*.example.com",
      "localhost",
      "10.0.0.1",
    ]) {
      expect(errors({ ...base, network: [host] }).length).toBeGreaterThan(0);
    }
    expect(errors({ ...base, network: ["gitlab.com"] })).toEqual([]);
  });

  it("rejects duplicate ids within a list", () => {
    const e = errors({
      ...base,
      contributes: {
        projectViews: [
          { id: "timeline", title: "A" },
          { id: "timeline", title: "B" },
        ],
      },
    });
    expect(e.join()).toContain("unique");
  });

  it("needs options for a choice field and rejects them elsewhere", () => {
    const mk = (field: object) =>
      errors({
        ...base,
        kind: "declarative",
        capabilities: ["fields:write"],
        contributes: { fields: [field] },
      });
    expect(mk({ key: "size", name: "Size", type: "SELECT" }).join()).toContain(
      "needs options",
    );
    expect(
      mk({
        key: "size",
        name: "Size",
        type: "TEXT",
        options: [{ id: "s", label: "S" }],
      }).join(),
    ).toContain("only choice fields");
  });

  it("checks the version order", () => {
    expect(
      errors({
        ...base,
        minBaryntVersion: "0.5.0",
        maxBaryntVersion: "0.2.0",
      })[0],
    ).toContain("lower than");
    expect(errors({ ...base, version: "1.2" }).length).toBeGreaterThan(0);
  });

  it("requires author and license", () => {
    const { author: _a, ...noAuthor } = base;
    const { license: _l, ...noLicense } = base;
    expect(errors(noAuthor).length).toBeGreaterThan(0);
    expect(errors(noLicense).length).toBeGreaterThan(0);
  });

  it("never throws on junk", () => {
    for (const junk of [null, undefined, 5, "x", [], {}]) {
      expect(() => validateManifest(junk)).not.toThrow();
      expect(validateManifest(junk).ok).toBe(false);
    }
  });

  it("lists every capability exactly once", () => {
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length);
  });
});

describe("isCompatible", () => {
  it("honours the lowest and the highest version", () => {
    const m = { minBaryntVersion: "0.2.0", maxBaryntVersion: "0.4.0" };
    expect(isCompatible(m, "0.1.9")).toBe(false);
    expect(isCompatible(m, "0.2.0")).toBe(true);
    expect(isCompatible(m, "0.4.0")).toBe(true);
    expect(isCompatible(m, "0.4.1")).toBe(false);
    expect(isCompatible({ minBaryntVersion: "0.2.0" }, "3.0.0")).toBe(true);
  });
});

describe("semver", () => {
  it("parses and orders versions", () => {
    expect(parseSemver("1.2.3")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: null,
    });
    expect(parseSemver("01.2.3")).toBeNull();
    expect(parseSemver("1.2")).toBeNull();
    expect(compareSemver("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0-alpha", "1.0.0")).toBeLessThan(0);
    expect(compareSemver("1.0.0-alpha.2", "1.0.0-alpha.10")).toBeLessThan(0);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(() => compareSemver("x", "1.0.0")).toThrow();
  });
});
