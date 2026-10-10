import { beforeEach, describe, expect, it, mock } from "bun:test";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUpsert = mock();

mock.module("@/lib/db", () => ({
  db: { userPreferences: { upsert: mockUpsert } },
}));

const mockGetSession = mock();
mock.module("@/lib/session", () => ({ getSession: mockGetSession }));
mock.module("@/auth", () => ({ unstable_update: mock() }));
mock.module("next/cache", () => ({ revalidatePath: mock() }));

import { updateBehavior } from "@/features/account/actions";
import {
  DEFAULT_BEHAVIOR,
  isTimeZone,
  toBehavior,
  toShortcutOverrides,
} from "@/features/account/preferences";

const ME = "u-me";

function reset() {
  for (const m of [mockUpsert, mockGetSession]) m.mockReset();
  mockGetSession.mockResolvedValue({ userId: ME });
  mockUpsert.mockResolvedValue({ userId: ME });
}

describe("updateBehavior()", () => {
  beforeEach(reset);

  it("rejects when nobody is logged in", async () => {
    mockGetSession.mockResolvedValue(null);
    expect(await updateBehavior({ issueOpenMode: "page" })).toEqual({
      error: "You must be logged in.",
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("writes only what is named", async () => {
    expect(
      await updateBehavior({
        projectLanding: "list",
        confirmDestructive: false,
      }),
    ).toEqual({ ok: true });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { userId: ME },
      create: { userId: ME, projectLanding: "list", confirmDestructive: false },
      update: { projectLanding: "list", confirmDestructive: false },
    });
  });

  // The values land in routes and `switch`es — a value the app doesn't know
  // must never be stored.
  it("refuses unknown choices as a whole", async () => {
    const result = await updateBehavior({
      projectLanding: "list",
      issueOpenMode: "popup" as "panel",
    });
    expect(result).toEqual({ error: "Unknown value for issueOpenMode." });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("refuses a start page that isn't one", async () => {
    expect(await updateBehavior({ startPage: "/admin" as "my" })).toEqual({
      error: "Unknown value for startPage.",
    });
  });

  it("checks flags are booleans", async () => {
    expect(
      await updateBehavior({
        confirmDestructive: "no" as unknown as boolean,
      }),
    ).toEqual({ error: "Unknown value for confirmDestructive." });
  });

  it("accepts a real time zone, `null` for automatic, nothing else", async () => {
    expect(await updateBehavior({ timeZone: "Europe/Berlin" })).toEqual({
      ok: true,
    });
    expect(await updateBehavior({ timeZone: null })).toEqual({ ok: true });
    expect(mockUpsert.mock.calls[1][0].update).toEqual({ timeZone: null });
    expect(await updateBehavior({ timeZone: "Mars/Olympus" })).toEqual({
      error: "Unknown time zone.",
    });
  });

  it("stores shortcut overrides that read as shortcuts", async () => {
    expect(
      await updateBehavior({ shortcutOverrides: { c: "x", "g+d": "g+h" } }),
    ).toEqual({ ok: true });
    expect(mockUpsert.mock.calls[0][0].update).toEqual({
      shortcutOverrides: { c: "x", "g+d": "g+h" },
    });
  });

  it("refuses two shortcuts on the same keys", async () => {
    expect(
      await updateBehavior({ shortcutOverrides: { c: "x", n: "X" } }),
    ).toEqual({ error: "Two shortcuts can't share the same keys." });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("refuses something that isn't a shortcut", async () => {
    expect(
      await updateBehavior({ shortcutOverrides: { c: "not a key" } }),
    ).toEqual({ error: "Invalid shortcut." });
  });

  it("writes nothing when nothing is given", async () => {
    expect(await updateBehavior({})).toEqual({ ok: true });
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("toBehavior()", () => {
  it("falls back to the defaults for an empty row", () => {
    expect(toBehavior({})).toEqual(DEFAULT_BEHAVIOR);
  });

  // A value from an older or newer build must not reach a `switch`.
  it("replaces values it doesn't know", () => {
    const result = toBehavior({
      issueOpenMode: "sidebar",
      startPage: "settings",
      timeZone: "Nowhere/City",
      dateFormat: "absolute",
    });
    expect(result.issueOpenMode).toBe("panel");
    expect(result.startPage).toBe("workspace");
    expect(result.timeZone).toBeNull();
    expect(result.dateFormat).toBe("absolute");
  });

  it("reads the full-page mode, with a default for anything else", () => {
    expect(
      toBehavior({ issuePageOpenMode: "browserTab" }).issuePageOpenMode,
    ).toBe("browserTab");
    expect(toBehavior({ issuePageOpenMode: "popup" }).issuePageOpenMode).toBe(
      "tab",
    );
  });

  it("keeps valid choices", () => {
    expect(
      toBehavior({
        projectLanding: "dashboard",
        defaultGrouping: "priority",
        defaultSort: "dueDate",
        weekStart: "sunday",
        confirmDestructive: false,
      }),
    ).toMatchObject({
      projectLanding: "dashboard",
      defaultGrouping: "priority",
      defaultSort: "dueDate",
      weekStart: "sunday",
      confirmDestructive: false,
    });
  });
});

describe("toShortcutOverrides()", () => {
  it("keeps string entries only", () => {
    expect(toShortcutOverrides({ c: "x", n: 5, p: "", q: null })).toEqual({
      c: "x",
    });
  });

  it("answers an empty map for anything that isn't an object", () => {
    expect(toShortcutOverrides(null)).toEqual({});
    expect(toShortcutOverrides(["c"])).toEqual({});
    expect(toShortcutOverrides("c")).toEqual({});
  });
});

describe("isTimeZone()", () => {
  it("knows IANA zones", () => {
    expect(isTimeZone("Europe/Berlin")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Berlin")).toBe(false);
  });
});
