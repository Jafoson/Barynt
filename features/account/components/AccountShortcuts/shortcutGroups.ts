import type { Translator } from "@/i18n/types";

export interface ShortcutRow {
  id: string;
  label: string;
  desc?: string;
  /**
   * Spec(s) for both matching (`useShortcut`) and display (`Shortcut`) — an
   * array for a shortcut bound to more than one combo (e.g. "j" and "down"
   * both move the cursor).
   */
  keys: string | string[];
}

export interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

/**
 * The app's keyboard shortcuts, grouped the way they're actually scoped —
 * shared between the full reference page (`AccountShortcuts`) and the "?"
 * help modal (`ShortcutsHelpModal`), so the two can't drift apart.
 *
 * Deliberately only the shortcuts a `useShortcut` call (or the editor's own
 * keymap) actually binds somewhere — nothing here is aspirational. A row
 * for a shortcut that silently does nothing when pressed would be worse
 * than not documenting it at all.
 *
 * Takes `t` rather than calling `useTranslations`/`getTranslations` itself:
 * the page needs the server variant, the modal the client one, and both
 * have the same `(key, params?) => string` shape.
 */
export function shortcutGroups(t: Translator): ShortcutGroup[] {
  return [
    {
      title: t("account.shortcutsGlobal"),
      rows: [
        {
          id: "new-issue",
          label: t("account.shortcutNewIssue"),
          desc: t("account.shortcutNewIssueDesc"),
          keys: "c",
        },
        {
          id: "close-dialog",
          label: t("account.shortcutCloseDialog"),
          keys: "esc",
        },
        {
          id: "help",
          label: t("account.shortcutHelp"),
          keys: "?",
        },
      ],
    },
    {
      title: t("account.shortcutsIssue"),
      rows: [
        {
          id: "status",
          label: t("account.shortcutStatus"),
          keys: "s",
        },
        {
          id: "priority",
          label: t("account.shortcutPriority"),
          keys: "p",
        },
        {
          id: "assignee",
          label: t("account.shortcutAssignee"),
          keys: "a",
        },
        {
          id: "assign-me",
          label: t("account.shortcutAssignMe"),
          desc: t("account.shortcutAssignMeDesc"),
          keys: "i",
        },
        {
          id: "labels",
          label: t("account.shortcutLabels"),
          keys: "l",
        },
        {
          id: "focus-comment",
          label: t("account.shortcutFocusComment"),
          keys: "m",
        },
        {
          id: "copy-id",
          label: t("account.shortcutCopyId"),
          keys: "mod+.",
        },
        {
          id: "copy-link",
          label: t("account.shortcutCopyLink"),
          keys: "mod+shift+,",
        },
      ],
    },
    {
      title: t("account.shortcutsNav"),
      rows: [
        {
          id: "nav-move",
          label: t("account.shortcutNavMove"),
          keys: ["j", "k"],
        },
        {
          id: "nav-column",
          label: t("account.shortcutNavColumn"),
          keys: ["left", "right"],
        },
        {
          id: "nav-open",
          label: t("account.shortcutNavOpen"),
          keys: ["enter", "o"],
        },
      ],
    },
    {
      title: t("account.shortcutsDialogs"),
      rows: [
        {
          id: "submit",
          label: t("account.shortcutSubmit"),
          desc: t("account.shortcutSubmitDesc"),
          keys: "mod+enter",
        },
      ],
    },
    {
      title: t("account.shortcutsEditor"),
      rows: [
        {
          id: "link",
          label: t("account.shortcutLink"),
          keys: "mod+k",
        },
      ],
    },
  ];
}
