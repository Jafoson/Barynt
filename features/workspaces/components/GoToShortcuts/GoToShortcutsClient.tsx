"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useHasOpenModal } from "@/lib/context";
import {
  projectPath,
  projectSettingsPath,
  workspacePath,
  workspaceSettingsPath,
} from "@/lib/nav";
import { useShortcut, useShortcutSequence } from "@/lib/shortcuts/useShortcut";

interface GoToShortcutsClientProps {
  workspaceId: string;
  /** Alphabetical, same order as the sidebar (`getWorkspaceProjects`) —
   *  what "["/"]" below cycle through. */
  projectSlugs: string[];
}

/**
 * "g" then a letter jumps straight to one of the workspace's — or, inside
 * one, the current project's — main views. Gmail/Linear's own "go to"
 * convention. Pure side effect, renders nothing; the shortcuts themselves
 * are listed in `shortcutGroups.ts` for the "?" help modal.
 *
 * "b"/"l"/"o" (board/list/overview) only exist while a project is actually
 * in context — there's no "current project" outside one to send them to,
 * so they're simply absent from `bindings` rather than bound to nothing.
 * "m" and "s" go context-aware instead of doubling up on a second letter:
 * inside a project they mean *that* project's members/settings, same as
 * clicking those tabs there would — everywhere else, the workspace's.
 * `activeSlug` mirrors `NewIssueButton.tsx`'s own project-from-pathname
 * check for the same reason: preselecting from where you already are.
 *
 * "["/"]" cycle to the previous/next project — a separate, bare-key
 * shortcut rather than another "g" binding: this isn't "go to a fixed
 * destination", it's "step through a list", the same distinction the app
 * already draws between "g"-style jumps and j/k-style stepping through
 * issues. Wraps at the ends, same as the board's own cursor. Whatever
 * comes after `/project/<slug>` in the URL (board/list/members/settings/…)
 * carries over to the target project unchanged, so switching stays on the
 * same *kind* of page instead of always landing on the board.
 *
 * "mod+1".."mod+9" jump straight to the Nth project's board — same
 * position, same order (`projectSlugs`) as the palette's own "mod+1"
 * badges (`CommandPalette.tsx`), just usable from anywhere instead of only
 * while the palette is open. Unlike "["/"]" this always lands on the
 * board specifically, not whatever section you were already on — a fixed
 * numbered shortcut should go to a fixed place. A raw `keydown` listener
 * rather than `useShortcut`: nine near-identical calls would just be the
 * same check nine times over, and a `for` loop calling a hook isn't
 * something Biome's rules-of-hooks check accepts.
 *
 * Caveat worth knowing: most browsers already reserve bare mod+1..9 for
 * switching browser tabs, and normally win that fight before a page's own
 * keydown listener ever sees the event — this may not fire at all in some
 * browsers. Kept as asked; if that turns out to be the case in practice,
 * "mod+shift+1..9" is the usual escape hatch other apps use instead.
 */
export function GoToShortcutsClient({
  workspaceId,
  projectSlugs,
}: GoToShortcutsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const hasOpenModal = useHasOpenModal();

  const activeSlug = pathname.match(/\/project\/([^/]+)/)?.[1];
  const suffix =
    pathname.match(/\/project\/[^/]+((?:\/.*)?)$/)?.[1]?.replace(/^\//, "") ??
    "";

  const cycleProject = (delta: 1 | -1) => {
    if (!activeSlug || projectSlugs.length === 0) return;
    const index = projectSlugs.indexOf(activeSlug);
    if (index === -1) return;
    const next =
      projectSlugs[(index + delta + projectSlugs.length) % projectSlugs.length];
    router.push(projectPath(workspaceId, next, suffix));
  };

  useShortcut("[", () => cycleProject(-1), {
    enabled: !hasOpenModal && !!activeSlug,
  });
  useShortcut("]", () => cycleProject(1), {
    enabled: !hasOpenModal && !!activeSlug,
  });

  useEffect(() => {
    if (hasOpenModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey)
        return;
      if (!/^[1-9]$/.test(event.key)) return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.tagName === "INPUT" ||
          event.target.tagName === "TEXTAREA" ||
          event.target.isContentEditable)
      )
        return;
      const slug = projectSlugs[Number(event.key) - 1];
      if (!slug) return;
      event.preventDefault();
      router.push(projectPath(workspaceId, slug, ""));
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hasOpenModal, projectSlugs, workspaceId, router]);

  useShortcutSequence(
    "g",
    {
      d: () => router.push(workspacePath(workspaceId, "dashboard")),
      i: () => router.push(workspacePath(workspaceId, "my")),
      p: () => router.push(workspacePath(workspaceId, "projects")),
      t: () => router.push(workspacePath(workspaceId, "teams")),
      m: () =>
        router.push(
          activeSlug
            ? projectPath(workspaceId, activeSlug, "members")
            : workspacePath(workspaceId, "members"),
        ),
      s: () =>
        router.push(
          activeSlug
            ? projectSettingsPath(workspaceId, activeSlug, "")
            : workspaceSettingsPath(workspaceId, ""),
        ),
      ...(activeSlug && {
        b: () => router.push(projectPath(workspaceId, activeSlug, "")),
        l: () => router.push(projectPath(workspaceId, activeSlug, "list")),
        o: () => router.push(projectPath(workspaceId, activeSlug, "overview")),
      }),
    },
    { enabled: !hasOpenModal },
  );

  return null;
}
