/**
 * Cursor pagination for the public API (`app/api/v1`) — an opaque wrapper
 * around Prisma's native `cursor`/`skip: 1`/`take`, not offset (`skip: n`).
 * Issue/project lists mutate under concurrent writes — `skip` silently
 * skips or duplicates rows as the underlying set shifts between page
 * fetches; a cursor anchored to the last-seen row's `id` doesn't have that
 * problem.
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): string | null {
  try {
    const id = Buffer.from(cursor, "base64url").toString("utf8");
    return id || null;
  } catch {
    return null;
  }
}

export function parseLimit(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(raw), MAX_LIMIT);
}

export function parseCursor(searchParams: URLSearchParams): string | undefined {
  const raw = searchParams.get("cursor");
  return raw ? (decodeCursor(raw) ?? undefined) : undefined;
}
