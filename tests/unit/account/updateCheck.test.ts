import { afterEach, describe, expect, mock, test } from "bun:test";
import { getAvailableUpdate, isNewerVersion } from "@/lib/update-check";

describe("isNewerVersion", () => {
  test.each([
    ["0.2.0", "0.1.0", true],
    ["v1.0.0", "0.9.9", true],
    ["0.1.10", "0.1.9", true],
    ["0.1.0", "0.1.0", false],
    ["0.1.0", "0.2.0", false],
    ["1.0.0-rc.1", "0.1.0", false],
    ["nightly", "0.1.0", false],
  ])("%s vs %s → %s", (latest, current, expected) => {
    expect(isNewerVersion(latest, current)).toBe(expected);
  });
});

describe("getAvailableUpdate", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.UPDATE_CHECK;
  });

  const answer = (body: unknown, ok = true) => {
    globalThis.fetch = mock(async () => ({
      ok,
      json: async () => body,
    })) as unknown as typeof fetch;
  };

  test("returns the release when it is newer", async () => {
    answer({ tag_name: "v99.0.0" });
    expect(await getAvailableUpdate()).toEqual({
      version: "99.0.0",
      url: "https://github.com/barynt-dev/barynt-web/releases/tag/v99.0.0",
    });
  });

  test("nothing to show when up to date, on an error or without a release", async () => {
    answer({ tag_name: "v0.0.1" });
    expect(await getAvailableUpdate()).toBeNull();
    answer({ message: "Not Found" }, false);
    expect(await getAvailableUpdate()).toBeNull();
    globalThis.fetch = mock(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await getAvailableUpdate()).toBeNull();
  });

  test("UPDATE_CHECK=false doesn't call out at all", async () => {
    process.env.UPDATE_CHECK = "false";
    answer({ tag_name: "v99.0.0" });
    expect(await getAvailableUpdate()).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
