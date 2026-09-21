"use client";

import type { ReferenceElement } from "@floating-ui/dom";
import { Icon } from "@iconify/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { mergeAttributes } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Calendar } from "@/components/ui/atoms/Calendar/Calendar";
import { modKey } from "@/lib/a11y";
import {
  ATTACHMENT_DRAG_MIME,
  type AttachmentDragPayload,
} from "@/lib/richtext/attachments";
import { formatChipDate, isoDate, parseDateInput } from "@/lib/richtext/date";
import { toDoc, toPlainDoc } from "@/lib/richtext/doc";
import { lowlight } from "@/lib/richtext/highlight";
import { guessImageMimeType } from "@/lib/richtext/imageMime";
import type { PMDoc } from "@/lib/richtext/types";
import richText from "../../atoms/RichText/richText.module.scss";
import { CodeBlockView } from "./components/CodeBlockView/CodeBlockView";
import { EditorToolbar } from "./components/EditorToolbar/EditorToolbar";
import { LinkForm } from "./components/LinkForm/LinkForm";
import type { SuggestionItem } from "./components/SuggestionMenu/SuggestionMenu";
import { AttachmentNode } from "./extensions/attachment";
import {
  DateChip,
  EmojiChip,
  IssueLinkChip,
  LinkChip,
  MentionChip,
} from "./extensions/chips";
import { searchEmoji } from "./extensions/emojiData";
import { Panel } from "./extensions/Panel";
import {
  filterSlashItems,
  SlashCommand,
  type SlashCommandItem,
} from "./extensions/SlashCommand";
import { createSuggestion } from "./extensions/suggestion";
import styles from "./richTextEditor.module.scss";
import { useFloatingPosition } from "./useFloatingPosition";

/**
 * The editor. Only runs in the browser — loaded by `EditableRichText` via
 * `next/dynamic`, so the Tiptap bundle only arrives once someone is
 * actually writing.
 *
 * The domain data for `@` and `#` is passed in by the caller. This
 * component lives in `components/ui` and therefore knows neither workspace
 * nor Prisma.
 */

/**
 * The translation function for the `editor` namespace. Its own type,
 * because `slashItems` receives it as a parameter and `Translator` from
 * `@/i18n/types` refers to the root namespace.
 */
export type EditorTranslator = ReturnType<typeof useTranslations<"editor">>;

/**
 * A virtual reference element at the cursor — indistinguishable to Floating
 * UI from a real DOM node like a toolbar button. Anchors a popover (address
 * bar, attachment dialog) to the writing position when no button triggered
 * it (keyboard shortcut, `/` menu).
 */
function cursorReference(view: Editor["view"]): ReferenceElement {
  const { top, bottom, left } = view.coordsAtPos(view.state.selection.from);
  return {
    getBoundingClientRect: () => new DOMRect(left, top, 0, bottom - top),
  };
}

/** A member, in the shape the `@` trigger needs. */
export interface MentionSource {
  id: string;
  name: string;
  /** Image for the suggestion list, as a ready-made element. */
  avatar?: React.ReactNode;
}

/** An issue, in the shape the `#` trigger needs. */
export interface IssueSource {
  id: string;
  /** Readable key, e.g. `ORB-42`. */
  identifier: string;
  title: string;
  icon?: React.ReactNode;
}

/** The attributes a successful attachment upload delivers for the node. */
export interface UploadedAttachment {
  id: string;
  url: string;
  name: string;
  mimeType: string | null;
  size: number | null;
}

export interface RichTextEditorProps {
  value: PMDoc | unknown;
  onChange: (doc: PMDoc) => void;
  /** Runs on ⌘/Ctrl+Enter. */
  onSubmit?: () => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  members?: MentionSource[];
  issues?: IssueSource[];
  /**
   * Uploads a file (toolbar, drag & drop, paste from clipboard) and returns
   * the resolved attributes for the node. If missing, the feature is off
   * for this editor instance (comments, the create-issue composer) — no
   * toolbar button, no intercepting files on drop/paste.
   */
  onUploadAttachment?: (
    file: File,
  ) => Promise<UploadedAttachment | { error: string }>;
  /** Deletes an attachment server-side — passed to the `attachment` node. */
  onRemoveAttachment?: (id: string) => Promise<void>;
  /**
   * Registers an external address as an attachment (no upload — the
   * attachment *is* the link), so it appears in the text like an uploaded
   * attachment and shows up in the attachments section. If missing, the
   * image dialog only offers file upload (or, if that's also missing, the
   * old URL prompt).
   */
  onAddLinkAttachment?: (input: {
    url: string;
    name?: string;
    mimeType?: string | null;
  }) => Promise<UploadedAttachment | { error: string }>;
  /**
   * Runs right before a native file dialog opens (attachment or image
   * upload). This lets the caller (`EditableRichText`) keep editing open
   * even though the dialog briefly takes focus away from the window —
   * otherwise `onBlur` would abort editing in the middle of the upload.
   */
  onFilePickerOpen?: () => void;
  className?: string;
  /**
   * Fills the height of its parent instead of growing with the text: the
   * toolbar stays on top, the writing surface scrolls. For a full-screen
   * editing view (`EditableRichText`'s `expandOnCompact`).
   */
  fill?: boolean;
  /**
   * Imperative escape hatch for the one thing a controlled `value`/`onChange`
   * pair can't do: move focus into the editor from outside on demand (e.g. a
   * keyboard shortcut). React 19 passes `ref` through as an ordinary prop —
   * no `forwardRef` wrapper needed, and it survives this component being
   * loaded via `next/dynamic` the same way any other prop would.
   */
  ref?: React.Ref<RichTextEditorHandle>;
}

