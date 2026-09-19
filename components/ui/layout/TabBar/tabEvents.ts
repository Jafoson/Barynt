// How something outside the tab bar (a card on the board, say) opens a page
// in a new *Barynt* tab: it can't reach the tab bar's state, so it asks by
// event. The tab bar (`useTabBar`) answers by adding a tab and navigating to
// it. Plain browser events, so there's no shared store to wire through the
// app shell.

export const OPEN_TAB_EVENT = "barynt:open-tab";

export interface OpenTabDetail {
  /** Path without a locale prefix (the form tabs store), query allowed. */
  href: string;
  /** Set by the tab bar when it took the request. */
  handled: boolean;
}

/**
 * Opens `href` in a new tab of Barynt's own tab bar. Returns `false` when no
 * tab bar is mounted to do it — the caller then falls back to whatever it
 * would have done otherwise (a browser tab).
 */
export function openInBarayntTab(href: string): boolean {
  const detail: OpenTabDetail = { href, handled: false };
  // Dispatch is synchronous: by the time it returns, a listener has either
  // marked the request handled or there isn't one.
  window.dispatchEvent(new CustomEvent(OPEN_TAB_EVENT, { detail }));
  return detail.handled;
}
