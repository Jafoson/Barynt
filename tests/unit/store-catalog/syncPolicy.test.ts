import { describe, expect, it } from "bun:test";
import {
  DEFAULT_MAX_AGE_HOURS,
  MAX_MAX_AGE_HOURS,
  RETRY_AFTER_MS,
  type SyncConfig,
  syncConfig,
  syncDue,
} from "@/lib/plugins/store/syncPolicy";

// When opening the store page fetches a store on its own: never for one that is switched off
// by the environment, at once for one that was never fetched, after a while for one whose
// state is old, and not again right after an attempt, so an unreachable store is not asked
// on every visit.

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-09-24T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const config: SyncConfig = { auto: true, maxAgeMs: 6 * HOUR };
const due = (
  store: { syncedAt: Date | null; syncAttemptedAt: Date | null },
  c: SyncConfig = config,
) => syncDue(store, c, NOW);

describe("the settings", () => {
  it("fetch on their own, every six hours, when nothing is set", () => {
    expect(syncConfig({})).toEqual({ auto: true, maxAgeMs: 6 * HOUR });
    expect(DEFAULT_MAX_AGE_HOURS).toBe(6);
  });

  it.each(["off", "OFF", " off ", "false", "False", "0", "no", "No"])(
    "do not fetch on their own for BARYNT_STORE_AUTO_SYNC=%j",
    (value) => {
      expect(syncConfig({ BARYNT_STORE_AUTO_SYNC: value }).auto).toBe(false);
    },
  );

  it.each(["on", "true", "1", "yes", "", "sometimes"])(
    "do fetch on their own for BARYNT_STORE_AUTO_SYNC=%j",
    (value) => {
      expect(syncConfig({ BARYNT_STORE_AUTO_SYNC: value }).auto).toBe(true);
    },
  );

  it("keep an age to a month at most", () => {
    expect(MAX_MAX_AGE_HOURS).toBe(720);
    expect(syncConfig({ BARYNT_STORE_MAX_AGE_HOURS: "720" }).maxAgeMs).toBe(
      720 * HOUR,
    );
    expect(syncConfig({ BARYNT_STORE_MAX_AGE_HOURS: "720.5" }).maxAgeMs).toBe(
      6 * HOUR,
    );
  });

  it("take the age from BARYNT_STORE_MAX_AGE_HOURS, whole or not", () => {
    expect(syncConfig({ BARYNT_STORE_MAX_AGE_HOURS: "1" }).maxAgeMs).toBe(HOUR);
    expect(syncConfig({ BARYNT_STORE_MAX_AGE_HOURS: " 12 " }).maxAgeMs).toBe(
      12 * HOUR,
    );
    expect(syncConfig({ BARYNT_STORE_MAX_AGE_HOURS: "0.5" }).maxAgeMs).toBe(
      HOUR / 2,
    );
    expect(
      syncConfig({ BARYNT_STORE_MAX_AGE_HOURS: String(MAX_MAX_AGE_HOURS) })
        .maxAgeMs,
    ).toBe(MAX_MAX_AGE_HOURS * HOUR);
  });

  it.each([
    "0",
    "-3",
    "abc",
    "",
    "   ",
    "Infinity",
    "NaN",
    String(MAX_MAX_AGE_HOURS + 1),
    "1e9",
  ])(
    "fall back to the default for BARYNT_STORE_MAX_AGE_HOURS=%j, not to an error",
    (value) => {
      expect(syncConfig({ BARYNT_STORE_MAX_AGE_HOURS: value }).maxAgeMs).toBe(
        6 * HOUR,
      );
    },
  );

  it("are separate: switching off does not change the age", () => {
    expect(
      syncConfig({
        BARYNT_STORE_AUTO_SYNC: "off",
        BARYNT_STORE_MAX_AGE_HOURS: "2",
      }),
    ).toEqual({ auto: false, maxAgeMs: 2 * HOUR });
  });
});

describe("when a store is fetched", () => {
  it("at once and waited for, when it never was", () => {
    expect(due({ syncedAt: null, syncAttemptedAt: null })).toBe("never");
  });

  it("afterwards, when the state is older than allowed", () => {
    expect(
      due({ syncedAt: ago(6 * HOUR + 1), syncAttemptedAt: ago(6 * HOUR + 1) }),
    ).toBe("stale");
    expect(
      due({ syncedAt: ago(30 * HOUR), syncAttemptedAt: ago(30 * HOUR) }),
    ).toBe("stale");
  });

  it("not when the state is as old as allowed, or younger", () => {
    expect(
      due({ syncedAt: ago(6 * HOUR), syncAttemptedAt: ago(6 * HOUR) }),
    ).toBeNull();
    expect(due({ syncedAt: ago(HOUR), syncAttemptedAt: ago(HOUR) })).toBeNull();
    expect(due({ syncedAt: NOW, syncAttemptedAt: NOW })).toBeNull();
  });

  it("with the age that was set", () => {
    const short: SyncConfig = { auto: true, maxAgeMs: HOUR };
    expect(
      due({ syncedAt: ago(2 * HOUR), syncAttemptedAt: ago(2 * HOUR) }, short),
    ).toBe("stale");
    expect(
      due({ syncedAt: ago(2 * HOUR), syncAttemptedAt: ago(2 * HOUR) }),
    ).toBeNull();
  });

  it("not at all when fetching on its own is off, whatever the state", () => {
    const off: SyncConfig = { auto: false, maxAgeMs: 6 * HOUR };
    expect(due({ syncedAt: null, syncAttemptedAt: null }, off)).toBeNull();
    expect(
      due({ syncedAt: ago(100 * HOUR), syncAttemptedAt: null }, off),
    ).toBeNull();
  });
});

describe("not again right after an attempt", () => {
  it("also for a store that was never fetched, which is what an unreachable one looks like", () => {
    expect(
      due({ syncedAt: null, syncAttemptedAt: ago(RETRY_AFTER_MS - 1) }),
    ).toBeNull();
    expect(due({ syncedAt: null, syncAttemptedAt: NOW })).toBeNull();
  });

  it("and for one whose state is old", () => {
    expect(
      due({
        syncedAt: ago(20 * HOUR),
        syncAttemptedAt: ago(RETRY_AFTER_MS - 1),
      }),
    ).toBeNull();
  });

  it("but after ten minutes, again", () => {
    expect(RETRY_AFTER_MS).toBe(10 * 60 * 1000);
    expect(due({ syncedAt: null, syncAttemptedAt: ago(RETRY_AFTER_MS) })).toBe(
      "never",
    );
    expect(
      due({ syncedAt: ago(20 * HOUR), syncAttemptedAt: ago(RETRY_AFTER_MS) }),
    ).toBe("stale");
  });
});
