import { CUSTOM_FIELD_TYPE_ICONS, type CustomFieldType } from "./types";

// The icons a custom field can be given, so it reads like a built-in field on a card, a row and in the
// Display panel. Dependency-free like the rest of this folder. A **fixed list of literals**, not any
// icon name: the icon bundle (`bun run icons:build`) only knows names it can read as string literals,
// and a name someone typed would fall back to the icon API at runtime; a list is also all a picker can
// show. Adding an icon is adding a line here and running `bun run icons:build`.

export const CUSTOM_FIELD_ICONS = [
  "lucide:tag",
  "lucide:bookmark",
  "lucide:flag",
  "lucide:star",
  "lucide:heart",
  "lucide:zap",
  "lucide:flame",
  "lucide:target",
  "lucide:rocket",
  "lucide:bug",
  "lucide:shield",
  "lucide:lock",
  "lucide:key",
  "lucide:globe",
  "lucide:building-2",
  "lucide:briefcase",
  "lucide:users",
  "lucide:user-round",
  "lucide:smile",
  "lucide:message-square",
  "lucide:mail",
  "lucide:phone",
  "lucide:link",
  "lucide:paperclip",
  "lucide:file-text",
  "lucide:folder",
  "lucide:package",
  "lucide:box",
  "lucide:layers",
  "lucide:cpu",
  "lucide:server",
  "lucide:database",
  "lucide:cloud",
  "lucide:code",
  "lucide:terminal",
  "lucide:calendar",
  "lucide:clock",
  "lucide:timer",
  "lucide:hourglass",
  "lucide:map-pin",
  "lucide:euro",
  "lucide:banknote",
  "lucide:shopping-cart",
  "lucide:receipt",
  "lucide:gauge",
  "lucide:chart-bar",
  "lucide:trending-up",
  "lucide:percent",
  "lucide:hash",
  "lucide:list-checks",
  "lucide:circle-help",
  "lucide:triangle-alert",
  "lucide:lightbulb",
  "lucide:palette",
  "lucide:wrench",
] as const;

export type CustomFieldIcon = (typeof CUSTOM_FIELD_ICONS)[number];

/** Is this one of the icons a field can have? Filters what comes from a client or the database. */
export function isFieldIcon(value: unknown): value is CustomFieldIcon {
  return (
    typeof value === "string" &&
    (CUSTOM_FIELD_ICONS as readonly string[]).includes(value)
  );
}

/**
 * The icon a field is drawn with: the one it was given, or the one of its type. A stored icon that is
 * no longer on the list (an older version's) falls back to the type's, never to nothing.
 */
export function fieldIcon(field: {
  type: CustomFieldType;
  icon?: string | null;
}): string {
  return isFieldIcon(field.icon)
    ? field.icon
    : CUSTOM_FIELD_TYPE_ICONS[field.type];
}