export interface RichTextEditorHandle {
  focus: () => void;
  /**
   * Types a `/` at the cursor, which opens the command menu — for a touch
   * keyboard with no easy slash key (`CommandsButton`).
   */
  openCommands: () => void;
}

export function RichTextEditor({
  value,
  onChange,
  onSubmit,
  label,
  placeholder,
  autoFocus,
  members = [],
  issues = [],
  onUploadAttachment,
  onRemoveAttachment,
  onAddLinkAttachment,
  onFilePickerOpen,
  className,
  fill,
  ref,
}: RichTextEditorProps) {
  const t = useTranslations("editor");
  // Where the date picker popover sits while it's open. `null` means: closed.
  const [calendar, setCalendar] = useState<{ x: number; y: number } | null>(
    null,
  );
  const editorRef = useRef<Editor | null>(null);
  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.commands.focus(),
    openCommands: () => {
      const editor = editorRef.current;
      if (!editor) return;
      // The menu only opens after whitespace or at the start of a line.
      const { $from } = editor.state.selection;
      const before = $from.parent.textBetween(
        Math.max(0, $from.parentOffset - 1),
        $from.parentOffset,
      );
      editor
        .chain()
        .focus()
        .insertContent(before && !/\s/.test(before) ? " /" : "/")
        .run();
    },
  }));
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  /** Inserts the node at the cursor position — an inline atom like a chip,
   *  no line of its own: that way several small images fit side by side on
   *  one line instead of each forcing its own paragraph. */
  const insertAttachmentNode = useCallback((attrs: UploadedAttachment) => {
    editorRef.current
      ?.chain()
      .focus()
      .insertContent({ type: "attachment", attrs })
      .run();
  }, []);

  /** Uploads and inserts the node on success. */
  const pickAttachment = useCallback(
    async (file: File) => {
      if (!onUploadAttachment) return;
      setAttachmentError(null);
      const result = await onUploadAttachment(file);
      if ("error" in result) {
        setAttachmentError(result.error);
        return;
      }
      insertAttachmentNode(result);
    },
    [onUploadAttachment, insertAttachmentNode],
  );

  /** Registers a URL as an attachment and inserts the node on success. The
   *  MIME type is only guessed if the extension suggests an image
   *  (`guessImageMimeType`) — for anything else it stays `null` and the
   *  attachment shows up as a generic file card instead of an image
   *  preview. */
  const pickAttachmentUrl = useCallback(
    async (url: string, name: string) => {
      if (!onAddLinkAttachment) return;
      setAttachmentError(null);
      const result = await onAddLinkAttachment({
        url,
        name: name || undefined,
        mimeType: guessImageMimeType(url),
      });
      if ("error" in result) {
        setAttachmentError(result.error);
        return;
      }
      insertAttachmentNode(result);
    },
    [onAddLinkAttachment, insertAttachmentNode],
  );

  /**
   * Anchors the date picker popover at the cursor's current position.
   *
   * Kept stable because the extensions depend on it: a function that's new
   * on every render would invalidate the `useMemo` below, rebuild the
   * editor, and make the cursor jump. The ref and setter are themselves
   * stable, so the empty dependency list is correct.
   */
  const openCalendar = useCallback(() => {
    const view = editorRef.current?.view;
    if (!view) return;
    const at = view.coordsAtPos(view.state.selection.from);
    setCalendar({ x: at.left, y: at.bottom + 6 });
  }, []);

  /** What the address bar is anchored to and what it starts with. `null` means: closed. */
  const [linkAt, setLinkAt] = useState<{
    reference: ReferenceElement;
    initial: string;
    withName: boolean;
  } | null>(null);

  /**
   * Opens the address bar — at the clicked button, or, without one
   * (keyboard shortcut, `/` menu), at the cursor. If the cursor already sits
   * in a link, its address is pre-filled — then it's changed rather than set
   * anew.
   */
  const openLink = useCallback((anchor?: HTMLElement) => {
    const editor = editorRef.current;
    const view = editor?.view;
    if (!editor || !view) return;
    const current = editor.getAttributes("link").href;
    setLinkAt({
      reference: anchor ?? cursorReference(view),
      initial: typeof current === "string" ? current : "",
      // Without a selection, a chip is created — that needs a name.
      withName: view.state.selection.empty,
    });
  }, []);

  /** What the attachment dialog is anchored to, and whether it shows the
   *  picker or already the address bar. `null` means: closed. */
  const [attachmentPicker, setAttachmentPicker] = useState<{
    reference: ReferenceElement;
    mode: "choose" | "url";
  } | null>(null);

  /** Which option of the picker is currently highlighted — arrow keys
   *  navigate here just like in the `/` menu, only without its
   *  `SuggestionMenu`: the attachment dialog isn't attached to the
   *  suggestion plugin but is its own free-floating popover, whose keyboard
   *  handling runs directly through `handleKeyDown` below. */
  const [attachmentChoiceIndex, setAttachmentChoiceIndex] = useState(0);

  /**
   * Opens the attachment dialog — at the clicked button, or, without one
   * (keyboard shortcut, `/` menu), at the cursor — offering a choice
   * between URL and upload when both are available, or directly with
   * whichever one is. If the editor instance offers neither (comments, the
   * create-issue composer), it falls back to the old, plain URL prompt
   * (sets a raw `image` node instead of an attachment — without an upload
   * there's nothing that could be tracked).
   */
  const openAttachmentPicker = useCallback(
    (anchor?: HTMLElement) => {
      if (!onUploadAttachment && !onAddLinkAttachment) {
        const src = window.prompt("https://");
        if (src) editorRef.current?.chain().focus().setImage({ src }).run();
        return;
      }
      if (!onAddLinkAttachment) {
        onFilePickerOpen?.();
        attachmentInputRef.current?.click();
        return;
      }
      const view = editorRef.current?.view;
      if (!view) return;
      setAttachmentChoiceIndex(0);
      setAttachmentPicker({
        reference: anchor ?? cursorReference(view),
        mode: onUploadAttachment ? "choose" : "url",
      });
    },
    [onUploadAttachment, onAddLinkAttachment, onFilePickerOpen],
  );

  /** The two picker entries — a list, so keyboard (arrows, Enter) and mouse
   *  (click, hover) take the same path to execution. */
  const attachmentChooserOptions = useMemo(
    () => [
      {
        id: "upload",
        label: t("attachmentUpload"),
        icon: <Icon icon="lucide:upload" width={15} />,
        onSelect: () => {
          setAttachmentPicker(null);
          onFilePickerOpen?.();
          attachmentInputRef.current?.click();
        },
      },
      {
        id: "url",
        label: t("attachmentFromUrl"),
        icon: <Icon icon="lucide:link" width={15} />,
        onSelect: () =>
          setAttachmentPicker((p) => (p ? { ...p, mode: "url" as const } : p)),
      },
    ],
    [t, onFilePickerOpen],
  );

  /**
   * Two paths, depending on whether something is selected:
   *
   * - **Text selected** → it gets the link mark. The selected text *is* the
   *   name; a chip would replace it and would be the opposite of what's
   *   expected.
   * - **Nothing selected** → a chip with a name and website icon. A bare
   *   address in the middle of a sentence reads poorly.
   */
  const applyLink = (href: string, name: string) => {
    setLinkAt(null);
    const editor = editorRef.current;
    if (!editor) return;

    if (editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent([
          { type: "linkChip", attrs: { href, label: name } },
          // Without the space, the next word would stick to the chip.
          { type: "text", text: " " },
        ])
        .run();
      return;
    }
    editor.chain().focus().setLink({ href }).run();
  };

  const removeLink = () => {
    setLinkAt(null);
    editorRef.current?.chain().focus().unsetLink().run();
  };

  /**
   * Closes a popover and returns focus to the cursor.
   *
   * Without this, the editor would stay open but without focus: the
   * address bar had taken it and, on closing, handed it to no one.
   */
  const dismiss = (close: () => void) => () => {
    close();
    editorRef.current?.commands.focus();
  };

  const insertDate = (iso: string) => {
    setCalendar(null);
    editorRef.current
      ?.chain()
      .focus()
      .insertContent([
        { type: "dateChip", attrs: { date: iso } },
        // Without the space, the next word would stick to the chip.
        { type: "text", text: " " },
      ])
      .run();
  };

  // The extensions depend on the suggestion data. They're built once per
  // data snapshot — otherwise `useEditor` would rebuild the editor on every
  // keystroke and the cursor would jump.
  const extensions = useMemo(() => {
    const mention = MentionChip.configure({
      suggestion: createSuggestion<SuggestionItem>({
        name: "mentionSuggestion",
        char: "@",
        // Names often consist of two words — without this, the search
        // would break off at the first space.
        allowSpaces: true,
        emptyLabel: () => t("noMembers"),
        items: (query) => {
          const q = query.trim().toLowerCase();
          return (
            members
              .filter((m) => !q || m.name.toLowerCase().includes(q))
              .slice(0, 8)
              // No `hint`: the list shows that on the right, and a hex code
              // next to every name would be nonsense. `onSelect` fetches the
              // color from `members` on insertion.
              .map((m) => ({ id: m.id, label: m.name, icon: m.avatar }))
          );
        },
        onSelect: ({ editor, range, item }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: "mention",
                attrs: { id: item.id, label: item.label },
              },
              // Without the space, the next word would stick to the chip.
              { type: "text", text: " " },
            ])
            .run();
        },
      }),
    });

    const issueLink = IssueLinkChip.configure({
      suggestion: createSuggestion<SuggestionItem>({
        name: "issueLinkSuggestion",
        char: "#",
        emptyLabel: () => t("noIssues"),
        items: (query) => {
          const q = query.trim().toLowerCase();
          return issues
            .filter(
              (i) =>
                !q ||
                i.title.toLowerCase().includes(q) ||
                i.identifier.toLowerCase().includes(q),
            )
            .slice(0, 8)
            .map((i) => ({
              id: i.id,
              label: i.title,
              hint: i.identifier,
              icon: i.icon,
            }));
        },
        onSelect: ({ editor, range, item }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: "issueLink",
                attrs: { id: item.id, identifier: item.hint ?? "" },
              },
              { type: "text", text: " " },
            ])
            .run();
        },
      }),
    });

    const emoji = EmojiChip.configure({
      suggestion: createSuggestion<SuggestionItem>({
        name: "emojiSuggestion",
        char: ":",
        emptyLabel: () => t("noEmoji"),
        items: (query) =>
          // Only from two characters on — otherwise the list would pop open
          // on every colon in a ratio like `10:30`.
          query.length < 2
            ? []
            : searchEmoji(query).map((e) => ({
                id: e.name,
                label: e.name,
                hint: e.emoji,
              })),
        onSelect: ({ editor, range, item }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: "emoji",
                attrs: { name: item.id, emoji: item.hint ?? "" },
              },
              { type: "text", text: " " },
            ])
            .run();
        },
      }),
    });

    // `//` is the trigger for dates. It doesn't collide with the `/` menu:
    // as soon as the second slash appears, `@tiptap/suggestion`'s prefix
    // check there fails and the list closes.
    const date = DateChip.configure({
      suggestion: createSuggestion<SuggestionItem>({
        name: "dateSuggestion",
        char: "//",
        emptyLabel: () => t("noDates"),
        items: (query) => {
          const q = query.trim().toLowerCase();

          // Something typed like `//1.2.2002` wins and stands alone.
          const typed = parseDateInput(query);
          if (typed) {
            return [
              {
                id: typed,
                label: formatChipDate(typed),
                hint: t("dateTyped"),
                icon: <Icon icon="lucide:calendar-check" width={16} />,
              },
            ];
          }

          // Exactly two shortcuts: `//now` and `//tomorrow`. Everything else
          // is typed (`//1.2.2002`) or picked from the calendar popover.
          const presets: { id: string; label: string; key: string }[] = [
            { id: isoDate(), label: t("today"), key: "now" },
            { id: isoDate(1), label: t("tomorrow"), key: "tomorrow" },
          ];

          return [
            ...presets
              // The translated label matches too — someone typing `//heu`
              // finds "heute" (today), without there being a second
              // shortcut for it.
              .filter(
                (p) =>
                  !q ||
                  p.key.startsWith(q) ||
                  p.label.toLowerCase().startsWith(q),
              )
              .map((p) => ({
                id: p.id,
                label: p.label,
                hint: formatChipDate(p.id),
                icon: <Icon icon="lucide:calendar" width={16} />,
              })),
            {
              id: "calendar",
              label: t("dateOpenCalendar"),
              icon: <Icon icon="lucide:calendar-days" width={16} />,
            },
          ];
        },
        onSelect: ({ editor, range, item }) => {
          if (item.id === "calendar") {
            editor.chain().focus().deleteRange(range).run();
            openCalendar();
            return;
          }
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: "dateChip", attrs: { date: item.id } },
              { type: "text", text: " " },
            ])
            .run();
        },
      }),
    });

    const slash = SlashCommand.configure({
      suggestion: createSuggestion<SlashCommandItem>({
        name: "slashCommand",
        char: "/",
        emptyLabel: () => t("noCommands"),
        items: (query) =>
          filterSlashItems(
            slashItems(t, openLink, openAttachmentPicker),
            query,
          ),
        onSelect: ({ editor, range, item }) => item.run({ editor, range }),
      }),
    });

    return [
      StarterKit.configure({
        // Custom extensions — the kit's defaults would otherwise register
        // them twice.
        link: false,
        codeBlock: false,
      }),
      // The code block gets a React view: the language selector and copy
      // button need a menu, which `renderHTML` can't provide. Highlighting
      // itself runs via ProseMirror decorations — hence the lowlight
      // variant instead of the plain `CodeBlock`.
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
      }).configure({ lowlight }),
      // Tiptap's `Link` builds the anchor itself — the title therefore has
      // to go in here, so it's visible even while writing where a word
      // leads to.
      Link.extend({
        renderHTML({ HTMLAttributes }) {
          const href = HTMLAttributes.href;
          return [
            "a",
            mergeAttributes(HTMLAttributes, {
              ...(typeof href === "string" ? { title: href } : {}),
            }),
            0,
          ];
        },
      }).configure({ openOnClick: false, autolink: true }),
      Image,
      AttachmentNode.configure({ onRemove: onRemoveAttachment ?? null }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: true } }),
      Panel,
      // The hint about the `/` menu lives in the placeholder, not in the
      // toolbar: there it would always be visible, but it's only needed
      // precisely when the field is still empty.
      Placeholder.configure({
        placeholder: placeholder
          ? t("placeholderWithHint", { placeholder, hint: t("slashHint") })
          : t("slashHint"),
      }),
      mention,
      issueLink,
      emoji,
      LinkChip,
      date,
      slash,
    ];
  }, [
    members,
    issues,
    placeholder,
    t,
    openCalendar,
    openLink,
    openAttachmentPicker,
    onRemoveAttachment,
  ]);

  const editor = useEditor({
    extensions,
    // `PMDoc` describes attributes as `unknown`, Tiptap as `any` — the same
    // document in substance, just typed more strictly. The reinterpretation
    // stays confined to this one spot.
    content: toDoc(value) as JSONContent,
    autofocus: autoFocus ? "end" : false,
    // Next pre-renders client components on the server too; ProseMirror must
    // not start running immediately there, or the first client tree would
    // diverge.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `${richText.richText} ${styles.surface}`,
        "aria-label": label,
        role: "textbox",
        "aria-multiline": "true",
      },
      handleKeyDown: (_view, event) => {
        const mod = event.metaKey || event.ctrlKey;

        // The picker in the attachment dialog isn't a `SuggestionMenu`
        // instance (that's attached to the suggestion plugin, this dialog
        // isn't) — keyboard handling therefore runs here instead of via its
        // `onKeyDown`. Same controls as in the `/` menu: ↑ ↓ navigate,
        // ↵/Tab selects, Esc closes.
        if (attachmentPicker?.mode === "choose") {
          if (event.key === "Escape") {
            event.preventDefault();
            setAttachmentPicker(null);
            return true;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setAttachmentChoiceIndex(
              (i) => (i + 1) % attachmentChooserOptions.length,
            );
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setAttachmentChoiceIndex(
              (i) =>
                (i - 1 + attachmentChooserOptions.length) %
                attachmentChooserOptions.length,
            );
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            attachmentChooserOptions[attachmentChoiceIndex]?.onSelect();
            return true;
          }
        }

        if (event.key === "Enter" && mod) {
          event.preventDefault();
          onSubmit?.();
          return true;
        }

        // ⌘/Ctrl+K opens the address bar — the common shortcut for "Link".
        // `stopPropagation` so the key combo doesn't additionally land on a
        // parent handler while writing is happening here.
        if ((event.key === "k" || event.key === "K") && mod) {
          event.preventDefault();
          event.stopPropagation();
          openLink();
          return true;
        }

        return false;
      },
      // Files from drag & drop or the clipboard (e.g. a pasted screenshot)
      // go through the same upload path as the toolbar button. Without
      // `onUploadAttachment`, the default behavior applies (insert image as
      // base64, open file in a tab).
      //
      // `moved` is `true` when ProseMirror has already recognized the drop
      // as an internal move of an existing node (dragging an image to a
      // different spot in the same document). Chrome/Safari still place a
      // synthetic `File` in `dataTransfer.files` in that case, because the
      // dragged DOM contains an `<img>` — without this check the image
      // would therefore be uploaded again and inserted as a *second*, new
      // `attachment` node (without the saved `width`, hence at default
      // size), while the original node stays put: the move turns into a
      // copy. The actual internal move continues to go through
      // ProseMirror's own handling when `false` is returned here.
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;

        // Dragged from the attachments section (`IssueAttachments.tsx`'s
        // `onDragStart`, via `ATTACHMENT_DRAG_MIME`) — no upload, just a
        // reference to the same `Attachment` row, inserted exactly at the
        // position it was dropped over (not at the current cursor, which
        // could be sitting somewhere else entirely).
        const dragged = event.dataTransfer?.getData(ATTACHMENT_DRAG_MIME);
        if (dragged && onUploadAttachment) {
          let attrs: AttachmentDragPayload;
          try {
            attrs = JSON.parse(dragged);
          } catch {
            return false;
          }
          event.preventDefault();
          const target = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          const pos = target ? target.pos : view.state.selection.from;
          editorRef.current
            ?.chain()
            .focus()
            .insertContentAt(pos, { type: "attachment", attrs })
            .run();
          return true;
        }

        if (!onUploadAttachment) return false;
        const file = event.dataTransfer?.files?.[0];
        if (!file) return false;
        event.preventDefault();
        pickAttachment(file);
        return true;
      },
      handlePaste: (_view, event) => {
        if (!onUploadAttachment) return false;
        const file = Array.from(event.clipboardData?.files ?? [])[0];
        if (!file) return false;
        event.preventDefault();
        pickAttachment(file);
        return true;
      },
    },
    // `toPlainDoc` is mandatory, not just caution: ProseMirror's attributes
    // have no prototype and don't survive the trip to a Server Function.
    onUpdate: ({ editor }) => onChange(toPlainDoc(editor.getJSON() as PMDoc)),
  });

  editorRef.current = editor;

  const linkPosition = useFloatingPosition(linkAt?.reference ?? null);
  const attachmentPosition = useFloatingPosition(
    attachmentPicker?.reference ?? null,
    attachmentPicker?.mode,
  );

  return (
    <div
      className={[styles.editor, className].filter(Boolean).join(" ")}
      data-fill={fill || undefined}
    >
      <EditorToolbar
        editor={editor}
        onLink={openLink}
        onAttachment={onUploadAttachment ? openAttachmentPicker : undefined}
      />
      {onUploadAttachment && (
        <input
          ref={attachmentInputRef}
          type="file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) pickAttachment(file);
          }}
        />
      )}
      {attachmentError && (
        <p className={styles.attachmentError} role="alert">
          {attachmentError}
        </p>
      )}
      {/* The resize handle isn't a focusable element: dragging takes focus
          away from the text and doesn't hand it to anyone else. It must be
          returned afterward, or the cursor no longer sits in the text after
          resizing.

          The `isFocused` check matters — while selecting with the mouse the
          editor is already focused, and a `focus()` call would collapse the
          selection currently being dragged. */}
      <EditorContent
        editor={editor}
        className={styles.content}
        onMouseUp={() => {
          if (editorRef.current && !editorRef.current.isFocused) {
            editorRef.current.commands.focus();
          }
        }}
      />

      {/* On `body` instead of inside the editor: that one scrolls, and a
          popover inside it would get clipped along. The coordinates come
          from the cursor. */}
      {calendar &&
        createPortal(
          <>
            {/* A click outside closes it — without pulling focus out of the text. */}
            <button
              type="button"
              className={styles.floatingBackdrop}
              data-editor-floating
              aria-label={t("close")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={dismiss(() => setCalendar(null))}
            />
            <div
              className={styles.floatingLayer}
              data-editor-floating
              style={{ left: calendar.x, top: calendar.y }}
            >
              <Calendar
                onPick={insertDate}
                todayLabel={t("today")}
                tomorrowLabel={t("tomorrow")}
              />
            </div>
          </>,
          document.body,
        )}

      {linkAt &&
        createPortal(
          <>
            <button
              type="button"
              className={styles.floatingBackdrop}
              data-editor-floating
              aria-label={t("close")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={dismiss(() => setLinkAt(null))}
            />
            <div
              ref={linkPosition.floatingRef}
              className={styles.floatingLayer}
              data-editor-floating
              style={linkPosition.style}
            >
              <LinkForm
                initial={linkAt.initial}
                withName={linkAt.withName}
                onSubmit={applyLink}
                onRemove={linkAt.initial ? removeLink : undefined}
                onCancel={dismiss(() => setLinkAt(null))}
                label={t("link")}
                placeholder={t("linkPlaceholder")}
                nameLabel={t("linkName")}
                namePlaceholder={t("linkNamePlaceholder")}
                applyLabel={t("linkApply")}
                removeLabel={t("linkRemove")}
              />
            </div>
          </>,
          document.body,
        )}

      {attachmentPicker &&
        createPortal(
          <>
            <button
              type="button"
              className={styles.floatingBackdrop}
              data-editor-floating
              aria-label={t("close")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={dismiss(() => setAttachmentPicker(null))}
            />
            <div
              ref={attachmentPosition.floatingRef}
              className={styles.floatingLayer}
              data-editor-floating
              style={attachmentPosition.style}
            >
              {attachmentPicker.mode === "choose" ? (
                <div className={styles.attachmentChooser} role="listbox">
                  {attachmentChooserOptions.map((option, index) => (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={index === attachmentChoiceIndex}
                      data-index={index}
                      className={`${styles.attachmentChooserOption}${
                        index === attachmentChoiceIndex
                          ? ` ${styles.active}`
                          : ""
                      }`}
                      // Focus must stay in the editor, otherwise the
                      // arrow-key/Enter handling in `handleKeyDown` stops
                      // applying, because the editor only sees it while it
                      // has focus itself.
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setAttachmentChoiceIndex(index)}
                      onClick={() => option.onSelect()}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <LinkForm
                  withName
                  onSubmit={(href, name) => {
                    setAttachmentPicker(null);
                    pickAttachmentUrl(href, name);
                  }}
                  onCancel={dismiss(() => setAttachmentPicker(null))}
                  label={t("attachmentUrlLabel")}
                  placeholder={t("attachmentUrlPlaceholder")}
                  nameLabel={t("linkName")}
                  namePlaceholder={t("linkNamePlaceholder")}
                  applyLabel={t("attachmentApply")}
                  removeLabel={t("linkRemove")}
                />
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

/**
 * The entries of the `/` menu.
 *
 * Ordered by what's actually typed in an issue — not by markup language
 * convention:
 *
 * - **Lists first.** Bullet points structure almost every description, and
 *   checklists carry acceptance criteria and subtasks. That's the single
 *   most common reach overall.
 * - **Then headings.** "Steps to reproduce", "Expected", "Actual" —
 *   structure comes right after. Within the group it stays at 1, 2, 3: a
 *   reordered number sequence reads like a mistake, even though level 2 is
 *   used more often.
 * - **Blocks, code block first.** Logs and stack traces are everyday
 *   material in a bug report; quote, panels, table, and divider follow.
 * Where there's a markdown input rule, it's shown as a hint on the right —
 * read off from the extensions, not guessed. Someone who knows it types
 * faster than they could open the menu; someone who doesn't learns it here.
 *
 * - **Insert last.** Mention and issue have their own triggers with `@` and
 *   `#` — they're listed here only so they can be found. The three date
 *   entries go all the way to the end: otherwise they'd take up three lines
 *   in view for something rarely needed.
 */
function slashItems(
  t: EditorTranslator,
  openLink: () => void,
  openAttachmentPicker: () => void,
): SlashCommandItem[] {
  /** First remove the `/…` text, then run the command. */
  const at = (editor: Editor, range: { from: number; to: number }) =>
    editor.chain().focus().deleteRange(range);

  return [
    // ── Lists ────────────────────────────────────────────────────────────────
    {
      id: "bulletList",
      label: t("bulletList"),
      hint: "-",
      keywords: ["bullet list", "aufzählung", "liste", "list", "punkte", "ul"],
      group: t("groupLists"),
      icon: <Icon icon="lucide:list" width={16} />,
      run: ({ editor, range }) => at(editor, range).toggleBulletList().run(),
    },
    {
      id: "taskList",
      label: t("taskList"),
      hint: "[]",
      keywords: [
        "task list",
        "checkliste",
        "checklist",
        "todo",
        "aufgaben",
        "haken",
      ],
      group: t("groupLists"),
      icon: <Icon icon="lucide:list-checks" width={16} />,
      run: ({ editor, range }) => at(editor, range).toggleTaskList().run(),
    },
    {
      id: "orderedList",
      label: t("numberedList"),
      hint: "1.",
      keywords: [
        "numbered list",
        "nummerierte liste",
        "ordered list",
        "zahlen",
        "ol",
      ],
      group: t("groupLists"),
      icon: <Icon icon="lucide:list-ordered" width={16} />,
      run: ({ editor, range }) => at(editor, range).toggleOrderedList().run(),
    },

    // ── Text ─────────────────────────────────────────────────────────────────
    {
      id: "heading1",
      label: t("heading1"),
      hint: "#",
      keywords: ["heading 1", "überschrift 1", "titel", "title", "h1"],
      group: t("groupText"),
      icon: <Icon icon="lucide:heading-1" width={16} />,
      run: ({ editor, range }) =>
        at(editor, range).setNode("heading", { level: 1 }).run(),
    },
    {
      id: "heading2",
      label: t("heading2"),
      hint: "##",
      keywords: ["heading 2", "überschrift 2", "h2"],
      group: t("groupText"),
      icon: <Icon icon="lucide:heading-2" width={16} />,
      run: ({ editor, range }) =>
        at(editor, range).setNode("heading", { level: 2 }).run(),
    },
    {
      id: "heading3",
      label: t("heading3"),
      hint: "###",
      keywords: ["heading 3", "überschrift 3", "h3"],
      group: t("groupText"),
      icon: <Icon icon="lucide:heading-3" width={16} />,
      run: ({ editor, range }) =>
        at(editor, range).setNode("heading", { level: 3 }).run(),
    },

    // ── Blocks ───────────────────────────────────────────────────────────────
    {
      id: "codeBlock",
      label: t("codeBlock"),
      hint: "```",
      keywords: ["code block", "codeblock", "quelltext", "snippet", "code"],
      group: t("groupBlocks"),
      icon: <Icon icon="lucide:code" width={16} />,
      run: ({ editor, range }) => at(editor, range).toggleCodeBlock().run(),
    },
    {
      id: "blockquote",
      label: t("quote"),
      hint: ">",
      keywords: ["quote", "zitat", "blockquote"],
      group: t("groupBlocks"),
      icon: <Icon icon="lucide:quote" width={16} />,
      run: ({ editor, range }) => at(editor, range).toggleBlockquote().run(),
    },
    {
      id: "infoPanel",
      label: t("infoPanel"),
      keywords: ["info panel", "infoblock", "hinweis", "info", "panel"],
      group: t("groupBlocks"),
      icon: <Icon icon="lucide:info" width={16} />,
      run: ({ editor, range }) => at(editor, range).togglePanel("info").run(),
    },
    {
      id: "warningPanel",
      label: t("warningPanel"),
      keywords: [
        "warning panel",
        "warnblock",
        "warnung",
        "achtung",
        "warning",
        "panel",
      ],
      group: t("groupBlocks"),
      icon: <Icon icon="lucide:triangle-alert" width={16} />,
      run: ({ editor, range }) =>
        at(editor, range).togglePanel("warning").run(),
    },
    {
      id: "table",
      label: t("table"),
      keywords: ["table", "tabelle", "raster"],
      group: t("groupBlocks"),
      icon: <Icon icon="lucide:table" width={16} />,
      run: ({ editor, range }) =>
        at(editor, range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      id: "horizontalRule",
      label: t("divider"),
      hint: "---",
      keywords: [
        "divider",
        "trennlinie",
        "linie",
        "strich",
        "separator",
        "rule",
        "hr",
      ],
      group: t("groupBlocks"),
      icon: <Icon icon="lucide:minus" width={16} />,
      run: ({ editor, range }) => at(editor, range).setHorizontalRule().run(),
    },

    // ── Insert ───────────────────────────────────────────────────────────────
    {
      id: "link",
      label: t("link"),
      hint: `${modKey()} K`,
      keywords: [
        "link",
        "url",
        "website",
        "verlinkung",
        "adresse",
        "hyperlink",
      ],
      group: t("groupInsert"),
      icon: <Icon icon="lucide:link" width={16} />,
      // First remove the `/…` text, then open the address bar — it anchors
      // itself to wherever the cursor ends up afterward.
      run: ({ editor, range }) => {
        at(editor, range).run();
        openLink();
      },
    },
    {
      id: "attachment",
      label: t("attachment"),
      keywords: [
        "attachment",
        "anhang",
        "image",
        "bild",
        "foto",
        "photo",
        "picture",
        "video",
        "datei",
        "file",
        "upload",
      ],
      group: t("groupInsert"),
      icon: <Icon icon="lucide:paperclip" width={16} />,
      run: ({ editor, range }) => {
        at(editor, range).run();
        openAttachmentPicker();
      },
    },
    {
      id: "mention",
      label: t("mention"),
      hint: "@",
      keywords: [
        "mention",
        "erwähnung",
        "erwähnen",
        "mitglied",
        "person",
        "user",
      ],
      group: t("groupInsert"),
      icon: <Icon icon="lucide:at-sign" width={16} />,
      // Simply type the trigger — its own list pops open in response.
      run: ({ editor, range }) => at(editor, range).insertContent("@").run(),
    },
    {
      id: "issue",
      label: t("issueLink"),
      hint: "#",
      keywords: [
        "issue",
        "issue verlinken",
        "issue link",
        "ticket",
        "aufgabe",
        "link",
      ],
      group: t("groupInsert"),
      icon: <Icon icon="lucide:hash" width={16} />,
      run: ({ editor, range }) => at(editor, range).insertContent("#").run(),
    },
    {
      id: "date",
      label: t("date"),
      hint: "//",
      keywords: ["date", "datum", "kalender", "calendar", "termin", "frist"],
      group: t("groupInsert"),
      icon: <Icon icon="lucide:calendar" width={16} />,
      // Same as mention and issue: type the trigger and hand off to it.
      run: ({ editor, range }) => at(editor, range).insertContent("//").run(),
    },
  ];
}
