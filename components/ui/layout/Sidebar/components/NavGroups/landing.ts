import type { ProjectLanding } from "@/features/account/preferences";
import { viewPath } from "@/features/views/url";
import { projectPath } from "@/lib/nav";

/**
 * Where a click on a project's name leads — the person's choice
 * (`projectLanding`). "Start view" opens the project's start view while
 * there is one they can see (V7), the board otherwise.
 */
export function projectLandingHref(
  workspaceId: string,
  projectSlug: string,
  landing: ProjectLanding,
  startViewSlug: string | null,
): string {
  if (landing === "view" && startViewSlug)
    return viewPath(workspaceId, projectSlug, startViewSlug);
  const section =
    landing === "list" ? "list" : landing === "dashboard" ? "overview" : "";
  return projectPath(workspaceId, projectSlug, section);
}
