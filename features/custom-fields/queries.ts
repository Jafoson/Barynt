import "server-only";
import { cache } from "react";
import type {
  CustomFieldRow,
  CustomFieldsView,
} from "@/features/custom-fields/types";
import { toOptions } from "@/lib/custom-fields";
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

function toRow(f: FieldRecord): CustomFieldRow {
  return {
    id: f.id,
    key: f.key,
    name: f.name,
    description: f.description,
    type: f.type,
    options: toOptions(f.options),
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
        own: own.map(toRow),
        inherited: inherited.map(toRow),
      };
    }

    const access = await accessFor(userId, { workspaceId: scope.workspaceId });
    if (!access.has("customfield.manage")) return null;
    const own = await loadFields({
      workspaceId: scope.workspaceId,
      projectId: null,
    });
    return { name: "", own: own.map(toRow), inherited: [] };
  },
);
