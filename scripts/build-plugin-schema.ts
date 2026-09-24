/**
 * Builds `public/schemas/barynt-plugin.schema.json`: the JSON Schema of the
 * plugin manifest, generated from the zod schema in `lib/plugins/manifest.ts`
 * so editors can complete and check a `barynt-plugin.json` (`"$schema"`) and
 * the two can never drift apart.
 *
 *   bun run plugin-schema:build     regenerate after changing the manifest schema
 *   bun run plugin-schema:check     fail if the generated file is out of date
 *
 * The file is served by the app under `/schemas/…`, and authors can point at it
 * through the repository's raw URL (see docs/plugins/manifest.md).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { manifestJsonSchema } from "../lib/plugins/validate";

export const SCHEMA_PATH = resolve(
  import.meta.dir,
  "../public/schemas/barynt-plugin.schema.json",
);

/** The file's exact contents. */
export function renderSchema(): string {
  return `${JSON.stringify(manifestJsonSchema(), null, 2)}\n`;
}

if (import.meta.main) {
  const rendered = renderSchema();
  if (process.argv.includes("--check")) {
    const current = existsSync(SCHEMA_PATH)
      ? readFileSync(SCHEMA_PATH, "utf8")
      : "";
    if (current !== rendered) {
      console.error(
        "public/schemas/barynt-plugin.schema.json is out of date. Run: bun run plugin-schema:build",
      );
      process.exit(1);
    }
    console.log("plugin manifest schema is up to date");
  } else {
    mkdirSync(dirname(SCHEMA_PATH), { recursive: true });
    writeFileSync(SCHEMA_PATH, rendered);
    console.log(`wrote ${SCHEMA_PATH}`);
  }
}
