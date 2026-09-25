"use client";

import type { IssueComposerData } from "@/features/issues/types";
import { useRouter } from "@/i18n/navigation";
import { projectPath } from "@/lib/nav";
import type { IssueDetail } from "@/types";
import { IssueDetailPageView } from "./IssueDetailPageView";
import { useIssueDetail } from "./useIssueDetail";

interface IssueDetailPageProps {
  /** Loaded from the server — the page never starts out empty. */
  issue: IssueDetail;
  data: IssueComposerData;
}

/**
 * The full page at `/[workspace]/issue/[ref]`.
 *
 * It shares the hook with the side panel, not the shell: loading and
 * writing work the same, rendering doesn't. A panel sits over a list and
 * can be closed — a page stands on its own and leads back.
 */
export function IssueDetailPage({ issue, data }: IssueDetailPageProps) {
  const router = useRouter();
  const project = data.projects.find((p) => p.id === issue.project) ?? null;

  // Where it goes back to: the issue's project, not the browser history —
  // a link that still works even when the page was opened directly.
  const backHref = project
    ? projectPath(data.workspaceId, project.slug, "")
    : `/${data.workspaceId}`;

  const {
    issue: current,
    patch,
    setField,
    comment,
    remove,
    refresh,
  } = useIssueDetail({
    issueRef: issue.id,
    data,
    initialIssue: issue,
    // Deleted means here: the page has nothing left to show. So on to the project.
    onDeleted: () => router.push(backHref),
  });

  return (
    <IssueDetailPageView
      issue={current ?? issue}
      project={project}
      data={data}
      backHref={backHref}
      onPatch={patch}
      onField={setField}
      onComment={comment}
      onDelete={remove}
      onRefresh={refresh}
    />
  );
}
