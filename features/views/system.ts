import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { uid } from "@/lib/utils/id";
import type { SystemViewKey, ViewLayout } from "./schema";

/**
 * A workspace's system views (V8): cross-project views everybody has, which
 * belong to nobody and can't be changed — "My issues" (assigned to whoever
 * looks) and "Created by me". `@me` keeps them personal although they're
 * shared. Their names come from the translations (`views.system.*`), the
 * stored name is only a fallback.
 */
export const SYSTEM_VIEWS: {
  key: SystemViewKey;
  slug: string;
  name: string;
  icon: string;
  layout: ViewLayout;
  filter: Prisma.InputJsonValue;
}[] = [
  {
    key: "my-issues",
    slug: "my-issues",
    name: "My issues",
    icon: "lucide:circle-user",
    layout: "board",
    filter: {
      op: "and",
      rules: [{ field: "assignee", is: "any", value: ["@me"] }],
    },
  },
  {
    key: "created-by-me",
    slug: "created-by-me",
    name: "Created by me",
    icon: "lucide:pen-line",
    layout: "list",
    filter: {
      op: "and",
      rules: [{ field: "reporter", is: "any", value: ["@me"] }],
    },
  },
];

/**
 * Creates the system views a workspace is missing — on first use, so new
 * workspaces need nothing at creation. A slug already taken by someone's
 * own view gets a suffix instead of failing. Returns slug per key.
 */
export async function ensureSystemViews(
  workspaceId: string,
): Promise<Record<SystemViewKey, string>> {
  const existing = await db.savedView.findMany({
    where: { workspaceId, systemKey: { not: null } },
    select: { systemKey: true, slug: true },
  });
  const slugs = Object.fromEntries(
    existing.map((v) => [v.systemKey, v.slug]),
  ) as Partial<Record<SystemViewKey, string>>;

  for (const [position, def] of SYSTEM_VIEWS.entries()) {
    if (slugs[def.key]) continue;
    let slug = def.slug;
    for (let n = 2; ; n++) {
      const taken = await db.savedView.findUnique({
        where: { workspaceId_slug: { workspaceId, slug } },
        select: { id: true },
      });
      if (!taken) break;
      slug = `${def.slug}-${n}`;
    }
    try {
      await db.savedView.create({
        data: {
          id: uid("v"),
          workspaceId,
          projectId: null,
          ownerId: null,
          visibility: "WORKSPACE",
          systemKey: def.key,
          name: def.name,
          slug,
          icon: def.icon,
          layout: def.layout,
          filter: def.filter,
          // Before every view of the workspace's own.
          position: -100 + position,
        },
      });
      slugs[def.key] = slug;
    } catch {
      // Created by a parallel request in the meantime — read it back.
      const row = await db.savedView.findUnique({
        where: { workspaceId_systemKey: { workspaceId, systemKey: def.key } },
        select: { slug: true },
      });
      if (row) slugs[def.key] = row.slug;
    }
  }
  return slugs as Record<SystemViewKey, string>;
}

/** A system view's slug, if the workspace has it yet — read only. */
export async function systemViewSlug(
  workspaceId: string,
  key: SystemViewKey,
): Promise<string | null> {
  const row = await db.savedView.findUnique({
    where: { workspaceId_systemKey: { workspaceId, systemKey: key } },
    select: { slug: true },
  });
  return row?.slug ?? null;
}
