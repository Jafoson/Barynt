"use client";

import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { openInBarayntTab } from "@/components/ui/layout/TabBar/tabEvents";
import { getPathname, usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { PHONE_QUERY } from "@/lib/utils/useMediaQuery";

/** The URL parameter the side panel depends on: `?issue=PREFIX-123`. */
export const ISSUE_PARAM = "issue";

/** Canonical path of an issue's full page, without a locale prefix. */
export const issuePath = (workspaceId: string, identifier: string) =>
  `/${workspaceId}/issue/${identifier}`;

/**
 * Clears `?issue=` from the URL — nothing more is needed, the panel depends
 * on it alone.
 *
 * Deliberately without the router: the view's server data doesn't depend
 * on this parameter, and a round trip just to close it would be
 * noticeable. Next keeps `useSearchParams` in sync with
 * `history.replaceState`, so the view still notices — panel closes, row or
 * card goes back to unmarked.
 *
 * Lives here rather than in the component because there are two ways to
 * close it: the cross on the panel and a second click on the same row.
 * Both should do exactly the same thing, not just approximately.
 */
export function closeIssuePanel() {
  const params = new URLSearchParams(window.location.search);
  params.delete(ISSUE_PARAM);
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}`,
  );
}

/**
 * Whether the browser should handle this click itself: Ctrl/Cmd (new tab),
 * Shift (new window), Alt (save target), or any button other than the left
 * one. The same check `next/link` runs before its own router — whatever
 * the browser does better, it should keep doing.
 */
export function isBrowserClick(event: React.MouseEvent): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

/**
 * The two ways to open an issue — from list, board, inbox, and "my issues"
 * alike.
 *
 * The ordinary click puts the panel over whichever view you're currently
 * on (`?issue=` in the URL, nothing more is needed). Ctrl/Cmd and middle
 * click mean something different: they want the issue alongside, without
 * leaving the list — that's what the full page is for, and the new tab is
 * the answer the browser has always given to that.
 */
export function useIssueOpen(workspaceId: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale() as Locale;

  /** The issue currently shown in the panel — `null` while none is open. */
  const openIssue = searchParams.get(ISSUE_PARAM);

  /**
   * Panel over the current view — the list's filters stay in place.
   *
   * Clicking the same row a second time closes it again. The panel is
   * already showing what the click is asking for; letting the click land
   * nowhere would be the only alternative — forcing a trip to the cross at
   * the other end of the window instead.
   */
  const openPanel = (identifier: string) => {
    // A phone has no room beside the list: the issue opens as its own page,
    // which looks the same there as the panel does on a desktop.
    if (window.matchMedia(PHONE_QUERY).matches) {
      router.push(issuePath(workspaceId, identifier));
      return;
    }
    if (identifier === openIssue) {
      closeIssuePanel();
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set(ISSUE_PARAM, identifier);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  /**
   * The issue's full page in a new tab — one of Barynt's own (the tab bar),
   * so it stays inside the app. Where there's no tab bar to open it (a page
   * outside the shell) it falls back to a browser tab; the path is localized
   * there because `window.open` doesn't know next-intl's routing rules.
   */
  const openPageInNewTab = (identifier: string) => {
    const path = issuePath(workspaceId, identifier);
    if (openInBarayntTab(path)) return;
    const href = getPathname({ href: path, locale });
    window.open(href, "_blank", "noopener,noreferrer");
  };

  /**
   * Props for a row that's a link anyway.
   *
   * The `href` points to the full page, not to `?issue=` — this way,
   * Ctrl-click, middle click, and "open link in new tab" from the context
   * menu all open the same thing, without us having to check any keys.
   * Only the plain left click is intercepted; that one gets the panel.
   */
  const linkProps = (identifier: string) => ({
    href: issuePath(workspaceId, identifier),
    // Without prefetch: the page is dynamic, and a list with a hundred
    // rows would request it a hundred times for a click that mostly ends
    // up in the panel anyway.
    prefetch: false,
    onClick: (event: React.MouseEvent) => {
      if (isBrowserClick(event)) return;
      event.preventDefault();
      openPanel(identifier);
    },
  });

  return { linkProps, openIssue, openPanel, openPageInNewTab };
}
