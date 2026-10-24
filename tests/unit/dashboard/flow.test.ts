import { describe, expect, it } from "bun:test";
import {
  type StatusEventRow,
  sumStays,
  tallyFlow,
} from "@/features/dashboard/flow";

// The flow metrics' arithmetic (BARY-171) — where issues stood at the end
// of each bucket, and how long they stayed. Off by one here and every
// cumulative flow chart is quietly a day late.

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 9, 1);
const at = (days: number) => new Date(t0 + days * DAY);
const ev = (
  issueId: string,
  toCategory: string,
  days: number,
  toStatus = toCategory,
): StatusEventRow => ({ issueId, toStatus, toCategory, at: at(days) });

const byCategory = (e: StatusEventRow) => e.toCategory;

describe("tallyFlow", () => {
  const events = [
    ev("a", "unstarted", 0),
    ev("b", "backlog", 0.5),
    ev("a", "started", 1.5),
    ev("a", "completed", 3),
    ev("c", "unstarted", 3),
    ev("b", "canceled", 3.5),
  ].sort((x, y) => x.at.getTime() - y.at.getTime());
  const keys = ["completed", "started", "unstarted", "backlog"];
  // Bucket ends: day 1, 2, 3, 4.
  const ends = [1, 2, 3, 4].map((d) => t0 + d * DAY);

  it("counts where every issue stood at each bucket's end", () => {
    expect(tallyFlow(events, ends, keys, byCategory)).toEqual([
      [0, 0, 0, 1], // completed
      [0, 1, 1, 0], // started
      [1, 0, 0, 1], // unstarted
      [1, 1, 1, 0], // backlog
    ]);
  });

  it("an event exactly at a bucket's end belongs to the next", () => {
    // a completes at day 3 sharp — not yet at the end of bucket 3.
    const [completed] = tallyFlow(events, ends, keys, byCategory);
    expect(completed[2]).toBe(0);
  });

  it("leaves out what isn't a band (canceled, a hidden one)", () => {
    const values = tallyFlow(events, ends, ["started"], byCategory);
    expect(values).toEqual([[0, 1, 1, 0]]);
  });

  it("can count by status", () => {
    const statuses = [
      ev("a", "started", 0, "doing"),
      ev("b", "started", 0, "review"),
    ];
    expect(
      tallyFlow(statuses, [t0 + DAY], ["doing", "review"], (e) => e.toStatus),
    ).toEqual([[1], [1]]);
  });
});

describe("sumStays", () => {
  it("adds up stays that ended in the range", () => {
    const events = [
      ev("a", "unstarted", 0),
      ev("a", "started", 2),
      ev("a", "completed", 5),
      ev("b", "unstarted", 1),
      ev("b", "started", 5),
    ];
    const sums = sumStays(events, t0, ["unstarted", "started"], byCategory);
    expect(sums.get("unstarted")).toEqual({ ms: 6 * DAY, count: 2 });
    expect(sums.get("started")).toEqual({ ms: 3 * DAY, count: 1 });
  });

  it("skips stays that ended before the range", () => {
    const events = [ev("a", "unstarted", 0), ev("a", "started", 2)];
    const sums = sumStays(events, t0 + 3 * DAY, ["unstarted"], byCategory);
    expect(sums.get("unstarted")).toEqual({ ms: 0, count: 0 });
  });

  it("a stay still going isn't counted", () => {
    const sums = sumStays([ev("a", "started", 0)], t0, ["started"], byCategory);
    expect(sums.get("started")?.count).toBe(0);
  });
});
