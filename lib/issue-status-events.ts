import "server-only";
import { db } from "@/lib/db";

/**
 * Note where an issue now stands (BARY-171) — at its creation (`from`
 * null) and at every status change. The categories are looked up now and
 * stored with the row, so the flow metrics read the past as it was even
 * if a status is later filed under another category.
 *
 * Never throws: the change itself has happened, a missing row only leaves
 * a gap in the charts.
 */
export async function recordStatusEvent(
  issueId: string,
  from: string | null,
  to: string,
  at: Date = new Date(),
): Promise<void> {
  try {
    const statuses = await db.status.findMany({
      where: { id: { in: from ? [from, to] : [to] } },
      select: { id: true, category: true },
    });
    const categoryOf = (id: string) =>
      statuses.find((s) => s.id === id)?.category;
    const toCategory = categoryOf(to);
    if (!toCategory) return;
    await db.issueStatusEvent.create({
      data: {
        issueId,
        fromStatus: from,
        toStatus: to,
        fromCategory: from ? (categoryOf(from) ?? null) : null,
        toCategory,
        at,
      },
    });
  } catch (error) {
    console.error("issue status event failed", issueId, error);
  }
}
