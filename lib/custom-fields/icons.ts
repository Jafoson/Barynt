// The icons a custom field can carry. A fixed list written out as literals:
// the icon bundle (`lib/icons/bundle.generated.ts`) is built from string
// literals found in the code, so a name chosen at runtime would not be in it
// and would be fetched from the Iconify API instead — which is exactly what
// the bundle exists to avoid. Add one here, run `bun run icons:build`.

export const CUSTOM_FIELD_ICONS = [
  "lucide:user",
  "lucide:users",
  "lucide:building-2",
  "lucide:briefcase",
  "lucide:tag",
  "lucide:bookmark",
  "lucide:flag",
  "lucide:star",
  "lucide:heart",
  "lucide:zap",
  "lucide:flame",
  "lucide:shield",
  "lucide:bug",
  "lucide:wrench",
  "lucide:package",
  "lucide:rocket",
  "lucide:box",
  "lucide:git-branch",
  "lucide:git-pull-request",
  "lucide:code",
  "lucide:terminal",
  "lucide:database",
  "lucide:server",
  "lucide:globe",
  "lucide:link",
  "lucide:mail",
  "lucide:phone",
  "lucide:map-pin",
  "lucide:calendar",
  "lucide:clock",
  "lucide:timer",
  "lucide:hash",
  "lucide:percent",
  "lucide:euro",
  "lucide:coins",
  "lucide:receipt",
  "lucide:shopping-cart",
  "lucide:truck",
  "lucide:lightbulb",
  "lucide:target",
  "lucide:gauge",
  "lucide:layers",
  "lucide:palette",
  "lucide:file-text",
  "lucide:paperclip",
  "lucide:key",
  "lucide:lock",
  "lucide:circle-help",
] as const;

export type CustomFieldIcon = (typeof CUSTOM_FIELD_ICONS)[number];

export function isCustomFieldIcon(value: unknown): value is CustomFieldIcon {
  return (
    typeof value === "string" &&
    (CUSTOM_FIELD_ICONS as readonly string[]).includes(value)
  );
}
