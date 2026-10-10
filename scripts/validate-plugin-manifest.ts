// Validates one or more plugin `manifest.json` files against the same schema
// the installer uses. Meant for plugin authors and for the plugin directory's
// CI:
//
//   bun scripts/validate-plugin-manifest.ts path/to/manifest.json [...]
//
// Exits 1 if any file is unreadable, not JSON, or not a valid manifest.

import { readFileSync } from "node:fs";
import { validateManifest } from "../lib/plugins/manifest";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: validate-plugin-manifest.ts <manifest.json> [...]");
  process.exit(2);
}

let failed = false;
for (const file of files) {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    failed = true;
    console.error(`✗ ${file}: ${err instanceof Error ? err.message : err}`);
    continue;
  }
  const result = validateManifest(json);
  if (result.ok) {
    console.log(`✓ ${file} (${result.manifest.id}@${result.manifest.version})`);
  } else {
    failed = true;
    console.error(`✗ ${file}`);
    for (const e of result.errors) {
      console.error(`    ${e.path || "(root)"}: ${e.message}`);
    }
  }
}
process.exit(failed ? 1 : 0);
