"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styles from "./modalContext.module.scss";

export interface ModalRenderProps {
  close: () => void;
  /**
   * Changes this modal's options while it's open — placement and width.
   *
   * Meant for content that can switch between two presentations without
   * being reopened. The issue view no longer does that through this path:
   * it lives in the dock (`DockContext`) and lifts itself there instead.
   */
  setOptions: (patch: Partial<ModalOptions>) => void;
}

/**
 * Where the modal sits: `center` as a dialog over the page, `right` as a
 * side panel that sticks to the right edge and runs the full height, `bottom`
 * as a sheet that slides up from the bottom edge (for a phone).
 */
export type ModalPlacement = "center" | "right" | "bottom";

export interface ModalOptions {
  /** Panel width, e.g. 600 or "80vw". Default: content's base width. */
  width?: number | string;
  /** Allow closing via backdrop click / Escape. Default: true. */
  dismissible?: boolean;
  /** Default: "center". */
  placement?: ModalPlacement;
  /**
   * Removes the top offset — the modal then sits exactly centered.
   *
   * Only relevant with `placement: "center"`. Small dialogs look too low
   * when centered and therefore sit a bit higher by default; large ones
   * make better use of the height once the offset is removed.
   */
  centered?: boolean;
  /**
   * Accessible name of the dialog. Without it the screen reader only
   * announces "dialog" — please pass it localized.
   */
  label?: string;
  /**
   * Runs as soon as the modal is closed — whether via Escape, backdrop, or
   * `close()`. Meant for openers that keep their own state alongside the
   * modal (e.g. a URL parameter) that needs to disappear along with it.
   * `closeModal(id, { silent: true })` skips this call.
   */
  onClose?: () => void;
}

/** Clean up without notifying the opener — see `ModalOptions.onClose`. */
interface CloseOptions {
  silent?: boolean;
}

type ModalContent =
  | React.ReactNode
  | ((props: ModalRenderProps) => React.ReactNode);

interface ModalEntry {
  id: string;
  content: ModalContent;
  options: ModalOptions;
  trigger: Element | null;
}

interface ModalValue {
  /** Renders `content` as a modal. `content` can be a render function that receives `close`. */
  openModal: (content: ModalContent, options?: ModalOptions) => string;
  /** Closes the modal with `id`, or the topmost one without an `id`. */
  closeModal: (id?: string, options?: CloseOptions) => void;
  closeAllModals: () => void;
  /** Carries forward the options of an open modal — see `ModalRenderProps.setOptions`. */
  setModalOptions: (id: string, patch: Partial<ModalOptions>) => void;
}

const Ctx = createContext<ModalValue | null>(null);
const StackCtx = createContext<ModalEntry[] | null>(null);

export function useModal() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useModal must be used within ModalProvider");
  return ctx;
}

/**
 * Whether a modal is currently open.
 *
 * For anything that also listens for Escape and needs to step back: a
 * modal always sits on top, so the key belongs to it. The dock panel uses
 * this — otherwise Escape would close the panel underneath the dialog
 * instead of the dialog.
 */
