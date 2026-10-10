"use client";

import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { openInBarayntTab } from "@/components/ui/layout/TabBar/tabEvents";
import { getPathname, usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { usePreferences } from "@/lib/preferences/PreferencesContext";
import { COMPACT_QUERY } from "@/lib/utils/useMediaQuery";
import { rememberIssueOrigin } from "./issue-origin";

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
 * The ordinary click does what the person chose (`issueOpenMode`): by
 * default the panel over whichever view you're currently on (`?issue=` in
 * the URL, nothing more is needed), otherwise the full page — here, in a
 * new Barynt tab, or in a new browser tab. Ctrl/Cmd and middle click always
 * mean the browser's own: they want the issue alongside, without leaving
 * the list.
 */
export function useIssueOpen(workspaceId: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale() as Locale;
  const { issueOpenMode, issuePageOpenMode } = usePreferences();

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
  /** The full page, in this tab — remembering where it was opened from. */
  const openPage = (identifier: string) => {
    // Remember the view it came from — the page's back arrow returns there.
    const params = new URLSearchParams(searchParams.toString());
    params.delete(ISSUE_PARAM);
    const query = params.toString();
    rememberIssueOrigin(identifier, `${pathname}${query ? `?${query}` : ""}`);
    router.push(issuePath(workspaceId, identifier));
  };

  const openPanel = (identifier: string) => {
    // A phone or tablet has no room beside the list: the issue opens as its
    // own page, which looks the same there as the panel does on a desktop.
    if (window.matchMedia(COMPACT_QUERY).matches) {
      openPage(identifier);
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
    openPageInBrowserTab(identifier);
  };

  /** The full page in a tab of the browser itself, outside Barynt's tab bar. */
  const openPageInBrowserTab = (identifier: string) => {
    const href = getPathname({
      href: issuePath(workspaceId, identifier),
      locale,
    });
    window.open(href, "_blank", "noopener,noreferrer");
  };

  /**
   * "Open the full page" from the issue's own header or keyboard: where that
   * page goes is the person's choice (`issuePageOpenMode`) — a Barynt tab, a
   * browser tab, or this one.
   */
  const openFullPage = (identifier: string) => {
    switch (issuePageOpenMode) {
      case "page":
        openPage(identifier);
        return;
      case "browserTab":
        openPageInBrowserTab(identifier);
        return;
      default:
        openPageInNewTab(identifier);
    }
  };

  /**
   * What a plain click, Enter, or "Open" does: the person's choice. The
   * panel's own movement (following the cursor with `j`/`k` while it is
   * open) keeps calling `openPanel` — it is about that panel specifically.
   */
  const open = (identifier: string) => {
    // On a phone or tablet there's no side panel (see `openPanel`): "panel"
    // already means the page there, anything else is an explicit choice.
    switch (issueOpenMode) {
      case "page":
        openPage(identifier);
        return;
      case "tab":
        openPageInNewTab(identifier);
        return;
      case "browserTab":
        openPageInBrowserTab(identifier);
        return;
      default:
        openPanel(identifier);
    }
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
      open(identifier);
    },
  });

  return {
    linkProps,
    openIssue,
    open,
    openFullPage,
    openPanel,
    openPageInNewTab,
  };
}
