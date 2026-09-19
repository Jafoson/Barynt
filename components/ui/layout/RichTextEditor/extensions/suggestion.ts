import type { Editor, Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import {
  type SuggestionItem,
  SuggestionMenu,
  type SuggestionMenuHandle,
} from "../components/SuggestionMenu/SuggestionMenu";
import styles from "../components/SuggestionMenu/suggestionMenu.module.scss";
import { dockPlacement } from "./suggestionDock";

/** Same value as `bp.$phone` in `styles/breakpoints.scss`. */
const PHONE_QUERY = "(max-width: 640px)";

/** Side margin (px) of the list on a phone. */
const PHONE_MARGIN = 8;

/**
 * Phone: puts the list where the keyboard leaves room (see
 * `suggestionDock.ts`). Full width minus a margin, above or below the caret
 * line, its list capped to the room it has.
 */
function placeOnPhone(element: HTMLElement, caret: DOMRect | null) {
  if (!caret) return;
  const viewport = window.visualViewport;
  const placement = dockPlacement({
    caret,
    visible: {
      top: viewport?.offsetTop ?? 0,
      height: viewport?.height ?? window.innerHeight,
    },
    layoutHeight: window.innerHeight,
  });
  element.style.setProperty("--suggest-max-h", `${placement.maxHeight}px`);
  Object.assign(element.style, {
    position: "fixed",
    left: `${PHONE_MARGIN}px`,
    right: `${PHONE_MARGIN}px`,
    width: "auto",
    top: placement.side === "below" ? `${placement.top}px` : "auto",
    bottom: placement.side === "above" ? `${placement.bottom}px` : "auto",
    visibility: "",
  });
}

/**
 * The shared foundation of all four triggers (`@`, `#`, `:`, `/`).
 *
 * Each of them differs in only three respects: which character opens it,
 * which entries it shows, and what happens on selection. Everything else —
 * rendering the list, intercepting keys, showing and hiding — is defined
 * once here.
 *
 * Positioned via `props.mount`: that attaches the element to the cursor via
 * Floating UI and keeps it there while scrolling and text wrapping. That's
 * why this needs neither its own coordinates nor listeners.
 */

interface TriggerConfig<I extends SuggestionItem> {
  /**
   * Unique name of the trigger — becomes the ProseMirror plugin key.
   *
   * Without it, all four would run under the default key `suggestion` that
   * `@tiptap/suggestion` creates module-wide. ProseMirror doesn't allow two
   * different plugins under the same key and throws
   * `RangeError: Adding different instances of a keyed plugin` when the
   * editor is created.
   */
  name: string;
  char: string;
  /** The matches for the current input. May be asynchronous. */
  items: (query: string) => I[] | Promise<I[]>;
  /** Inserts the selected entry into the document. */
  onSelect: (props: { editor: Editor; range: Range; item: I }) => void;
  /** Shown in the list when nothing matches. */
  emptyLabel: () => string;
  /**
   * `/` only counts at the start of a line — mid-sentence, a slash is
   * usually just a slash. Mentions, by contrast, are allowed anywhere.
   */
  startOfLine?: boolean;
  /** `allowSpaces` for names made up of two words. */
  allowSpaces?: boolean;
}

export function createSuggestion<I extends SuggestionItem>({
  name,
  char,
  items,
  onSelect,
  emptyLabel,
  startOfLine = false,
  allowSpaces = false,
}: TriggerConfig<I>): Omit<SuggestionOptions<I>, "editor"> {
  return {
    pluginKey: new PluginKey(name),
    char,
    startOfLine,
    allowSpaces,
    items: ({ query }) => items(query),

    command: ({ editor, range, props }) => {
      onSelect({ editor, range, item: props });
    },

    render: () => {
      let renderer: ReactRenderer<SuggestionMenuHandle> | null = null;
      let unmount: (() => void) | null = null;
      // Phone only: re-places the list when the caret moves, the list changes
      // size, or the keyboard comes and goes.
      let reposition: (() => void) | null = null;
      let clientRect: (() => DOMRect | null) | null | undefined;
      let stopViewportWatch: (() => void) | null = null;

      const teardown = () => {
        stopViewportWatch?.();
        stopViewportWatch = null;
        reposition = null;
        unmount?.();
        unmount = null;
        renderer?.destroy();
        renderer = null;
      };

      return {
        onStart: (props) => {
          renderer = new ReactRenderer(SuggestionMenu, {
            editor: props.editor,
            // The wrapper is the element that Floating UI positions — and
            // thus the only one a z-index layer can actually affect.
            className: styles.floating,
            props: {
              items: props.items,
              loading: props.loading,
              emptyLabel: emptyLabel(),
              command: (item: SuggestionItem) => props.command(item as I),
            },
          });
          // Marks the wrapper as part of the editor: `EditableRichText`
          // must not treat a focus change into it as leaving the editor.
          renderer.updateAttributes({ "data-editor-floating": "" });
          clientRect = props.clientRect;
          const element = renderer.element as HTMLElement;
          if (window.matchMedia(PHONE_QUERY).matches) {
            reposition = () => placeOnPhone(element, clientRect?.() ?? null);
            unmount = props.mount(element, { onPosition: reposition });
            reposition();
            // The keyboard changes the visible area without a window
            // resize on every browser — watch the visual viewport itself.
            const viewport = window.visualViewport;
            const place = () => reposition?.();
            viewport?.addEventListener("resize", place);
            viewport?.addEventListener("scroll", place);
            stopViewportWatch = () => {
              viewport?.removeEventListener("resize", place);
              viewport?.removeEventListener("scroll", place);
            };
          } else {
            unmount = props.mount(element);
          }
        },

        onUpdate: (props) => {
          clientRect = props.clientRect;
          renderer?.updateProps({
            items: props.items,
            loading: props.loading,
            emptyLabel: emptyLabel(),
            command: (item: SuggestionItem) => props.command(item as I),
          });
          // The list may have grown or shrunk: look at its room again.
          reposition?.();
        },

        onKeyDown: (props) => {
          // Escape only closes the list. It must not bubble up further,
          // otherwise the editor would discard the whole edit right away.
          if (props.event.key === "Escape") {
            props.event.stopPropagation();
            teardown();
            return true;
          }
          return renderer?.ref?.onKeyDown(props.event) ?? false;
        },

        onExit: () => {
          teardown();
        },
      };
    },
  };
}
