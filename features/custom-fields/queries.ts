import "server-only";
import { cache } from "react";
import { optionsWithImageUrls } from "@/features/custom-fields/images";
import type {
  CustomFieldRow,
  CustomFieldsView,
} from "@/features/custom-fields/types";
import { getWorkspaceProjects } from "@/features/workspaces/queries";
import { getCurrentWorkspaceId } from "@/lib/current-workspace";
import { type FieldDefinition, isOptionVisual } from "@/lib/custom-fields";
import { db } from "@/lib/db";
import { accessFor, currentUserId } from "@/lib/permissions";

type FieldRecord = Awaited<ReturnType<typeof loadFields>>[number];

function loadFields(where: { workspaceId: string; projectId: string | null }) {
  return db.customField.findMany({
    where,
    orderBy: [{ position: "asc" }, { created: "asc" }],
    include: { _count: { select: { values: true } } },
  });
}

async function toRow(f: FieldRecord): Promise<CustomFieldRow> {
  return {
    id: f.id,
    key: f.key,
    name: f.name,
    description: f.description,
    type: f.type,
    options: await optionsWithImageUrls(f.options),
    icon: f.icon,
    dateMode: f.dateMode,
    allowCustomOptions: f.allowCustomOptions,
    optionVisuals: f.optionVisuals.filter(isOptionVisual),
    archived: f.archivedAt !== null,
    valueCount: f._count.values,
  };
}

/**
 * The fields of one scope, for the settings page — `null` unless the viewer
 * may manage them. Whoever can't change fields has no use for the page, so
 * it answers "not found" instead of showing a read-only copy.
 */
export const getCustomFieldsView = cache(
  async (
    scope: { workspaceId: string } | { projectId: string },
  ): Promise<(CustomFieldsView & { name: string }) | null> => {
    const userId = await currentUserId();
    if (!userId) return null;

    if ("projectId" in scope) {
      const project = await db.project.findUnique({
        where: { id: scope.projectId },
        select: { workspaceId: true, name: true },
      });
      if (!project) return null;
      const access = await accessFor(userId, { projectId: scope.projectId });
      if (!access.has("customfield.manage")) return null;

      const [own, inherited] = await Promise.all([
        loadFields({
          workspaceId: project.workspaceId,
          projectId: scope.projectId,
        }),
        loadFields({ workspaceId: project.workspaceId, projectId: null }),
      ]);
      return {
        name: project.name,
        own: await Promise.all(own.map(toRow)),
        inherited: await Promise.all(inherited.map(toRow)),
      };
    }

    const access = await accessFor(userId, { workspaceId: scope.workspaceId });
    if (!access.has("customfield.manage")) return null;
    const own = await loadFields({
      workspaceId: scope.workspaceId,
      projectId: null,
    });
    return { name: "", own: await Promise.all(own.map(toRow)), inherited: [] };
  },
);

/**
 * The active fields the viewer can use on issues: every workspace-wide field
 * and those of the projects they can see. A field of a project the viewer
 * has no access to would otherwise reveal its name.
 */
export const getWorkspaceCustomFields = cache(
  async (): Promise<FieldDefinition[]> => {
    const workspaceId = getCurrentWorkspaceId();
    if (!workspaceId) return [];
    const projects = await getWorkspaceProjects();
    const rows = await db.customField.findMany({
      where: {
        workspaceId,
        archivedAt: null,
        OR: [
          { projectId: null },
          { projectId: { in: projects.map((p) => p.id) } },
        ],
      },
      orderBy: [{ position: "asc" }, { created: "asc" }],
    });
    return Promise.all(
      rows.map(async (f) => ({
        id: f.id,
        key: f.key,
        name: f.name,
        description: f.description,
        type: f.type,
        // The storage key stays on the server; the page gets the URL.
        options: (await optionsWithImageUrls(f.options)).map((o) => ({
          ...o,
          image: null,
        })),
        icon: f.icon,
        dateMode: f.dateMode,
        allowCustomOptions: f.allowCustomOptions,
        optionVisuals: f.optionVisuals.filter(isOptionVisual),
        projectId: f.projectId,
      })),
    );
  },
);
