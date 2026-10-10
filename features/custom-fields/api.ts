import "server-only";
import {
  FieldValueError,
  resolveFieldValues,
} from "@/features/custom-fields/values";
import {
  type CustomFieldType,
  type FieldOption,
  toOptions,
  usesOptions,
} from "@/lib/custom-fields";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

// The public API (REST and MCP) speaks field *keys*, not ids: the key is the
// stable name a field keeps when it is renamed, and an integration can't know
// ids up front. Choices are given by id or by label and come back as
// `{ id, label }`, so a script can show them without a second lookup.

export interface ApiFieldChoice {
  id: string;
  label: string;
}

export type ApiFieldValue =
  | string
  | number
  | boolean
  | ApiFieldChoice
  | ApiFieldChoice[];

/** A field definition as the API shows it. */
export interface ApiCustomField {
  id: string;
  key: string;
  name: string;
  description: string;
  type: CustomFieldType;
  /** Only for SELECT and MULTI_SELECT. */
  options: {
    id: string;
    label: string;
    color: string | null;
    /** An icon name such as `lucide:user`, or `null`. */
    icon: string | null;
  }[];
  /** An icon name such as `lucide:user`, or `null`. */
  icon: string | null;
  /** DATE: `DATE` (`YYYY-MM-DD`), `DATETIME` (ISO instant in UTC) or `TIME` (`HH:mm`). */
  dateMode: "DATE" | "DATETIME" | "TIME";
  /** Whether an unknown choice sent for this field is added as a new one. */
  allowCustomOptions: boolean;
  /** What a choice may carry: `icon`, `image`, `color`. */
  optionVisuals: string[];
  /** `null` = workspace-wide, otherwise the one project it belongs to. */
  projectId: string | null;
}

export function toApiCustomField(f: {
  id: string;
  key: string;
  name: string;
  description: string;
  type: CustomFieldType;
  options: unknown;
  icon: string | null;
  dateMode: "DATE" | "DATETIME" | "TIME";
  allowCustomOptions: boolean;
  optionVisuals: string[];
  projectId: string | null;
}): ApiCustomField {
  return {
    id: f.id,
    key: f.key,
    name: f.name,
    description: f.description,
    type: f.type,
    options: usesOptions(f.type)
      ? toOptions(f.options).map((o) => ({
          id: o.id,
          label: o.label,
          color: o.color,
          icon: o.icon ?? null,
        }))
      : [],
    icon: f.icon,
    dateMode: f.dateMode,
    allowCustomOptions: f.allowCustomOptions,
    optionVisuals: f.optionVisuals,
    projectId: f.projectId,
  };
}

/** What a stored value row needs to be shown: the value and its field. */
export interface FieldValueRow {
  value: unknown;
  field: {
    key: string;
    type: CustomFieldType;
    options: unknown;
    archivedAt: Date | null;
  };
}

function choice(options: FieldOption[], id: string): ApiFieldChoice {
  return { id, label: options.find((o) => o.id === id)?.label ?? id };
}

/**
 * `{ key: value }` for the fields of one issue. Archived fields stay out,
 * like they stay out of the app. A choice whose option was removed shows its
 * id as the label rather than disappearing.
 */
export function apiFieldValues(
  rows: FieldValueRow[] | undefined,
): Record<string, ApiFieldValue> {
  const out: Record<string, ApiFieldValue> = {};
  for (const { value, field } of rows ?? []) {
    if (field.archivedAt) continue;
    const options = toOptions(field.options);
    if (field.type === "SELECT" && typeof value === "string") {
      out[field.key] = choice(options, value);
    } else if (field.type === "MULTI_SELECT" && Array.isArray(value)) {
      out[field.key] = value
        .filter((v): v is string => typeof v === "string")
        .map((v) => choice(options, v));
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[field.key] = value;
    }
  }
  return out;
}

/** Accept an option by id, or by label ignoring case. */
function optionId(options: FieldOption[], given: unknown): string | null {
  if (typeof given !== "string") return null;
  const byId = options.find((o) => o.id === given);
  if (byId) return byId.id;
  const wanted = given.trim().toLowerCase();
  return options.find((o) => o.label.toLowerCase() === wanted)?.id ?? null;
}

export type TranslateResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; reason: "invalid_body" | "unknown_field" | "invalid_value" };

