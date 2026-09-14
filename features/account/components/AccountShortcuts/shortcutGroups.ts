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
          id: "new-project",
          label: t("account.shortcutNewProject"),
          keys: "n",
        },
        {
          id: "palette",
          label: t("account.shortcutPalette"),
          desc: t("account.shortcutPaletteDesc"),
          keys: "mod+k",
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
      title: t("account.shortcutsGoTo"),
      rows: [
        {
          id: "goto-dashboard",
          label: t("account.shortcutGoToDashboard"),
          keys: "g+d",
        },
        {
          id: "goto-my-issues",
          label: t("account.shortcutGoToMyIssues"),
          keys: "g+i",
        },
        {
          id: "goto-projects",
          label: t("account.shortcutGoToProjects"),
          keys: "g+p",
        },
        {
          id: "goto-members",
          label: t("account.shortcutGoToMembers"),
          desc: t("account.shortcutGoToMembersDesc"),
          keys: "g+m",
        },
        {
          id: "goto-teams",
          label: t("account.shortcutGoToTeams"),
          keys: "g+t",
        },
        {
          id: "goto-settings",
          label: t("account.shortcutGoToSettings"),
          desc: t("account.shortcutGoToSettingsDesc"),
          keys: "g+s",
        },
        {
          id: "goto-board",
          label: t("account.shortcutGoToBoard"),
          desc: t("account.shortcutGoToProjectDesc"),
          keys: "g+b",
        },
        {
          id: "goto-list",
          label: t("account.shortcutGoToList"),
          desc: t("account.shortcutGoToProjectDesc"),
          keys: "g+l",
        },
        {
          id: "goto-project-overview",
          label: t("account.shortcutGoToProjectOverview"),
          desc: t("account.shortcutGoToProjectDesc"),
          keys: "g+o",
        },
        {
          id: "goto-project-prev",
          label: t("account.shortcutGoToProjectPrev"),
          desc: t("account.shortcutGoToProjectCycleDesc"),
          keys: "[",
        },
        {
          id: "goto-project-next",
          label: t("account.shortcutGoToProjectNext"),
          desc: t("account.shortcutGoToProjectCycleDesc"),
          keys: "]",
        },
        {
          id: "goto-project-number",
          label: t("account.shortcutGoToProjectNumber"),
          desc: t("account.shortcutGoToProjectNumberDesc"),
          keys: "mod+1",
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
          id: "add-sub-issue",
          label: t("account.shortcutAddSubIssue"),
          keys: "t",
        },
        {
          id: "add-relation",
          label: t("account.shortcutAddRelation"),
          keys: "r",
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
        {
          id: "open-page",
          label: t("account.shortcutOpenPage"),
          desc: t("account.shortcutOpenPageDesc"),
          keys: "o",
        },
        {
          id: "toggle-expand",
          label: t("account.shortcutToggleExpand"),
          keys: "e",
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
