"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { getProjectsForWorkspaces } from "@/features/workspaces/actions";
import { usePathname, useRouter } from "@/i18n/navigation";
import { randomId } from "@/lib/utils/id";
import type { Project } from "@/types";
import { OPEN_TAB_EVENT, type OpenTabDetail } from "./tabEvents";
import { type TabMeta, tabMeta, workspaceIdFromPath } from "./tabMeta";

type StoredTab = { id: string; href: string };
export type Tab = StoredTab & { meta: TabMeta };

// A single, global tab set across all areas (workspaces + admin). Each tab
// stores the full URL, the context is derived from it.
const TABS_KEY = "orbit-tabs";
const ACTIVE_KEY = "orbit-active";

function load(fallback: string): { tabs: StoredTab[]; activeId: string } {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    const rawActive = localStorage.getItem(ACTIVE_KEY);
    if (raw) {
      const tabs = JSON.parse(raw) as StoredTab[];
      if (Array.isArray(tabs) && tabs.length > 0) {
        const activeId =
          rawActive && tabs.some((t) => t.id === rawActive)
            ? rawActive
            : tabs[0].id;
        return { tabs, activeId };
      }
    }
  } catch {}
  const id = randomId();
  return { tabs: [{ id, href: fallback }], activeId: id };
}

function save(tabs: StoredTab[]) {
  localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
}

interface UseTabBarOptions {
  // Href of the first tab / newly opened tabs.
  defaultHref: string;
  // Server-preloaded projects of the active workspace — starting value for
  // the project cache below, so its tab is titled correctly right away.
  projects: Project[];
  // ID of the active workspace, or `null` in the admin area.
  currentWorkspaceId: string | null;
}

// Holds the entire tab state: persistence (localStorage), navigation, and
// resolving title/color/icon per tab. Every tab carries its own workspace ID
// in the URL — projects of other workspaces aren't preloaded server-side and
// get loaded here specifically as soon as a matching tab shows up.
// TabBarClient receives already-finished, renderable tabs and stays pure
// rendering.
export function useTabBar({
  defaultHref,
  projects,
  currentWorkspaceId,
}: UseTabBarOptions) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Full URL of the current view including the query string (filters, sort…).
  // usePathname() alone drops the query, which would lose per-tab filter state.
  const qs = searchParams.toString();
  const currentHref = qs ? `${pathname}?${qs}` : pathname;

  const [rawTabs, setRawTabs] = useState<StoredTab[]>([]);
  const [activeId, setActiveId] = useState("");
  const [ready, setReady] = useState(false);

  // Set right before switchTab/openTab/closeTab trigger their own navigation —
  // their target tab's href is already correct, so the tracking effect below
  // should skip that one run instead of overwriting it with the stale href.
  const justSwitchedRef = useRef(false);

  const [projectsByWorkspace, setProjectsByWorkspace] = useState<
    Record<string, Project[]>
  >(() => (currentWorkspaceId ? { [currentWorkspaceId]: projects } : {}));

  // Which workspace IDs are already loaded (or requested) — prevents
  // repeated server calls for the same workspace on every tab switch.
  const requestedRef = useRef(
    new Set<string>(currentWorkspaceId ? [currentWorkspaceId] : []),
  );

  useEffect(() => {
    const s = load(defaultHref);
    setRawTabs(s.tabs);
    setActiveId(s.activeId);
    setReady(true);
  }, [defaultHref]);

  // Keep the active tab in sync with reality whenever the URL changes for a
  // reason the tab bar didn't initiate itself — an in-tab navigation (sidebar
  // link, filters), the browser back/forward buttons, a typed/bookmarked URL,
  // or a remount after crossing between the admin and workspace shells (they're
  // separate layouts, so e.g. /my → /admin loses in-memory state and reloads
  // from localStorage, which may still point at the old URL). If an existing
  // tab already matches the new URL, that one becomes active; otherwise the
  // currently active tab is updated to it, same as an in-tab navigation would.
  useEffect(() => {
    if (!ready || !activeId) return;

    if (justSwitchedRef.current) {
      justSwitchedRef.current = false;
      return;
    }

    if (rawTabs.some((tab) => tab.id === activeId && tab.href === currentHref))
      return;

    const matching = rawTabs.find((tab) => tab.href === currentHref);
    if (matching) {
      setActiveId(matching.id);
      return;
    }

    const next = rawTabs.map((tab) =>
      tab.id === activeId ? { ...tab, href: currentHref } : tab,
    );
    save(next);
    setRawTabs(next);
  }, [currentHref, activeId, ready, rawTabs]);

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  // Load projects for workspaces no open tab already knows about (e.g. a
  // tab that was opened in a different workspace).
  useEffect(() => {
    const missing = [
      ...new Set(
        rawTabs
          .map((tab) => workspaceIdFromPath(tab.href))
          .filter(
            (id): id is string => id !== null && !requestedRef.current.has(id),
          ),
      ),
    ];
    if (missing.length === 0) return;

    for (const id of missing) requestedRef.current.add(id);

    getProjectsForWorkspaces(missing).then((byWorkspace) => {
      setProjectsByWorkspace((prev) => ({ ...prev, ...byWorkspace }));
    });
  }, [rawTabs]);

  function switchTab(id: string) {
    const tab = rawTabs.find((t) => t.id === id);
    if (!tab || id === activeId) return;
    justSwitchedRef.current = true;
    setActiveId(id);
    router.push(tab.href);
  }

  // `href`: a page to open in it (a card's issue, say); without one, the
  // area's default view. A page that already has a tab is switched to rather
  // than duplicated.
  function openTab(href: string = defaultHref) {
    if (href !== defaultHref) {
      const existing = rawTabs.find((t) => t.href === href);
      if (existing) {
        switchTab(existing.id);
        return;
      }
    }
    const id = randomId();
    const tab = { id, href };
    const next = [...rawTabs, tab];
    save(next);
    setRawTabs(next);
    justSwitchedRef.current = true;
    setActiveId(id);
    router.push(href);
  }

  // Other parts of the app ask for a new tab by event (see `tabEvents.ts`).
  // Re-attached on every render so it always sees the current tabs.
  useEffect(() => {
    if (!ready) return;
    const onOpenTab = (event: Event) => {
      const detail = (event as CustomEvent<OpenTabDetail>).detail;
      detail.handled = true;
      openTab(detail.href);
    };
    window.addEventListener(OPEN_TAB_EVENT, onOpenTab);
    return () => window.removeEventListener(OPEN_TAB_EVENT, onOpenTab);
  });

  function closeTab(id: string) {
    if (rawTabs.length <= 1) return;
    const idx = rawTabs.findIndex((t) => t.id === id);
    const next = rawTabs.filter((t) => t.id !== id);
    save(next);
    setRawTabs(next);
    if (id === activeId) {
      const target = next[Math.max(0, idx - 1)];
      justSwitchedRef.current = true;
      setActiveId(target.id);
      router.push(target.href);
    }
  }

  const tabs: Tab[] = rawTabs.map((tab) => {
    const workspaceId = workspaceIdFromPath(tab.href);
    const tabProjects = workspaceId
      ? (projectsByWorkspace[workspaceId] ?? [])
      : [];
    return { ...tab, meta: tabMeta(tab.href, tabProjects, t) };
  });

  return { tabs, activeId, ready, switchTab, openTab, closeTab };
}
