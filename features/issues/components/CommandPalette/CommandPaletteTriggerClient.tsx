"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ShortcutsHelpModal } from "@/features/account/components/AccountShortcuts/ShortcutsHelpModal";
import { CreateIssueModal } from "@/features/issues/components/CreateIssueModal/CreateIssueModal";
import type { IssueComposerData } from "@/features/issues/types";
import { usePathname } from "@/i18n/navigation";
import { useHasOpenModal, useModal } from "@/lib/context";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import { CommandPalette } from "./CommandPalette";

/** New tasks land in the backlog, provided the workspace has that status —
 *  same default `NewIssueButton.tsx` uses. */
const DEFAULT_STATUS = "backlog";

interface CommandPaletteTriggerClientProps {
  data: IssueComposerData;
}

/**
 * Owns the palette's open state: "mod+k" opens it (disabled while typing —
 * `useShortcut`'s default — and while a real modal already has focus), and
 * `SearchButton.tsx`'s click does the same via `window.__openPalette` —
 * that bridge already existed, waiting for something to set it; a mouse
 * click can't fake a held Cmd/Ctrl the way `dispatchShortcut` fakes a bare
 * key, so this is the direct call it actually needed.
 *
 * `onNewIssue` mirrors `NewIssueButton.tsx`'s own project-preselection
 * (current project from the URL, else the first creatable one) — same
 * modal, same defaults, just one more way to reach it. Missing entirely
 * without a creatable project, same as that button not rendering there.
 */
export function CommandPaletteTriggerClient({
  data,
}: CommandPaletteTriggerClientProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const hasOpenModal = useHasOpenModal();
  const { openModal } = useModal();
  const pathname = usePathname();

  useShortcut("mod+k", () => setOpen(true), { enabled: !hasOpenModal });

  useEffect(() => {
    const w = window as { __openPalette?: () => void };
    w.__openPalette = () => setOpen(true);
    return () => {
      w.__openPalette = undefined;
    };
  }, []);

  const creatable = data.projects.filter((p) =>
    data.creatableProjectIds.includes(p.id),
  );
  const activeSlug = pathname.match(/\/project\/([^/]+)/)?.[1];
  const project = creatable.find((p) => p.slug === activeSlug) ?? creatable[0];
  const initialStatus =
    data.statuses.find((s) => s.id === DEFAULT_STATUS)?.id ??
    data.statuses[0]?.id;

  const onNewIssue =
    project && initialStatus
      ? () =>
          openModal(({ close }) => (
            <CreateIssueModal
              projectId={project.id}
              initialStatus={initialStatus}
              data={data}
              close={close}
            />
          ))
      : undefined;

  const onShowShortcuts = () =>
    openModal(({ close }) => <ShortcutsHelpModal close={close} />, {
      label: t("nav.shortcuts"),
    });

  return (
    <CommandPalette
      open={open}
      onClose={() => setOpen(false)}
      workspaceId={data.workspaceId}
      projects={data.projects}
      statuses={data.statuses}
      searchIssues={data.searchIssues}
      onNewIssue={onNewIssue}
      onShowShortcuts={onShowShortcuts}
    />
  );
}
