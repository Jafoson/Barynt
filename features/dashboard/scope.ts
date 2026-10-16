// ─── A dashboard's scope ────────────────────────────────────────────────────
//
// Dependency-free: no React, no DB. Same pattern as `view.ts` next door and
// as `toRange` in `lib/buckets.ts`.

/** Appears as `?scope=` in the address and in `DashboardPreference.scope`. */
export const DASHBOARD_SCOPES = ["all", "mine"] as const;

export type DashboardScope = (typeof DASHBOARD_SCOPES)[number];

/**
 * What the dashboard opens with when nobody has chosen anything.
 *
 * Anyone without `dashboard.view.all` gets this default overridden anyway
 * (`getProjectDashboard`/`getWorkspaceDashboard` force `"mine"`) — so it
 * only applies to those who can even choose.
 */
export const DEFAULT_DASHBOARD_SCOPE: DashboardScope = "all";

/**
 * Bring a value from the address or the database to a known scope.
 *
 * Falls back to the default instead of throwing: a typo in a parameter that
 * only picks the display is no reason for a 404. Multiple candidates may be
 * passed in in order — the first known one wins.
 */
export function toDashboardScope(
  ...candidates: (string | null | undefined)[]
): DashboardScope {
  for (const value of candidates) {
    if ((DASHBOARD_SCOPES as readonly string[]).includes(value ?? "")) {
      return value as DashboardScope;
    }
  }
  return DEFAULT_DASHBOARD_SCOPE;
}
