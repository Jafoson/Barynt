import styles from "./modal.module.scss";

/**
 * `dialog` floats centered over the page, `panel` sits as a side panel
 * against the edge: full height, no radius, wider. Belongs to
 * `openModal(…, { placement: "right" })`.
 */
type ModalVariant = "dialog" | "panel";

interface ModalProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Panel width. A number = px, otherwise any CSS value. Default: 620px. */
  width?: number | string;
  /** Default: "dialog". */
  variant?: ModalVariant;
}

/**
 * Panel wrapper for modal content: surface, border, radius, shadow, and
 * column layout. Expects the modal regions as children in this order:
 * `ModalHeader` → `ModalBody` → `ModalToolbar` → `ModalFooter`. Only the body
 * grows and scrolls, the other regions stay fixed in view.
 *
 * Overlay, backdrop, Escape handling, and focus restoration come from the
 * `ModalFrame` in `lib/context/ModalContext` — deliberately not duplicated
 * here, so every modal opened via `openModal()` gets the same behavior.
 */
export function Modal({
  width,
  variant = "dialog",
  className,
  style,
  children,
  ...rest
}: ModalProps) {
  return (
    <div
      className={[styles.modal, variant === "panel" && styles.panel, className]
        .filter(Boolean)
        .join(" ")}
      style={
        width === undefined
          ? style
          : ({
              ...style,
              "--modal-w": typeof width === "number" ? `${width}px` : width,
            } as React.CSSProperties)
      }
      {...rest}
    >
      {children}
    </div>
  );
}

type ModalBodyProps = React.HTMLAttributes<HTMLDivElement> & {
  /** For content with nothing else focusable — a keyboard user needs a
   *  landing spot to scroll from (see `ShortcutsHelpModal`). */
  ref?: React.Ref<HTMLDivElement>;
};

/** Scrolling content area of the modal. */
export function ModalBody({
  className,
  children,
  ref,
  ...rest
}: ModalBodyProps) {
  return (
    <div
      ref={ref}
      className={[styles.body, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

interface ModalToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Divider above. Default: true. */
  divider?: boolean;
  /** For a caller that needs to find its own children — e.g. the
   *  create-issue window scoping its field-roving to this toolbar's
   *  buttons. */
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * Wrapping bar for attribute pickers (status, priority, assignee …) between
 * body and footer.
 */
export function ModalToolbar({
  divider = true,
  className,
  children,
  ref,
  ...rest
}: ModalToolbarProps) {
  return (
    <div
      ref={ref}
      className={[styles.toolbar, divider && styles.dividerAbove, className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
