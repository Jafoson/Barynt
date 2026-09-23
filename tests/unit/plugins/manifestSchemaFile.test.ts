import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatIssues, parseManifest } from "@/lib/plugins/validate";
import {
  renderSchema,
  SCHEMA_PATH,
} from "../../../scripts/build-plugin-schema";

// Two files that describe the manifest without being the schema itself, and
// that would go stale unnoticed: the JSON Schema editors read
// (`public/schemas/barynt-plugin.schema.json`, regenerate with
// `bun run plugin-schema:build`) and the example manifests in the docs.

describe("generated JSON Schema", () => {
  it("is up to date with the zod schema", () => {
    expect(readFileSync(SCHEMA_PATH, "utf8")).toBe(renderSchema());
  });

  it("describes the fields authors have to write and rejects unknown ones", () => {
    const schema = JSON.parse(renderSchema()) as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, unknown>;
    };
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "manifestVersion",
        "id",
        "name",
        "version",
        "description",
        "author",
        "license",
        "categories",
        "barynt",
      ]),
    );
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining([
        "server",
        "client",
        "styles",
        "messages",
        "capabilities",
        "contributes",
        "dependencies",
        "scope",
      ]),
    );
  });
});

describe("example manifests in the docs", () => {
  const dir = join(import.meta.dir, "../../../docs/plugins/examples");
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));

  it("exist", () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it.each(files)("%s is a valid manifest", (file) => {
    const result = parseManifest(readFileSync(join(dir, file), "utf8"));
    expect(result.ok ? [] : formatIssues(result.issues)).toEqual([]);
  });
});
