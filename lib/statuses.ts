import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { CLOSED_CATEGORIES, isClosedCategory } from "@/lib/status-category";

/**
 * The ids of every status whose category closes an issue (BARY-161).
 *
 * `Issue.status` is a plain id without a relation to `Status`, so a Prisma
 * `where` can't filter on the category directly — queries ask for these ids
 * and filter with `status: { notIn: … }` instead. Deduplicated per request.
 */
export const closedStatusIds = cache(async (): Promise<string[]> => {
  const rows = await db.status.findMany({
    where: { category: { in: [...CLOSED_CATEGORIES] } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
});

/** Whether moving an issue to `statusId` closes it. An unknown id is open. */
export async function isClosedStatus(statusId: string): Promise<boolean> {
  const row = await db.status.findUnique({
    where: { id: statusId },
    select: { category: true },
  });
  return isClosedCategory(row?.category);
}
