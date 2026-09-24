import { pluginIdSchema } from "@/lib/plugins/manifest";

// What every plugin action checks about what a client sends, before it becomes part
// of a query or a path. A client is not typed by what the function says it takes,
// so these accept `unknown`, and the schemas refuse anything that is not text.

export const isPluginId = (id: unknown): id is string =>
  pluginIdSchema.safeParse(id).success;

/** Prisma's error for a row that exists already. */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}

/** Prisma's error for a row that is not there (anymore). */
export function isNotFound(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2025";
}
