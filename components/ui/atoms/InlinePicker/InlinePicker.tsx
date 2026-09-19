"use client";

import { cloneElement, useRef, useState } from "react";
import { Popover } from "@/components/ui/atoms/Popover/Popover";
import styles from "./inlinePicker.module.scss";

interface InlinePickerProps {
  trigger: React.ReactElement;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  width?: number;
  maxWidth?: number;
  align?: "start" | "center" | "end";
  /** The field's name — see `Popover`'s `title`. */
  title?: string;
  /**
   * Keeps the picker's clicks to itself — both the trigger's and the
   * selection's. Necessary as soon as it sits inside something clickable
   * (board card, list row): the menu lives in a portal, but its events
   * still bubble up through the React tree to that element's `onClick`.
   */
  stop?: boolean;
  /**
   * Controls the open state from outside — e.g. a keyboard shortcut that
   * should open the same menu a click would. Omit both this and
   * `onOpenChange` for the normal, self-managed click-to-toggle behavior;
   * passing one without the other leaves the picker unable to close (or
   * unable to tell its caller it did).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function InlinePicker({
  trigger,
  children,
  width,
  maxWidth,
  align,
  title,
  stop,
  open: openProp,
  onOpenChange,
}: InlinePickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const ref = useRef<HTMLElement>(null);

  const setOpen = (next: boolean | ((current: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(open) : next;
    if (!isControlled) setInternalOpen(value);
    onOpenChange?.(value);
  };
  const close = () => setOpen(false);

  const triggerWithRef = cloneElement(
    trigger as React.ReactElement<{
      ref?: React.Ref<HTMLElement>;
      onClick?: (e?: React.MouseEvent) => void;
    }>,
    {
      ref,
      // Optional event: triggers activated via keyboard (e.g. Chip) call the
      // handler without one.
      onClick: (e?: React.MouseEvent) => {
        if (stop) e?.stopPropagation();
        setOpen((o) => !o);
      },
    },
  );

  const content = typeof children === "function" ? children(close) : children;

  return (
    <>
      {triggerWithRef}
      <Popover
        anchorRef={ref}
        open={open}
        onClose={close}
        width={width}
        maxWidth={maxWidth}
        align={align}
        title={title}
      >
        {stop ? (
          // Just a seal, not a control: `display: contents` lets the menu
          // itself remain the popover's child. No keyboard variant is
          // needed — the seal doesn't control anything, it only intercepts.
          // biome-ignore lint/a11y/useKeyWithClickEvents: not a control, just a seal for foreign clicks
          // biome-ignore lint/a11y/noStaticElementInteractions: intercepts clicks that would otherwise reach the caller
          <div className={styles.seal} onClick={(e) => e.stopPropagation()}>
            {content}
          </div>
        ) : (
          content
        )}
      </Popover>
    </>
  );
}
