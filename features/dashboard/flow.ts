// The flow metrics' arithmetic (BARY-171), apart from the database: given
// the status history, where issues stood when, and how long they stayed.

export interface StatusEventRow {
  issueId: string;
  toStatus: string;
  toCategory: string;
  at: Date;
}

/** Cumulative flow: at each moment in `ends`, how many issues stood under
 *  each key (`keyOf` picks status or category). Events oldest first; keys
 *  not in `keys` (canceled, a hidden band) aren't counted. */
export function tallyFlow(
  events: StatusEventRow[],
  ends: number[],
  keys: string[],
  keyOf: (event: StatusEventRow) => string,
): number[][] {
  const index = new Map(keys.map((key, i) => [key, i]));
  const values = keys.map(() => ends.map(() => 0));
  const standing = new Map<string, string>();
  let next = 0;
  ends.forEach((end, i) => {
    while (next < events.length && events[next].at.getTime() < end) {
      const event = events[next++];
      standing.set(event.issueId, keyOf(event));
    }
    for (const key of standing.values()) {
      const k = index.get(key);
      if (k !== undefined) values[k][i] += 1;
    }
  });
  return values;
}

/** Time in status: the stays under each key that ended at or after
 *  `from` — their total length (ms) and how many. Events oldest first. */
export function sumStays(
  events: StatusEventRow[],
  from: number,
  keys: string[],
  keyOf: (event: StatusEventRow) => string,
): Map<string, { ms: number; count: number }> {
  const sums = new Map(keys.map((key) => [key, { ms: 0, count: 0 }]));
  const last = new Map<string, StatusEventRow>();
  for (const event of events) {
    const before = last.get(event.issueId);
    if (before && event.at.getTime() >= from) {
      const sum = sums.get(keyOf(before));
      if (sum) {
        sum.ms += event.at.getTime() - before.at.getTime();
        sum.count += 1;
      }
    }
    last.set(event.issueId, event);
  }
  return sums;
}
