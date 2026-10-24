/**
 * What a status means, independent of its name (BARY-161) — mirrors the
 * `StatusCategory` Prisma enum as a plain string union, so this file has no
 * dependencies and runs everywhere (client components, seed, tests).
 *
 * Whether an issue is open or closed hangs off the category, not off
 * `Status.id`: `Issue.closedAt` gets set and cleared at exactly this
 * boundary (`features/issues/actions.ts`, `features/api-v1/mutations.ts`),
 * and the dashboard counts open work and measures throughput against it.
 */
export const STATUS_CATEGORIES = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
] as const;

export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

/**
 * The categories that count an issue as done — completed or canceled.
 * Everything else is open.
 *
 * Canceled counts too. A canceled issue isn't an accomplishment, but it's
 * also no longer work — if it kept counting toward the backlog, that
 * backlog would grow by exactly what someone deliberately cleared away.
 */
export const CLOSED_CATEGORIES = [
  "completed",
  "canceled",
] as const satisfies readonly StatusCategory[];

export function isClosedCategory(
  category: StatusCategory | null | undefined,
): boolean {
  return (
    !!category && (CLOSED_CATEGORIES as readonly string[]).includes(category)
  );
}
