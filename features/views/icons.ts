import type { ViewLayout } from "./schema";

/**
 * The icons a view can carry — a fixed set rather than any icon name, so
 * every one of them is a literal the icon bundle picks up (`bun run
 * icons:build`) and none falls back to the Iconify API at runtime.
 */
export const VIEW_ICONS = [
  "lucide:layers",
  "lucide:bug",
  "lucide:rocket",
  "lucide:inbox",
  "lucide:star",
  "lucide:flag",
  "lucide:target",
  "lucide:zap",
  "lucide:user",
  "lucide:users",
  "lucide:calendar",
  "lucide:circle-check",
  "lucide:flame",
  "lucide:sparkles",
  "lucide:shield",
  "lucide:bookmark",
] as const;

export type ViewIcon = (typeof VIEW_ICONS)[number];

export function isViewIcon(
  value: string | null | undefined,
): value is ViewIcon {
  return !!value && (VIEW_ICONS as readonly string[]).includes(value);
}

/** What a view without its own icon shows: its layout. */
export function viewIconOf(view: {
  icon: string | null;
  layout: ViewLayout;
}): string {
  if (isViewIcon(view.icon)) return view.icon;
  return view.layout === "list" ? "lucide:list" : "lucide:layout-dashboard";
}
