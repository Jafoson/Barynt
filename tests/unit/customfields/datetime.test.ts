import { describe, expect, it } from "bun:test";
import { validateFieldValue } from "@/lib/custom-fields";
import {
  formatFieldDate,
  normalizeInstant,
  utcToZonedLocal,
  zonedLocalToUtc,
} from "@/lib/custom-fields/datetime";

describe("zonedLocalToUtc / utcToZonedLocal", () => {
  it("converts summer and winter time of a zone", () => {
    expect(zonedLocalToUtc("2026-07-01T12:00", "Europe/Berlin")).toBe(
      "2026-07-01T10:00:00.000Z",
    );
    expect(zonedLocalToUtc("2026-01-15T12:00", "Europe/Berlin")).toBe(
      "2026-01-15T11:00:00.000Z",
    );
    expect(zonedLocalToUtc("2026-07-01T12:00", "America/New_York")).toBe(
      "2026-07-01T16:00:00.000Z",
    );
    expect(zonedLocalToUtc("2026-07-01T12:00", "UTC")).toBe(
      "2026-07-01T12:00:00.000Z",
    );
  });

  it("is the inverse of the other direction", () => {
    for (const zone of ["Europe/Berlin", "America/New_York", "Asia/Kolkata"]) {
      const iso = zonedLocalToUtc("2026-03-10T08:15", zone) as string;
      expect(utcToZonedLocal(iso, zone)).toBe("2026-03-10T08:15");
    }
  });

  it("handles a zone with a half-hour offset", () => {
    expect(zonedLocalToUtc("2026-03-10T08:15", "Asia/Kolkata")).toBe(
      "2026-03-10T02:45:00.000Z",
    );
  });

  it("rejects what is not a local date-time", () => {
    for (const bad of [
      "",
      "2026-07-01",
      "2026-07-01 12:00",
      "2026-02-30T10:00",
      "2026-07-01T25:00",
    ]) {
      expect(zonedLocalToUtc(bad, "UTC")).toBeNull();
    }
  });

  it("gives an answer for a time that does not exist (clocks go forward)", () => {
    const iso = zonedLocalToUtc("2026-03-29T02:30", "Europe/Berlin");
    expect(iso).not.toBeNull();
    // Whatever side of the gap it picks, it is a valid instant within the hour.
    const t = Date.parse(iso as string);
    expect(t).toBeGreaterThanOrEqual(Date.parse("2026-03-29T00:30:00Z"));
    expect(t).toBeLessThanOrEqual(Date.parse("2026-03-29T01:30:00Z"));
  });
});

describe("normalizeInstant", () => {
  it("reduces to UTC with minute precision", () => {
    expect(normalizeInstant("2026-07-01T12:00:45+02:00")).toBe(
      "2026-07-01T10:00:00.000Z",
    );
    expect(normalizeInstant("2026-07-01T10:00Z")).toBe(
      "2026-07-01T10:00:00.000Z",
    );
  });

  it("needs a zone", () => {
    expect(normalizeInstant("2026-07-01T10:00")).toBeNull();
    expect(normalizeInstant("2026-07-01")).toBeNull();
    expect(normalizeInstant("junk")).toBeNull();
  });
});

describe("validateFieldValue for the date modes", () => {
  it("DATE takes a calendar day only", () => {
    const f = { type: "DATE", dateMode: "DATE" } as const;
    expect(validateFieldValue(f, "2026-07-01").ok).toBe(true);
    expect(validateFieldValue(f, "12:30").ok).toBe(false);
  });

  it("TIME takes HH:mm only", () => {
    const f = { type: "DATE", dateMode: "TIME" } as const;
    expect(validateFieldValue(f, "09:05")).toEqual({
      ok: true,
      value: "09:05",
    });
    expect(validateFieldValue(f, "24:00").ok).toBe(false);
    expect(validateFieldValue(f, "9:05").ok).toBe(false);
    expect(validateFieldValue(f, "2026-07-01").ok).toBe(false);
  });

  it("DATETIME takes an instant with a zone and stores it in UTC", () => {
    const f = { type: "DATE", dateMode: "DATETIME" } as const;
    expect(validateFieldValue(f, "2026-07-01T12:00:00+02:00")).toEqual({
      ok: true,
      value: "2026-07-01T10:00:00.000Z",
    });
    expect(validateFieldValue(f, "2026-07-01T12:00").ok).toBe(false);
    expect(validateFieldValue(f, "2026-07-01").ok).toBe(false);
  });

  it("defaults to a calendar day when no mode is given", () => {
    expect(validateFieldValue({ type: "DATE" }, "2026-07-01").ok).toBe(true);
  });
});

describe("formatFieldDate", () => {
  const base = {
    dateFormat: "medium" as const,
    timeFormat: "24h" as const,
    timeZone: "Europe/Berlin",
    locale: "de",
  };

  it("formats a day in the chosen style", () => {
    expect(formatFieldDate("2026-10-12", { ...base, mode: "DATE" })).toBe(
      "12.10.2026",
    );
    expect(
      formatFieldDate("2026-10-12", {
        ...base,
        mode: "DATE",
        dateFormat: "iso",
      }),
    ).toBe("2026-10-12");
    expect(
      formatFieldDate("2026-10-12", {
        ...base,
        mode: "DATE",
        dateFormat: "long",
        locale: "en",
      }),
    ).toBe("October 12, 2026");
  });

  it("formats a time of day in 24 or 12 hours", () => {
    expect(formatFieldDate("14:30", { ...base, mode: "TIME" })).toBe("14:30");
    expect(
      formatFieldDate("14:30", {
        ...base,
        mode: "TIME",
        timeFormat: "12h",
        locale: "en",
      }),
    ).toMatch(/^2:30\s?PM$/);
  });

  it("shows an instant in the viewer's zone", () => {
    expect(
      formatFieldDate("2026-07-01T10:00:00.000Z", {
        ...base,
        mode: "DATETIME",
      }),
    ).toBe("01.07.2026, 12:00");
    expect(
      formatFieldDate("2026-07-01T10:00:00.000Z", {
        ...base,
        mode: "DATETIME",
        timeZone: "America/New_York",
        dateFormat: "iso",
      }),
    ).toBe("2026-07-01 06:00");
  });

  it("returns a value that does not fit the mode as it is", () => {
    expect(formatFieldDate("junk", { ...base, mode: "DATETIME" })).toBe("junk");
    expect(formatFieldDate("junk", { ...base, mode: "DATE" })).toBe("junk");
    expect(formatFieldDate("junk", { ...base, mode: "TIME" })).toBe("junk");
  });
});
