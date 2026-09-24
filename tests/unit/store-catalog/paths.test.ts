import { describe, expect, it } from "bun:test";
import { storeCloneDir, storeDirName } from "@/lib/plugins/store/paths";

// Where a store's clone lives. The name is built from an address a person entered, so it
// has to be one safe path segment whatever the address says.

describe("the name of a store's clone", () => {
  it("is the address as words and a short hash", () => {
    expect(storeDirName("github.com/jafoson/barynt-plugin-store")).toMatch(
      /^github-com-jafoson-barynt-plugin-store-[0-9a-f]{10}$/,
    );
  });

  it("is always one plain segment: no slash, no dot, no traversal", () => {
    for (const key of [
      "github.com/a/b",
      "../../etc/passwd",
      "a/../b",
      "a\\b",
      "x y",
      "é/ü",
      ".",
      "..",
      "",
    ]) {
      const name = storeDirName(key);
      expect(name).toMatch(/^[a-z0-9-]+$/);
      expect(name).not.toContain("..");
    }
  });

  it("is the hash alone for an address that is all symbols", () => {
    expect(storeDirName("///")).toMatch(/^[0-9a-f]{10}$/);
  });

  it("is the same for the same address and different for another", () => {
    expect(storeDirName("a.com/x")).toBe(storeDirName("a.com/x"));
    expect(storeDirName("a.com/x")).not.toBe(storeDirName("a.com/y"));
  });

  it("does not let two addresses that differ only in symbols share a name", () => {
    expect(storeDirName("a.com/x-y")).not.toBe(storeDirName("a.com/x/y"));
  });

  it("is short enough to be a path segment", () => {
    expect(storeDirName(`host/${"a".repeat(500)}`).length).toBeLessThan(64);
  });
});

describe("the clone's directory", () => {
  it("lies in `.stores` inside the plugin directory, where discovery does not look", () => {
    const dir = storeCloneDir("/plugins", "github.com/a/b");
    expect(dir.startsWith("/plugins/.stores/")).toBe(true);
    expect(dir.split("/")).toHaveLength(4);
  });
});
