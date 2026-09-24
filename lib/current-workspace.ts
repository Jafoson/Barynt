import "server-only";
import { cache } from "react";

// Server-side counterpart to `lib/session.ts`: `getSession()` reads the
// active user id from the cookie, here we read the active workspace id.
// Since this only lives in the URL (not in a cookie), the route seeds the
// value, and nested Server Components read it without prop drilling.
//
// `cache()` returns the same object reference per request → we use that as
// request-scoped storage. No state leaks between requests.
const store = cache(() => ({ id: null as string | null }));

/** Where the copy of this module that seeds the request store publishes its reader. */
export const CURRENT_WORKSPACE_READER = Symbol.for(
  "barynt.currentWorkspaceReader",
);

/**
 * Seeds the request store with the active workspace id.
 *
 * Must be called from **every** route under `/[workspace]` — layout and
 * page alike. The layout alone isn't enough: on client navigation within
 * the same segment, Next.js only re-renders the page, the layout stays put
 * and the store would remain empty. That's exactly what made workspace
 * queries in pages fail after a click, while they worked after a reload.
 *
 * Idempotent — setting it multiple times within the same request is harmless.
 */
export function setCurrentWorkspaceId(id: string): void {
  store().id = id;
  // The plugin host's services (`lib/plugins/services.ts`) run from another
  // compilation layer than the pages, with their own copy of this module and so
  // their own `store()`, which is never seeded. The copy that *is* seeded says
  // so here, at the moment it is: this is the reader of the request's store, for
  // them to call. It holds no request data, only the way to it, so publishing it
  // again on every request is harmless.
  (globalThis as unknown as Record<symbol, () => string | null>)[
    CURRENT_WORKSPACE_READER
  ] = getCurrentWorkspaceId;
}

/** Active workspace id of the request, or `null` outside the app shell. */
export function getCurrentWorkspaceId(): string | null {
  return store().id;
}
