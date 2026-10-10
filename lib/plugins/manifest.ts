// The plugin manifest (`manifest.json`): what a plugin is, where it works,
// what it asks for and what it adds. One schema, used by the installer, the
// store repository's CI and the plugin author's own tooling — so it has no
// dependency on the app (no Prisma, no `server-only`).
//
// Strict on purpose: an unknown field is an error, not something to ignore.
// A plugin that declares more than Barynt understands should fail loudly
// instead of half-working.

import { z } from "zod";
import { compareSemver, isSemver } from "./semver";

/** How a plugin runs. In-process code is Barynt's own and not a plugin kind. */
export const PLUGIN_KINDS = ["declarative", "sandbox", "service"] as const;
export type PluginKind = (typeof PLUGIN_KINDS)[number];

/** Where a plugin can be switched on. Issues are surfaces inside a project. */
export const PLUGIN_LEVELS = ["workspace", "project"] as const;
export type PluginLevel = (typeof PLUGIN_LEVELS)[number];

/**
 * What a plugin may ask for. `resource:action` like the API key scopes; the
 * `ui:*` ones say which slot it fills. A closed list — a plugin cannot invent
 * a capability.
 */
export const CAPABILITIES = [
  "issues:read",
  "issues:write",
  "comments:read",
  "comments:write",
  "labels:read",
  "projects:read",
  "members:read",
  "fields:read",
  "fields:write",
  "storage:own",
  "notify:send",
  "events:issue",
  "events:comment",
  "ui:nav-item",
  "ui:project-view",
  "ui:dashboard-widget",
  "ui:issue-panel",
  "ui:issue-badge",
  "ui:action",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Plugin ids Barynt keeps for itself. */
export const RESERVED_PLUGIN_IDS = ["barynt", "core", "system", "admin"];

const ID_RE = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;
/** An id local to a plugin (`timeline`, `open-mr`). */
const LOCAL_ID_RE = /^[a-z][a-z0-9-]{0,38}[a-z0-9]$|^[a-z]$/;
const HOST_RE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ICON_RE = /^[a-z0-9-]+:[a-z0-9-]+$/;

const localId = z
  .string()
  .regex(LOCAL_ID_RE, "lower-case letters, digits and -");
const title = z.string().trim().min(1).max(60);
const icon = z
  .string()
  .regex(ICON_RE, 'expected "set:name", e.g. "lucide:clock"');

const entry = z.strictObject({ id: localId, title, icon: icon.optional() });

const optionSchema = z.strictObject({
  id: localId,
  label: title,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

const fieldSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  name: title,
  type: z.enum([
    "TEXT",
    "NUMBER",
    "DATE",
    "SELECT",
    "MULTI_SELECT",
    "CHECKBOX",
    "URL",
    "USER",
  ]),
  options: z.array(optionSchema).max(50).optional(),
});

const settingSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,39}$/),
  type: z.enum(["text", "number", "boolean", "select"]),
  label: title,
  description: z.string().max(300).optional(),
  default: z.union([z.string().max(500), z.number(), z.boolean()]).optional(),
  options: z.array(optionSchema).max(50).optional(),
});

const contributesSchema = z.strictObject({
  navItems: z.array(entry).max(5).optional(),
  projectViews: z.array(entry).max(5).optional(),
  dashboardWidgets: z.array(entry).max(5).optional(),
  issuePanels: z.array(entry).max(5).optional(),
  issueBadges: z.array(entry).max(5).optional(),
  actions: z.array(entry).max(20).optional(),
  fields: z.array(fieldSchema).max(20).optional(),
  settings: z.array(settingSchema).max(30).optional(),
});

type Contributes = z.infer<typeof contributesSchema>;

/** Which capability each contribution needs. */
const CONTRIBUTION_CAPABILITY: Record<
  Exclude<keyof Contributes, "settings">,
  Capability
> = {
  navItems: "ui:nav-item",
  projectViews: "ui:project-view",
  dashboardWidgets: "ui:dashboard-widget",
  issuePanels: "ui:issue-panel",
  issueBadges: "ui:issue-badge",
  actions: "ui:action",
  fields: "fields:write",
};

/** What each kind may contribute: no code, no browser surface for services. */
const KIND_CONTRIBUTIONS: Record<PluginKind, readonly (keyof Contributes)[]> = {
  declarative: ["fields", "settings", "issueBadges"],
  service: ["fields", "settings"],
  sandbox: [
    "navItems",
    "projectViews",
    "dashboardWidgets",
    "issuePanels",
    "issueBadges",
    "actions",
    "fields",
    "settings",
  ],
};

