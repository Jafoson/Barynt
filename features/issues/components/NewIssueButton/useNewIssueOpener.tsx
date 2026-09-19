"use client";

import { CreateIssueModal } from "@/features/issues/components/CreateIssueModal/CreateIssueModal";
import type { IssueComposerData } from "@/features/issues/types";
import { usePathname } from "@/i18n/navigation";
import { useModal } from "@/lib/context";

/** New tasks land in the backlog, provided the workspace has that status. */
const DEFAULT_STATUS = "backlog";

/**
 * Opens the `CreateIssueModal` for whatever "new issue" button asks — the
 * sidebar's and the phone's floating one. Returns `null` where there's
 * nothing to open: no data, no project to create in, no status to start in.
 *
 * On a project route (/<workspace>/project/<slug>/…) the currently open
 * project is preselected — but only if creating is allowed there; otherwise
 * the first allowed one. It can still be switched inside the dialog.
 * Workspaces can have their own status lists — without "backlog", the first
 * one.
 */
export function useNewIssueOpener(data: IssueComposerData | null) {
  const { openModal } = useModal();
  const pathname = usePathname();
  if (!data) return null;

  const creatable = data.projects.filter((p) =>
    data.creatableProjectIds.includes(p.id),
  );
  const activeSlug = pathname.match(/\/project\/([^/]+)/)?.[1];
  const project = creatable.find((p) => p.slug === activeSlug) ?? creatable[0];
  const initialStatus =
    data.statuses.find((s) => s.id === DEFAULT_STATUS)?.id ??
    data.statuses[0]?.id;
  if (!project || !initialStatus) return null;

  return () =>
    openModal(({ close }) => (
      <CreateIssueModal
        projectId={project.id}
        initialStatus={initialStatus}
        data={data}
        close={close}
      />
    ));
}
