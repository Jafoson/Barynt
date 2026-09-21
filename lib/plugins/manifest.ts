import { validRange } from "semver";
import { z } from "zod";

// ─── Plugin manifest (`barynt-plugin.json`) ─────────────────────────────────
//
// What a plugin says about itself. The host reads this file *without running
// any plugin code* (the same idea as Nextcloud's `appinfo/info.xml` or VS
// Code's `contributes`), so it can list, check and enable a plugin before
// deciding to trust its code.
//
// This file is the single source of truth for the format. Nothing here touches
// the database, `server-only` or React, so the store's CI, the build CLI, the
// admin UI and the tests can all read the same schema. It only depends on `zod`
// and `semver`. `scripts/build-plugin-schema.ts` generates the JSON Schema for
// editors from it, and `docs/plugins/manifest.md` describes it for authors.
//
// Not decided here, on purpose: what an item under `contributes` looks like
// (the ticket that builds each extension point defines that) and which
// capability names exist (BARY-95). Until then items only need an `id`, and a
// capability only needs the right shape.

/** The file name inside a plugin directory and inside a release archive. */
export const MANIFEST_FILE = "barynt-plugin.json";

/** Version of the manifest format itself, not of any plugin. */
export const MANIFEST_VERSION = 1;

/**
 * Ids the platform keeps for itself. A plugin id ends up in URLs
 * (`/api/plugins/<id>`), in permission keys (`plugin.<id>.<name>`) and in
 * directory names, so a plugin must not be able to pose as one of these.
 */
export const RESERVED_PLUGIN_IDS: readonly string[] = [
  "admin",
  "api",
  "barynt",
  "core",
  "plugin",
  "plugins",
  "system",
];

// ─── Building blocks ────────────────────────────────────────────────────────

/**
 * Plugin id: lowercase ASCII letters, digits and single dashes, starting with a
 * letter, 2 to 63 characters. It is also the plugin's directory name.
 */
export const pluginIdSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
    "use lowercase letters, digits and single dashes, starting with a letter",
  )
  .refine((id) => !RESERVED_PLUGIN_IDS.includes(id), "this id is reserved");

/**
 * SemVer without build metadata: a plugin version becomes a directory name and
 * appears in URLs, and `+` is awkward in both. Pre-release tags are allowed.
 */
export const pluginVersionSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    'must be a SemVer version such as "1.4.0" or "2.0.0-beta.1" (no build metadata)',
  );

/** A SemVer range, but never "any version": a compatibility claim has to claim something. */
export const versionRangeSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (range) => validRange(range) !== null,
    'not a valid SemVer range, for example "^1.2.0" or ">=1.0.0 <2.0.0"',
  )
  .refine(
    (range) => !["*", "x", "X"].includes(range.trim()),
    "must not accept every version",
  );

// The protocol is part of the URL check itself. A separate refinement calling
// `new URL()` would throw on "not a url": zod runs it even after the URL check
// failed, and a manifest is untrusted input that must never make validation throw.
const httpsUrl = z.url({
  protocol: /^https$/,
  error: "must be a full https:// URL",
});

const LOCALE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

/**
 * Text a person reads. Either one string or one string per language; with
 * several languages `en` is required because it is the fallback when the
 * user's language is missing.
 */
function localizedText(max: number) {
  const text = z.string().min(1).max(max);
  return z.union(
    [
      text,
      z
        .record(
          z.string().regex(LOCALE, 'a language code such as "en" or "de-CH"'),
          text,
        )
        .refine(
          (byLocale) => Object.hasOwn(byLocale, "en"),
          'needs an "en" entry, the fallback language',
        ),
    ],
    {
      error: `must be a text of 1 to ${max} characters, or an object with one text per language that includes "en"`,
    },
  );
}

/**
 * A path inside the plugin directory: relative, forward slashes, no `..`, no
 * hidden segments. Every rule reports its own problem, and the field's name is
 * already in the issue's path, so the messages do not repeat it.
 */
function pluginPath(extensions?: readonly string[]) {
  let schema = z
    .string()
    .min(1)
    .max(200)
    .refine(
      (path) => !path.startsWith("/") && !/^[A-Za-z]:/.test(path),
      "must be relative to the plugin directory",
    )
    .refine(
      (path) => !path.includes("\\") && !path.includes("\0"),
      "must use forward slashes",
    )
    .refine(
      // A leading "/" is reported above; do not report it a second time as an empty segment.
      (path) =>
        !(path.startsWith("/") ? path.slice(1) : path)
          .split("/")
          .some((segment) => segment === "" || segment.startsWith(".")),
      'must not contain empty, "." or ".." segments or hidden files',
    );
  if (extensions) {
    schema = schema.refine(
      (path) => extensions.some((extension) => path.endsWith(extension)),
      `must end in ${extensions.join(" or ")}`,
    );
  }
  return schema;
}

/**
 * `resource:action`, optionally followed by qualifiers, for example
 * `issues:read` or `network:egress:api.github.com`. Only the shape is checked
 * here; which names exist is decided with the capability model (BARY-95).
 */
export const capabilitySchema = z
  .string()
  .max(120)
  .regex(
    /^[a-z][a-z0-9-]*(?::(?:\*\.)?[a-z0-9][a-z0-9.-]*)+$/,
    'must look like "issues:read" or "network:egress:api.example.com"',
  );

// ─── Contributions ──────────────────────────────────────────────────────────