export const manifestSchema = z
  .strictObject({
    id: z
      .string()
      .regex(ID_RE, "lower-case letters, digits and -, 3 to 40 characters"),
    name: title,
    version: z.string().refine(isSemver, "expected MAJOR.MINOR.PATCH"),
    minBaryntVersion: z.string().refine(isSemver, "expected MAJOR.MINOR.PATCH"),
    maxBaryntVersion: z
      .string()
      .refine(isSemver, "expected MAJOR.MINOR.PATCH")
      .optional(),
    author: z.string().trim().min(1).max(80),
    authorUrl: z
      .url({ protocol: /^https?$/ })
      .max(300)
      .optional(),
    description: z.string().trim().min(1).max(300),
    license: z.string().trim().min(1).max(40),
    kind: z.enum(PLUGIN_KINDS),
    levels: z.array(z.enum(PLUGIN_LEVELS)).min(1).max(2),
    capabilities: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length),
    network: z.array(z.string().regex(HOST_RE, "expected a host name")).max(10),
    contributes: contributesSchema.default({}),
  })
  .superRefine((m, ctx) => {
    const add = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    if (RESERVED_PLUGIN_IDS.includes(m.id))
      add(["id"], `"${m.id}" is reserved for Barynt`);

    if (
      m.maxBaryntVersion &&
      compareSemver(m.maxBaryntVersion, m.minBaryntVersion) < 0
    )
      add(["maxBaryntVersion"], "must not be lower than minBaryntVersion");

    if (new Set(m.capabilities).size !== m.capabilities.length)
      add(["capabilities"], "capabilities must be unique");
    if (new Set(m.levels).size !== m.levels.length)
      add(["levels"], "levels must be unique");
    if (new Set(m.network).size !== m.network.length)
      add(["network"], "hosts must be unique");

    if (m.kind === "declarative" && m.network.length > 0)
      add(
        ["network"],
        "a declarative plugin has no code and cannot call hosts",
      );

    const allowed = KIND_CONTRIBUTIONS[m.kind];
    for (const key of Object.keys(m.contributes) as (keyof Contributes)[]) {
      const list = m.contributes[key];
      if (!list || list.length === 0) continue;

      if (!allowed.includes(key))
        add(
          ["contributes", key],
          `a ${m.kind} plugin cannot contribute ${key}`,
        );

      if (key !== "settings") {
        const needed = CONTRIBUTION_CAPABILITY[key];
        if (!m.capabilities.includes(needed))
          add(["contributes", key], `needs the capability ${needed}`);
      }

      const ids = (list as { id?: string; key?: string }[]).map(
        (e) => e.id ?? e.key,
      );
      if (new Set(ids).size !== ids.length)
        add(["contributes", key], "ids must be unique");
    }

    const fields = m.contributes.fields ?? [];
    fields.forEach((f, i) => {
      const hasOptions = f.type === "SELECT" || f.type === "MULTI_SELECT";
      if (hasOptions && !(f.options && f.options.length > 0))
        add(
          ["contributes", "fields", i, "options"],
          "a choice field needs options",
        );
      if (!hasOptions && f.options)
        add(
          ["contributes", "fields", i, "options"],
          "only choice fields have options",
        );
    });

    const settings = m.contributes.settings ?? [];
    settings.forEach((s, i) => {
      if (s.type === "select" && !(s.options && s.options.length > 0))
        add(
          ["contributes", "settings", i, "options"],
          "a select setting needs options",
        );
      if (s.type !== "select" && s.options)
        add(
          ["contributes", "settings", i, "options"],
          "only select settings have options",
        );
    });
  });

export type PluginManifest = z.infer<typeof manifestSchema>;

export interface ManifestIssue {
  path: string;
  message: string;
}

export type ManifestResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; errors: ManifestIssue[] };

/** Validate a parsed `manifest.json`. Never throws. */
export function validateManifest(input: unknown): ManifestResult {
  const parsed = manifestSchema.safeParse(input);
  if (parsed.success) return { ok: true, manifest: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  };
}

/**
 * Does this plugin run on this Barynt version? A plugin states the lowest
 * version it was built for, and optionally the highest it was tested on.
 */
export function isCompatible(
  manifest: Pick<PluginManifest, "minBaryntVersion" | "maxBaryntVersion">,
  baryntVersion: string,
): boolean {
  if (compareSemver(baryntVersion, manifest.minBaryntVersion) < 0) return false;
  if (
    manifest.maxBaryntVersion &&
    compareSemver(baryntVersion, manifest.maxBaryntVersion) > 0
  )
    return false;
  return true;
}