export function useHasOpenModal() {
  return (useContext(StackCtx)?.length ?? 0) > 0;
}

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<ModalEntry[]>([]);
  // Mirror of the stack: `onClose` handlers are allowed to close further,
  // synchronously, and for that the current state must already be settled
  // before the next render.
  const stackRef = useRef<ModalEntry[]>(stack);
  const counter = useRef(0);

  const commit = useCallback((next: ModalEntry[]) => {
    stackRef.current = next;
    setStack(next);
  }, []);

  const closeModal = useCallback(
    (id?: string, options?: CloseOptions) => {
      const current = stackRef.current;
      const entry = id ? current.find((m) => m.id === id) : current.at(-1);
      if (!entry) return;
      // Update the stack first, then notify: an `onClose` that itself
      // closes something (URL sync) would no longer find the entry
      // otherwise.
      commit(current.filter((m) => m.id !== entry.id));
      if (!options?.silent) entry.options.onClose?.();
    },
    [commit],
  );

  const closeAllModals = useCallback(() => {
    const current = stackRef.current;
    commit([]);
    for (const entry of current) entry.options.onClose?.();
  }, [commit]);

  const setModalOptions = useCallback(
    (id: string, patch: Partial<ModalOptions>) => {
      commit(
        stackRef.current.map((entry) =>
          entry.id === id
            ? { ...entry, options: { ...entry.options, ...patch } }
            : entry,
        ),
      );
    },
    [commit],
  );

  const openModal = useCallback(
    (content: ModalContent, options: ModalOptions = {}) => {
      const id = `modal-${++counter.current}`;
      commit([
        ...stackRef.current,
        { id, content, options, trigger: document.activeElement },
      ]);
      return id;
    },
    [commit],
  );

  // Escape only closes the topmost (not explicitly non-dismissible) modal in the stack.
  useEffect(() => {
    if (stack.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const top = stack[stack.length - 1];
      if (top.options.dismissible === false) return;
      e.stopPropagation();
      closeModal(top.id);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [stack, closeModal]);

  return (
    <Ctx.Provider
      value={{ openModal, closeModal, closeAllModals, setModalOptions }}
    >
      <StackCtx.Provider value={stack}>{children}</StackCtx.Provider>
    </Ctx.Provider>
  );
}

/**
 * Renders the modal stack. Must be placed exactly once below the
 * `ModalProvider` — and specifically at the spot in the React tree whose
 * contexts the modal content should see (e.g. below the
 * `NextIntlClientProvider`).
 *
 * Reason: `createPortal` only moves the DOM node to `document.body`;
 * context resolution keeps following the React tree. If the provider
 * rendered the stack itself, the content would hang off its position —
 * above all the providers that only get set up in deeper layouts.
 */
export function ModalOutlet() {
  const stack = useContext(StackCtx);
  const { closeModal, setModalOptions } = useModal();

  // Also the SSR guard for createPortal: on the server the stack is always empty.
  if (!stack || stack.length === 0) return null;

  return createPortal(
    stack.map((modal, index) => (
      <ModalFrame
        key={modal.id}
        modal={modal}
        index={index}
        onClose={() => closeModal(modal.id)}
        onSetOptions={(patch) => setModalOptions(modal.id, patch)}
      />
    )),
    document.body,
  );
}

function ModalFrame({
  modal,
  index,
  onClose,
  onSetOptions,
}: {
  modal: ModalEntry;
  index: number;
  onClose: () => void;
  onSetOptions: (patch: Partial<ModalOptions>) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissible = modal.options.dismissible !== false;
  const placement = modal.options.placement ?? "center";
  const centered = modal.options.centered === true;
  const cx = (...names: (string | false)[]) => names.filter(Boolean).join(" ");

  useEffect(() => {
    // Only step in if the content hasn't already focused something itself
    // (e.g. via `autoFocus` on the title field) — otherwise the panel focus
    // would immediately steal it back from the input.
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();

    const trigger = modal.trigger;
    return () => {
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [modal.trigger]);

  return (
    <div
      className={cx(
        styles.overlay,
        placement === "right" && styles.right,
        placement === "bottom" && styles.bottom,
        centered && styles.centered,
      )}
      style={{ zIndex: `calc(var(--z-overlay) + ${index})` }}
    >
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Close"
        onClick={() => dismissible && onClose()}
      />
      <div
        ref={panelRef}
        className={cx(
          styles.comp,
          placement === "right" && styles.right,
          placement === "bottom" && styles.bottom,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={modal.options.label}
        tabIndex={-1}
        style={modal.options.width ? { width: modal.options.width } : undefined}
      >
        {typeof modal.content === "function"
          ? modal.content({ close: onClose, setOptions: onSetOptions })
          : modal.content}
      </div>
    </div>
  );
}