/**
 * Where a plugin can plug in. Each name is an extension point; the ticket that
 * builds the point defines the shape of its items. A misspelled or not yet
 * supported point is an error rather than something the host silently ignores.
 */
export const CONTRIBUTION_POINTS = [
  "settings",
  "pages",
  "navigation",
  "views",
  "issuePanels",
  "issueActions",
  "dashboardWidgets",
  "commands",
  "permissions",
  "events",
  "jobs",
  "webhooks",
  "customFields",
  "notifications",
] as const;

export type ContributionPoint = (typeof CONTRIBUTION_POINTS)[number];

const contributionItem = z.looseObject({
  /** Unique within the plugin and point; other tickets build keys and URLs from it. */
  id: z
    .string()
    .min(1)
    .max(63)
    .regex(
      /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
      "use lowercase letters, digits and single dashes",
    ),
  /** A condition under which the item is shown (VS Code style). Its grammar comes with the slot framework (BARY-65). */
  when: z.string().min(1).max(300).optional(),
});

const contributionList = z
  .array(contributionItem)
  .max(100)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    "ids must be unique within a list",
  )
  .optional();

const contributesSchema = z.strictObject({
  settings: contributionList,
  pages: contributionList,
  navigation: contributionList,
  views: contributionList,
  issuePanels: contributionList,
  issueActions: contributionList,
  dashboardWidgets: contributionList,
  commands: contributionList,
  permissions: contributionList,
  events: contributionList,
  jobs: contributionList,
  webhooks: contributionList,
  customFields: contributionList,
  notifications: contributionList,
}) satisfies z.ZodType<Partial<Record<ContributionPoint, unknown>>>;

// ─── The manifest ───────────────────────────────────────────────────────────

export const manifestSchema = z
  .strictObject({
    /** Lets editors offer completion; ignored by the host. */
    $schema: z.string().optional(),
    manifestVersion: z.literal(MANIFEST_VERSION, {
      error: `must be ${MANIFEST_VERSION}, the manifest format this version of Barynt reads`,
    }),

    // Identity
    id: pluginIdSchema,
    name: localizedText(80),
    version: pluginVersionSchema,
    description: localizedText(500),
    author: z.union(
      [
        z.string().min(1).max(200),
        z.strictObject({
          name: z.string().min(1).max(200),
          email: z.email().optional(),
          url: httpsUrl.optional(),
        }),
      ],
      {
        error:
          'must be a name, or an object with "name" and optionally "email" and "url"',
      },
    ),
    /** An SPDX license expression such as `MIT` or `Apache-2.0 OR MIT`. The list of ids is not checked. */
    license: z
      .string()
      .min(1)
      .max(100)
      .regex(
        /^[A-Za-z0-9.+-]+(?: (?:AND|OR|WITH) [A-Za-z0-9.+-]+)*$/,
        'must be an SPDX license expression such as "MIT" or "Apache-2.0 OR MIT"',
      ),
    homepage: httpsUrl.optional(),
    repository: httpsUrl.optional(),
    /** A file shipped in the plugin, so showing it needs no request to an icon service. */
    icon: pluginPath([".svg", ".png"]).optional(),

    // Compatibility
    /** The Barynt versions the plugin works with. */
    barynt: versionRangeSchema,
    /** Other plugins that must be installed first, by id and version range. */
    dependencies: z
      .record(pluginIdSchema, versionRangeSchema)
      .refine(
        (deps) => Object.keys(deps).length <= 20,
        "at most 20 dependencies",
      )
      .default({}),

    // Entry points, relative to the plugin directory. A manifest without
    // `server` and `client` is a declarative plugin: the host renders everything.
    server: pluginPath([".js", ".mjs"]).optional(),
    client: pluginPath([".js", ".mjs"]).optional(),
    styles: z
      .array(pluginPath([".css"]))
      .max(10)
      .optional(),
    /** A directory with one `<locale>.json` file per language. */
    messages: pluginPath().optional(),

    /** What the plugin asks to be allowed to do; the admin confirms it on install. */
    capabilities: z
      .array(capabilitySchema)
      .max(50)
      .refine(
        (caps) => new Set(caps).size === caps.length,
        "each capability may only be listed once",
      )
      .default([]),

    contributes: contributesSchema.default({}),
  })
  .superRefine((manifest, ctx) => {
    // hasOwn, not `in`: "constructor" is a valid plugin id and `in` also sees prototype members.
    if (Object.hasOwn(manifest.dependencies, manifest.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["dependencies", manifest.id],
        message: "a plugin cannot depend on itself",
      });
    }
    if (manifest.styles && !manifest.client) {
      ctx.addIssue({
        code: "custom",
        path: ["styles"],
        message: 'styles need a "client" entry point to belong to',
      });
    }
  });

/** A validated manifest, with defaults filled in. */
export type PluginManifest = z.output<typeof manifestSchema>;

/** What an author writes, before defaults are applied. */
export type PluginManifestInput = z.input<typeof manifestSchema>;

/**
 * A: only a manifest, the host renders everything (no plugin code runs).
 * B: the plugin ships code that runs in the app. The sandbox tier C is a
 * different way to run code and is not a property of the manifest.
 */
export function pluginTier(
  manifest: Pick<PluginManifest, "server" | "client">,
): "A" | "B" {
  return manifest.server || manifest.client ? "B" : "A";
}
