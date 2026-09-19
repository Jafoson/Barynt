"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import styles from "./Popover.module.scss";

interface PopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  width?: number;
  maxWidth?: number;
  offset?: number;
  /**
   * What the menu is about (the field's name) — the title of its page when it
   * takes over a bottom sheet. Falls back to the trigger's `aria-label`.
   */
  title?: string;
}

/**
 * A menu next to its trigger, floating (measured position, kept inside the
 * viewport). On a phone it isn't: it comes up as a bottom sheet — full
 * width, a grab handle, swipe down / tap outside / Escape to close — since a
 * small floating box under a thumb is neither easy to hit nor to keep on
 * screen. The exception is a menu opened from inside a bottom sheet (the
 * create-issue dialog): there it doesn't stack a second sheet but takes over
 * the sheet itself as a page with a back button — the same drill-down as the
 * filter sheet. `align`, `side`, `width` and `offset` only apply to the
 * floating version; the content is the same everywhere.
 */
export function Popover({
  anchorRef,
  open,
  onClose,
  children,
  align = "start",
  side = "bottom",
  width,
  maxWidth,
  offset = 6,
  title,
}: PopoverProps) {
  const t = useTranslations("filters");
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const swipe = useSwipeToClose(onClose, bodyRef);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      if (!a) return;
      const el = ref.current;
      const w = width ?? el?.offsetWidth ?? 220;
      const h = el?.offsetHeight ?? 200;
      let left =
        align === "end"
          ? a.right - w
          : align === "center"
            ? a.left + a.width / 2 - w / 2
            : a.left;
      let top = side === "top" ? a.top - h - offset : a.bottom + offset;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      if (top + h > window.innerHeight - 8)
        top = Math.max(8, a.top - h - offset);
      top = Math.max(8, top);
      setPos({ left, top });
    };
    place();
    const t = setTimeout(place, 0);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align, side, width, offset, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        ref.current?.contains(e.target as Node) ||
        anchorRef.current?.contains(e.target as Node)
      )
        return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown, true);
    // window, not document: capture fires window → document, so this must run
    // before ModalContext's document-level Escape handler — otherwise Escape
    // closes the whole modal instead of just this popover.
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  // Opened from inside a bottom sheet: take over that sheet as a page rather
  // than stack a second one on top. Modals mark a sheet with `data-sheet`
  // (`Modal`); it positions its children, so the page can fill it.
  const sheet = isPhone
    ? (anchorRef.current?.closest<HTMLElement>("[data-sheet]") ?? null)
    : null;

  if (sheet) {
    const pageTitle = title ?? anchorRef.current?.getAttribute("aria-label");
    return createPortal(
      <div
        ref={ref}
        className={styles.sheetPage}
        data-sheet-page
        data-popover-content
      >
        <div className={styles.pageBar}>
          <button
            type="button"
            className={styles.pageBack}
            aria-label={t("back")}
            onClick={onClose}
          >
            <Icon icon="lucide:chevron-left" width={22} />
          </button>
          {pageTitle && <span className={styles.pageTitle}>{pageTitle}</span>}
        </div>
        <div className={styles.pageBody}>{children}</div>
      </div>,
      sheet,
    );
  }

  if (isPhone) {
    return createPortal(
      <div className={styles.sheetOverlay}>
        <div
          ref={ref}
          className={styles.sheet}
          // Same marker as the floating menu below.
          data-popover-content
          style={swipe.style}
          {...swipe.handlers}
        >
          <div ref={bodyRef} className={styles.sheetBody}>
            {children}
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={ref}
      className={styles.menu}
      // Marks this portaled content as "belongs to an open dropdown" for
      // anything elsewhere that reacts to arrow keys globally (e.g. the
      // issue panel's field-roving, `IssueDetailView.tsx`) — it's mounted
      // straight onto `document.body`, a sibling of the trigger's own
      // tree, not a descendant, so nothing there can tell "this focus is
      // still mine" just from DOM position.
      data-popover-content
      style={{
        position: "fixed",
        // Off-screen until placed — not `visibility: hidden`. That would
        // hide the one-frame flash at the wrong spot too, but it also
        // makes everything inside unfocusable in every major browser: a
        // `.focus()` call on a hidden descendant silently no-ops instead
        // of erroring, so whichever content here tries to focus itself on
        // mount (`SelectMenu`'s first item/search field) would sometimes
        // lose that race against the `useLayoutEffect` below — and only
        // sometimes, since it depends on exactly how long that takes.
        // -9999px alone already keeps the unplaced frame off-screen.
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: width ?? undefined,
        maxWidth: maxWidth ?? undefined,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