/**
 * Turns an API `customFields` object (`{ key: value }`) into
 * `{ fieldId: value }` for `writeIssueFieldValues`, and checks every value
 * against its field. Nothing is written here, so the caller can run it
 * before it changes anything else.
 *
 * `null` clears a value. An unknown key, a field that doesn't apply to the
 * project, or a value that doesn't fit is a rejection of the whole request.
 */
export async function translateApiFields(
  scope: { workspaceId: string; projectId: string },
  input: unknown,
): Promise<TranslateResult> {
  if (input === undefined) return { ok: true, values: {} };
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, reason: "invalid_body" };
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return { ok: true, values: {} };

  const fields = await db.customField.findMany({
    where: {
      workspaceId: scope.workspaceId,
      archivedAt: null,
      key: { in: entries.map(([key]) => key) },
      OR: [{ projectId: null }, { projectId: scope.projectId }],
    },
  });
  const byKey = new Map(fields.map((f) => [f.key, f]));

  const values: Record<string, unknown> = {};
  for (const [key, raw] of entries) {
    const field = byKey.get(key);
    if (!field) return { ok: false, reason: "unknown_field" };

    let value: unknown = raw;
    // A label that matches no choice becomes a new one, but only when the
    // field allows people to add their own (`resolveFieldValues` checks it
    // again and enforces the limits).
    const choose = (options: FieldOption[], given: unknown): unknown => {
      const id = optionId(options, given);
      if (id !== null) return id;
      if (field.allowCustomOptions && typeof given === "string") {
        return { create: given };
      }
      return null;
    };
    if (field.type === "SELECT" && raw !== null) {
      value = choose(toOptions(field.options), raw);
      if (value === null) return { ok: false, reason: "invalid_value" };
    } else if (field.type === "MULTI_SELECT" && raw !== null) {
      if (!Array.isArray(raw)) return { ok: false, reason: "invalid_value" };
      const options = toOptions(field.options);
      const ids = raw.map((v) => choose(options, v));
      if (ids.some((id) => id === null))
        return { ok: false, reason: "invalid_value" };
      value = ids;
    }
    values[field.id] = value;
  }

  try {
    await resolveFieldValues(scope, values);
  } catch (error) {
    if (error instanceof FieldValueError) {
      return { ok: false, reason: "invalid_value" };
    }
    throw error;
  }
  return { ok: true, values };
}

/**
 * Turns `field.<key>=<value>` query filters into an issue `where` fragment.
 * Every filter must match (AND). Returns `null` when a key names no field of
 * this project — the list is then empty rather than silently unfiltered.
 *
 * Exact match only: text and links compare as written, numbers numerically,
 * checkboxes as `true`/`false`, a single choice by id or label, and a
 * multi-choice field matches when it contains that choice.
 */
export async function fieldFiltersWhere(
  scope: { workspaceId: string; projectId: string },
  filters: Record<string, string>,
): Promise<Prisma.IssueWhereInput[] | null> {
  const keys = Object.keys(filters);
  if (keys.length === 0) return [];

  const fields = await db.customField.findMany({
    where: {
      workspaceId: scope.workspaceId,
      archivedAt: null,
      key: { in: keys },
      OR: [{ projectId: null }, { projectId: scope.projectId }],
    },
  });
  const byKey = new Map(fields.map((f) => [f.key, f]));

  const where: Prisma.IssueWhereInput[] = [];
  for (const key of keys) {
    const field = byKey.get(key);
    if (!field) return null;
    const raw = filters[key];

    let match: Prisma.JsonFilter | null;
    switch (field.type) {
      case "NUMBER": {
        const n = Number(raw.replace(",", "."));
        match = Number.isFinite(n) ? { equals: n } : null;
        break;
      }
      case "CHECKBOX":
        match =
          raw === "true" || raw === "false" ? { equals: raw === "true" } : null;
        break;
      case "SELECT": {
        const id = optionId(toOptions(field.options), raw);
        match = id ? { equals: id } : null;
        break;
      }
      case "MULTI_SELECT": {
        const id = optionId(toOptions(field.options), raw);
        match = id ? { array_contains: [id] } : null;
        break;
      }
      default:
        match = { equals: raw };
    }
    if (match === null) return null;
    where.push({ fieldValues: { some: { fieldId: field.id, value: match } } });
  }
  return where;
}
