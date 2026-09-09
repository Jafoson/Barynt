/**
 * Sparse fieldsets — Jira's `expand`/`fields` idea, simplified to a single
 * allowlist param. `?fields=id,title,status` trims a response object down
 * to just those keys, so a list view that only needs a few columns doesn't
 * have to pull the full (potentially large) `description` field over the
 * wire for every row.
 *
 * Applied in the route handlers, not the query layer — the query keeps
 * returning the full shape, the route decides what actually goes out.
 */
export function pickFields<T extends { id: string }>(
  row: T,
  fields: string | null,
): Partial<T> {
  if (!fields) return row;

  const keys = new Set(
    fields
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean),
  );
  keys.add("id");

  return Object.fromEntries(
    Object.entries(row).filter(([key]) => keys.has(key)),
  ) as Partial<T>;
}
