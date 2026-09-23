import { z } from "zod";
import {
  MANIFEST_FILE,
  manifestSchema,
  type PluginManifest,
} from "@/lib/plugins/manifest";

// Reads a manifest and reports what is wrong with it in words an author can
// act on: one line per problem, each naming the field. Pure and free of
// I/O like `manifest.ts`; whoever reads the file (host, CLI, store CI) passes
// the text or the parsed value in.

export interface ManifestIssue {
  /** Dotted path such as `contributes.pages[0].id`, or `(manifest)` for the file as a whole. */
  path: string;
  message: string;
}

export type ManifestResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; issues: ManifestIssue[] };

const WHOLE_FILE = "(manifest)";

function pathToString(path: readonly PropertyKey[]): string {
  return path.reduce<string>((text, part) => {
    if (typeof part === "number") return `${text}[${part}]`;
    return text ? `${text}.${String(part)}` : String(part);
  }, "");
}

/** Is the value at `path` absent in `input`? Then "is required" says more than zod's own wording. */
function isMissing(input: unknown, path: readonly PropertyKey[]): boolean {
  let current: unknown = input;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return false;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return path.length > 0 && current === undefined;
}

function toIssues(issue: z.core.$ZodIssue, input: unknown): ManifestIssue[] {
  const base = pathToString(issue.path);

  // zod reports all unknown keys of an object in one issue; one line each reads better.
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => ({
      path: base ? `${base}.${key}` : key,
      message: "is not a known field",
    }));
  }

  // A key of a record (the ids under `dependencies`) is reported as one issue
  // that wraps the real reason.
  if (issue.code === "invalid_key") {
    const reasons = issue.issues.map((inner) => inner.message).join("; ");
    return [{ path: base, message: `is not a valid key: ${reasons}` }];
  }

  const message = isMissing(input, issue.path) ? "is required" : issue.message;
  return [{ path: base || WHOLE_FILE, message }];
}

/**
 * Checks a value that has already been parsed from JSON. Never throws: a
 * manifest is untrusted input, and an exception from a rule is reported as an
 * issue instead of taking down whoever asked.
 */
export function validateManifest(input: unknown): ManifestResult {
  try {
    const parsed = manifestSchema.safeParse(input);
    if (parsed.success) return { ok: true, manifest: parsed.data };
    return {
      ok: false,
      issues: parsed.error.issues.flatMap((issue) => toIssues(issue, input)),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      issues: [
        { path: WHOLE_FILE, message: `could not be checked: ${reason}` },
      ],
    };
  }
}

/** Checks the text of a `barynt-plugin.json`, including whether it is JSON at all. */
export function parseManifest(text: string): ManifestResult {
  let value: unknown;
  try {
    // A byte order mark is invisible in an editor and makes JSON.parse throw.
    value = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      issues: [
        {
          path: WHOLE_FILE,
          message: `${MANIFEST_FILE} is not valid JSON: ${reason}`,
        },
      ],
    };
  }
  return validateManifest(value);
}

/** One `path: message` line per issue, for logs, the CLI and the admin UI. */
export function formatIssues(issues: readonly ManifestIssue[]): string[] {
  return issues.map((issue) => `${issue.path}: ${issue.message}`);
}

/**
 * The JSON Schema for editors, generated from the zod schema so the two cannot
 * drift. It describes shapes and required fields; rules that need code
 * (reserved ids, unique ids, "styles need a client") are enforced by
 * `validateManifest` only. Described from an author's side (defaults optional).
 */
export function manifestJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(manifestSchema, { io: "input" }),
    title: "Barynt plugin manifest",
    description: `The ${MANIFEST_FILE} of a Barynt plugin.`,
  };
}
