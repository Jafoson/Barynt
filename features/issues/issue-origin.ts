// Where an issue was opened from — so the issue page's back arrow returns to
// the list (or board, with its filters) that led there instead of always to
// the project's board. Kept for the browser session only; bound to the issue
// so a later visit that came from elsewhere (a link, the inbox) doesn't
// follow a stale origin.

const KEY = "issue-origin";

type Store = Pick<Storage, "getItem" | "setItem">;

interface Origin {
  identifier: string;
  /** Locale-less path with its query, ready for the router. */
  href: string;
}

function defaultStore(): Store | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    // Storage blocked or not there (server, private window).
    return null;
  }
}

/** Remembers that `identifier` was opened from `href`. */
export function rememberIssueOrigin(
  identifier: string,
  href: string,
  store: Store | null = defaultStore(),
) {
  try {
    store?.setItem(KEY, JSON.stringify({ identifier, href } satisfies Origin));
  } catch {
    // Not remembered — the back arrow then falls back to the project.
  }
}

/** Where `identifier` was opened from, or `null` if that isn't known. */
export function issueOrigin(
  identifier: string,
  store: Store | null = defaultStore(),
): string | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const origin = JSON.parse(raw) as Partial<Origin>;
    return origin.identifier === identifier && typeof origin.href === "string"
      ? origin.href
      : null;
  } catch {
    return null;
  }
}

/**
 * Stepping from one issue to the next (prev/next on the page) keeps the same
 * origin: the list you started from is still where "back" should lead.
 */
export function carryIssueOrigin(
  from: string,
  to: string,
  store: Store | null = defaultStore(),
) {
  const href = issueOrigin(from, store);
  if (href) rememberIssueOrigin(to, href, store);
}
