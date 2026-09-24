import { z } from "zod";

// What a store repository contains, as the instance reads it. The format is the
// store's (Jafoson/barynt-plugin-store, `scripts/schema.ts`, BARY-104); this is a
// copy so that CI and the instance know the same one. The instance never trusts the
// clone (docs/plugins/store-format.md): it reads every file with these schemas and
// repeats the rules the store's CI checks.
//
// Pure: no filesystem, no database, so the host, the reader and tests all read the
// same rules.

/** Plugin id: lowercase ASCII letters, digits and dashes. Must equal the directory name. */
export const STORE_PLUGIN_ID = /^[a-z][a-z0-9-]{1,62}$/;

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Only https, without credentials: a download link or a repository address. */
const httpsUrl = z
  .url()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "must be an https:// URL without credentials");

/** `store.json` at the root of the repository. */
export const storeFileSchema = z.strictObject({
  $schema: z.string().optional(),
  schemaVersion: z.literal(1, {
    error:
      "this Barynt reads store format 1; the store uses another, so it needs a newer Barynt",
  }),
  id: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  name: z.string().min(1).max(80),
  /** Reserved for verifying signed commits; not evaluated yet. */
  maintainerKeys: z.array(z.string().min(1)).max(20).optional(),
});

export type StoreFile = z.output<typeof storeFileSchema>;

/** One published release. Once merged, `download` and `sha512` never change. */
export const versionSchema = z.strictObject({
  version: z.string().regex(SEMVER),
  download: httpsUrl,
  sha512: z
    .string()
    .regex(/^[0-9a-f]{128}$/, "must be 128 lowercase hex characters"),
  released: z.iso.date().optional(),
  changelog: httpsUrl.optional(),
  /** `true` or a reason. A revoked version is shown with a warning and not installed. */
  revoked: z.union([z.literal(true), z.string().min(1).max(500)]).optional(),
});

export type StoreVersionFile = z.output<typeof versionSchema>;

/** `plugins/<id>/source.json`. */
export const sourceFileSchema = z
  .strictObject({
    $schema: z.string().optional(),
    repository: httpsUrl.optional(),
    versions: z.array(versionSchema).min(1).max(200),
  })
  .superRefine((source, ctx) => {
    const seen = new Set<string>();
    source.versions.forEach((entry, index) => {
      if (seen.has(entry.version)) {
        ctx.addIssue({
          code: "custom",
          path: ["versions", index, "version"],
          message: `version ${entry.version} is listed twice`,
        });
      }
      seen.add(entry.version);
    });
  });

export type SourceFile = z.output<typeof sourceFileSchema>;

/** One line per problem, with where it is: `versions.0.sha512: must be ...`. */
export function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
