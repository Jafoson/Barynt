"use client";

import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Resizer } from "@/components/ui/layout/Resizer/Resizer";
import { usePathname } from "@/i18n/navigation";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import styles from "./appShell.module.scss";
import {
  NAV_COLLAPSE_BELOW_REM,
  NAV_COLLAPSED_COOKIE,
  NAV_RAIL_REM,
  NAV_WIDTH_COOKIE,
  NAV_WIDTH_DEFAULT_REM,
  NAV_WIDTH_MAX_REM,
  NAV_WIDTH_MIN_REM,
} from "./navState";

/** Same value as `bp.$tablet` in `styles/breakpoints.scss`. */
const DRAWER_QUERY = "(max-width: 1024px)";

/** One year; readable by the server on the next request (`AppShell`). */
function writeNavCookie(name: string, value: string) {
  try {
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is missing in older Safari
    document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // Cookies blocked: the state still holds for this page view.
  }
}

const isDrawerMode = () => window.matchMedia(DRAWER_QUERY).matches;

/** Horizontal distance (px) after which a leftward swipe closes the drawer. */
const SWIPE_CLOSE_DISTANCE = 60;

interface NavValue {
  /** Menu (≤ 1024px). */
  open: boolean;
  openDrawer: () => void;
  /** Closes the menu at tablet width and below, collapses the sidebar to the rail on desktop. */
  closeNav: () => void;
  /** Desktop only: sidebar hidden entirely. */
  collapsed: boolean;
  toggleNav: () => void;
}

const Ctx = createContext<NavValue | null>(null);

export function useNav() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNav must be used within ShellFrame");
  return ctx;
}

interface ShellFrameProps {
  sidebar: React.ReactNode;
  /** Everything right of the sidebar (top bar, tabs, page). */
  main: React.ReactNode;
  /** Outlets and global triggers — rendered as siblings, not part of the layout. */
  children?: React.ReactNode;
  initialCollapsed: boolean;
  /** Width of the expanded sidebar in rem (desktop), from the cookie. */
  initialWidthRem: number;
}

/**
 * The shell's client half: owns whether the navigation is showing.
 *
 * Two modes, told apart by CSS (`appShell.module.scss`) — not by this
 * component — so the first paint is right without waiting for JS:
 * - ≤ 1024px (tablet, phone): the sidebar is a menu, closed by default
 *   (`open`).
 * - larger: the sidebar sits in the flow. Its right edge can be dragged to
 *   set the width (`widthRem`); dragging it narrower than a threshold
 *   collapses it to the icon rail (`collapsed`), wider expands it again.
 *   Both are remembered in cookies so the server renders them right away.
 */
export function ShellFrame({
  sidebar,
  main,
  children,
  initialCollapsed,
  initialWidthRem,
}: ShellFrameProps) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [widthRem, setWidthRem] = useState(initialWidthRem);
  // The `Resizer` works in px; the layout in rem. 16 until measured.
  const [rootPx, setRootPx] = useState(16);
  const paneRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const measure = () =>
      setRootPx(
        Number.parseFloat(
          getComputedStyle(document.documentElement).fontSize,
        ) || 16,
      );
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // What the user set is remembered in cookies, so the next page load comes
  // out of the server the way they left it. Not written for the value the
  // page came with. The width waits for the dragging to settle.
  const skipFirstWrite = useRef({ width: true, collapsed: true });
  useEffect(() => {
    if (skipFirstWrite.current.collapsed) {
      skipFirstWrite.current.collapsed = false;
      return;
    }
    writeNavCookie(NAV_COLLAPSED_COOKIE, collapsed ? "1" : "0");
  }, [collapsed]);
  useEffect(() => {
    if (skipFirstWrite.current.width) {
      skipFirstWrite.current.width = false;
      return;
    }
    const timer = setTimeout(
      () => writeNavCookie(NAV_WIDTH_COOKIE, widthRem.toFixed(2)),
      250,
    );
    return () => clearTimeout(timer);
  }, [widthRem]);

  const closeDrawer = useCallback(() => setOpen(false), []);
  const openDrawer = useCallback(() => setOpen(true), []);

  const closeNav = useCallback(() => {
    if (isDrawerMode()) setOpen(false);
    else setCollapsed(true);
  }, []);

  const toggleNav = useCallback(() => {
    if (isDrawerMode()) setOpen((o) => !o);
    else setCollapsed(!collapsed);
  }, [collapsed]);

  // A navigation ends the drawer's job.
  const pathname = usePathname();
  // biome-ignore lint/correctness/useExhaustiveDependencies: closes on every route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Growing past the breakpoint (rotating a tablet) must not leave the
  // drawer flagged as open behind the now-static sidebar.
  useEffect(() => {
    const mq = window.matchMedia(DRAWER_QUERY);
    const onChange = () => {
      if (!mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Focus moves into the drawer when it opens and back to whatever opened
  // it when it closes.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      paneRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      // There's a toggle in the phone's top bar and one in the tablet's tab
      // bar; only one of them is displayed (`offsetParent` is null for the
      // other), and that's the one to hand focus back to.
      for (const toggle of document.querySelectorAll<HTMLElement>(
        "[data-nav-toggle]",
      )) {
        if (toggle.offsetParent !== null) {
          toggle.focus();
          break;
        }
      }
    }
  }, [open]);

  useShortcut("esc", closeDrawer, { enabled: open });
  useShortcut("mod+b", toggleNav);

  return (
    <Ctx.Provider value={{ open, openDrawer, closeNav, collapsed, toggleNav }}>
      <div
        className={styles.shell}
        style={{ "--sidebar-w": `${widthRem}rem` } as React.CSSProperties}
        data-nav-open={open || undefined}
        data-nav-collapsed={collapsed || undefined}
        onTouchStart={(e) => {
          const t = e.touches[0];
          touchStart.current = open ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (dx < -SWIPE_CLOSE_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
            setOpen(false);
          }
        }}
      >
        {/* A tap on a link inside also closes: navigating to the page
            you're already on doesn't change the pathname. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: delegated close, links inside are the real controls */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation of a link fires this click too */}
        <div
          ref={paneRef}
          id="app-sidebar"
          className={styles.navPane}
          tabIndex={-1}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a[href]")) setOpen(false);
          }}
        >
          {sidebar}
          {/* Desktop only (CSS): drag the edge to set the width; dragging it
              past the threshold collapses to the icon rail and back. */}
          <Resizer
            className={styles.resizeHandle}
            edge="right"
            label={t("resizeSidebar")}
            width={(collapsed ? NAV_RAIL_REM : widthRem) * rootPx}
            min={NAV_WIDTH_MIN_REM * rootPx}
            max={NAV_WIDTH_MAX_REM * rootPx}
            reset={NAV_WIDTH_DEFAULT_REM * rootPx}
            step={rootPx}
            onChange={(px) => setWidthRem(px / rootPx)}
            collapse={{
              below: NAV_COLLAPSE_BELOW_REM * rootPx,
              collapsed,
              onCollapsedChange: setCollapsed,
            }}
          />
        </div>
        <button
          type="button"
          className={styles.backdrop}
          aria-hidden="true"
          tabIndex={-1}
          onClick={closeDrawer}
        />
        {/* `inert` while the drawer is open: the page behind it neither
            takes focus nor clicks, which is all a focus trap has to do. */}
        <div className={styles.main} inert={open}>
          {main}
        </div>
        {children}
      </div>
    </Ctx.Provider>
  );
}
