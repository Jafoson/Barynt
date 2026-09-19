// Shared by the server (`AppShell` reads the cookies) and the client
// (`ShellFrame` writes them). Deliberately not in a "use client" module:
// from a server component, a non-component export of one of those arrives
// as a client reference, not as the value.

/** "1" while the sidebar is collapsed to its icon rail. */
export const NAV_COLLAPSED_COOKIE = "nav-collapsed";
/** Width of the expanded sidebar in rem. */
export const NAV_WIDTH_COOKIE = "nav-width";

export const NAV_WIDTH_DEFAULT_REM = 14.5;
export const NAV_WIDTH_MIN_REM = 12;
export const NAV_WIDTH_MAX_REM = 26;
/** Dragging the edge narrower than this collapses the sidebar. */
export const NAV_COLLAPSE_BELOW_REM = 9.5;
/** Width of the icon rail; matches `.navPane` in `appShell.module.scss`. */
export const NAV_RAIL_REM = 4;

/** Cookie value → a usable width; anything odd falls back to the default. */
export function parseNavWidth(value: string | undefined): number {
  const rem = Number.parseFloat(value ?? "");
  if (!Number.isFinite(rem)) return NAV_WIDTH_DEFAULT_REM;
  return Math.min(NAV_WIDTH_MAX_REM, Math.max(NAV_WIDTH_MIN_REM, rem));
}
