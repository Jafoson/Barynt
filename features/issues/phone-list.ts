/**
 * Where a phone goes instead of a board: the same view's list, with its
 * filters, ordering and grouping (`/<ws>/project/<slug>` → `…/list`,
 * `/<ws>/my` → `…/list`). Its own module without imports, so it stays easy to
 * test without pulling the router in.
 */
export function phoneListHref(pathname: string, query: string) {
  const base = pathname.replace(/\/+$/, "");
  return `${base}/list${query ? `?${query}` : ""}`;
}
