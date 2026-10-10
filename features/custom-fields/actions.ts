"use server";

import { revalidatePath } from "next/cache";
import type {
  CustomFieldResult,
  OptionInput,
} from "@/features/custom-fields/types";
import { recordAudit } from "@/lib/audit";
import type { AuditAction } from "@/lib/audit/actions";
import {
  FIELD_LIMITS,
  type FieldOption,
  fieldKeyFromName,
  isCustomFieldIcon,
  isCustomFieldType,
  isDateMode,
  isNumberMode,
  isOptionVisual,
  isReservedFieldKey,
  limitOptionVisuals,
  NUMBER_DECIMALS_RANGE,
  type NumberMode,
  type OptionVisualKind,
  toOptions,
  usesOptions,
  validateOptions,
} from "@/lib/custom-fields";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import {
  deleteAvatarObject,
  finalizeAvatarUpload,
  requestAvatarUpload,
} from "@/lib/storage";
import { isOwnAvatarKey } from "@/lib/storage/keys";
import { uid } from "@/lib/utils/id";

// Defining a field is one permission, `customfield.manage`, checked in the
// scope the field lives in: a workspace field in the workspace context, a
// project field in the project context. A project role therefore can't touch
// a workspace-wide field, and the other way round nothing is implied.

type Scope = { workspaceId: string; projectId: string | null };

function ctxOf(scope: Scope) {
  return scope.projectId
    ? ({ projectId: scope.projectId } as const)
    : ({ workspaceId: scope.workspaceId } as const);
}

/** The workspace comes from the project, never from the caller's input. */
async function scopeForNew(input: {
  workspaceId: string;
  projectId?: string | null;
}): Promise<Scope | null> {
  if (!input.projectId) {
    return { workspaceId: input.workspaceId, projectId: null };
  }
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: { workspaceId: true },
  });
  if (!project) return null;
  return { workspaceId: project.workspaceId, projectId: input.projectId };
}

async function uniqueKey(workspaceId: string, name: string): Promise<string> {
  const base = fieldKeyFromName(name);
  let key = isReservedFieldKey(base) ? `${base}_field` : base;
  let n = 1;
  while (
    await db.customField.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
      select: { id: true },
    })
  ) {
    key = `${base}_${++n}`;
  }
  return key;
}

function withIds(options: OptionInput[] | undefined) {
  return (options ?? []).map((o) => ({
    id: o.id && o.id !== "" ? o.id : uid("o_"),
    label: typeof o.label === "string" ? o.label : "",
    color: o.color ?? null,
    icon: o.icon ?? null,
    image: o.image ?? null,
  }));
}

/** Prisma's Json input wants plain objects, not an interface type. */
function plainOptions(options: FieldOption[]) {
  return options.map((o) => ({
    id: o.id,
    label: o.label,
    color: o.color,
    icon: o.icon ?? null,
    image: o.image ?? null,
  }));
}

/**
 * The number settings as they are stored, or `null` if one is not valid:
 * a mode from the list, places only with DECIMAL (1 to 6, 2 when none is
 * given), a short unit without line breaks.
 */
function cleanNumberSettings(input: {
  numberMode?: string;
  numberDecimals?: number | null;
  numberUnit?: string | null;
}): { mode: NumberMode; decimals: number | null; unit: string | null } | null {
  const mode = input.numberMode ?? "FREE";
  if (!isNumberMode(mode)) return null;

  let decimals: number | null = null;
  if (mode === "DECIMAL") {
    const d = input.numberDecimals ?? NUMBER_DECIMALS_RANGE.default;
    if (
      !Number.isInteger(d) ||
      d < NUMBER_DECIMALS_RANGE.min ||
      d > NUMBER_DECIMALS_RANGE.max
    ) {
      return null;
    }
    decimals = d;
  }

  const raw = input.numberUnit;
  let unit: string | null = null;
  if (raw !== undefined && raw !== null) {
    if (typeof raw !== "string") return null;
    const text = raw.trim();
    if (text.length > FIELD_LIMITS.numberUnit || /[\r\n]/.test(text)) {
      return null;
    }
    unit = text === "" ? null : text;
  }
  return { mode, decimals, unit };
}

/** The kinds a client asked for, or `null` if one is unknown. */
function cleanVisuals(input: string[] | undefined): OptionVisualKind[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input) || !input.every(isOptionVisual)) return null;
  return [...new Set(input)];
}

/** The storage keys of the images the options carry. */
function imageKeys(options: FieldOption[]): Set<string> {
  return new Set(options.flatMap((o) => (o.image ? [o.image] : [])));
}

/**
 * Checks the images of options about to be stored: a key that is not
 * already one of the field's own must belong to this workspace's option
 * images and exist in storage within the size limit. A key typed in by a
 * client can't point at someone else's object.
 */
async function imagesAreValid(
  workspaceId: string,
  options: FieldOption[],
  known: Set<string>,
): Promise<boolean> {
  for (const key of imageKeys(options)) {
    if (known.has(key)) continue;
    if (!isOwnAvatarKey("fieldoption", workspaceId, key)) return false;
    const result = await finalizeAvatarUpload("fieldoption", workspaceId, key);
    if ("error" in result) return false;
  }
  return true;
}

/** Removes the objects of images that no option carries any more. */
async function dropImages(keys: Iterable<string>) {
  for (const key of keys) await deleteAvatarObject(key);
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name === "" || name.length > FIELD_LIMITS.name) return null;
  return name;
}

function cleanDescription(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > FIELD_LIMITS.description ? null : text;
}

async function audit(
  action: AuditAction,
  actorId: string,
  field: { id: string; name: string },
  scope: Scope,
) {
  await recordAudit({
    action,
    actorId,
    target: { type: "customField", id: field.id, label: field.name },
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
  });
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function createCustomField(input: {
  workspaceId: string;
  projectId?: string | null;
  name: string;
  description?: string;
  type: string;
  options?: OptionInput[];
  icon?: string | null;
  /** Only for a date field. Fixed after creation. Default DATE. */
  dateMode?: string;
  /** Only for a choice field. */
  allowCustomOptions?: boolean;
  /** Only for a choice field: `icon`, `image`, `color`. */
  optionVisuals?: string[];
  /** Only for a number field. */
  numberMode?: string;
  numberDecimals?: number | null;
  numberUnit?: string | null;
}): Promise<CustomFieldResult<{ id: string; key: string }>> {
  const scope = await scopeForNew(input);
  if (!scope) return { error: "not_found" };
  const actorId = await requirePermission("customfield.manage", ctxOf(scope));

  const name = cleanName(input.name);
  if (!name) return { error: "name_invalid" };
  const description = cleanDescription(input.description);
  if (description === null) return { error: "description_invalid" };
  if (!isCustomFieldType(input.type)) return { error: "type_invalid" };

  const visuals = cleanVisuals(input.optionVisuals);
  if (!visuals) return { error: "visuals_invalid" };
  const shownVisuals = usesOptions(input.type) ? visuals : [];

  const validated = validateOptions(input.type, withIds(input.options));
  if (!validated.ok) return { error: "options_invalid" };
  // Only what the field allows a choice to carry is kept.
  const options = {
    ...validated,
    options: limitOptionVisuals(validated.options, shownVisuals),
  };

  const icon = input.icon ?? null;
  if (icon !== null && !isCustomFieldIcon(icon))
    return { error: "icon_invalid" };

  const dateMode = input.dateMode ?? "DATE";
  if (!isDateMode(dateMode)) return { error: "date_mode_invalid" };

  const number = cleanNumberSettings(input);
  if (!number) return { error: "number_invalid" };

  if (!(await imagesAreValid(scope.workspaceId, options.options, new Set()))) {
    return { error: "image_invalid" };
  }

  const active = await db.customField.count({
    where: { workspaceId: scope.workspaceId, archivedAt: null },
  });
  if (active >= FIELD_LIMITS.fieldsPerWorkspace) {
    return { error: "limit_reached" };
  }

  const last = await db.customField.aggregate({
    where: { workspaceId: scope.workspaceId, projectId: scope.projectId },
    _max: { position: true },
  });
  const key = await uniqueKey(scope.workspaceId, name);

  const field = await db.customField.create({
    data: {
      id: uid("cf_"),
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      key,
      name,
      description,
      type: input.type,
      icon,
      // A mode only means something for a date; other types keep the default.
      dateMode: input.type === "DATE" ? dateMode : "DATE",
      allowCustomOptions: usesOptions(input.type)
        ? input.allowCustomOptions === true
        : false,
      optionVisuals: shownVisuals,
      // Only a number field has a number mode; others keep the defaults.
      numberMode: input.type === "NUMBER" ? number.mode : "FREE",
      numberDecimals: input.type === "NUMBER" ? number.decimals : null,
      numberUnit: input.type === "NUMBER" ? number.unit : null,
      options: plainOptions(options.options),
      position: (last._max.position ?? -1) + 1,
    },
  });

  await audit("customfield.created", actorId, field, scope);
  refresh();
  return { ok: true, id: field.id, key: field.key };
}

async function loadField(id: string) {
  const field = await db.customField.findUnique({
    where: { id },
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
      name: true,
      type: true,
      options: true,
      optionVisuals: true,
    },
  });
  if (!field) return null;
  return {
    field,
    scope: {
      workspaceId: field.workspaceId,
      projectId: field.projectId,
    } satisfies Scope,
  };
}

/**
 * Rename, describe, or change the choices. The type and the key stay: a value
 * stored under another type would be wrong, and the key is what integrations
 * address the field by.
 *
 * Removing a choice clears it from the issues that carry it, in the same
 * transaction — a stored id with no matching option would otherwise show up
 * as an empty chip.
 */
export async function updateCustomField(
  id: string,
  patch: {
    name?: string;
    description?: string;
    options?: OptionInput[];
    icon?: string | null;
    allowCustomOptions?: boolean;
    optionVisuals?: string[];
    numberMode?: string;
    numberDecimals?: number | null;
    numberUnit?: string | null;
  },
): Promise<CustomFieldResult> {
  const found = await loadField(id);
  if (!found) return { error: "not_found" };
  const { field, scope } = found;
  const actorId = await requirePermission("customfield.manage", ctxOf(scope));

  const data: {
    name?: string;
    description?: string;
    options?: object[];
    icon?: string | null;
    allowCustomOptions?: boolean;
    optionVisuals?: OptionVisualKind[];
    numberMode?: NumberMode;
    numberDecimals?: number | null;
    numberUnit?: string | null;
  } = {};
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (!name) return { error: "name_invalid" };
    data.name = name;
  }
  if (patch.description !== undefined) {
    const description = cleanDescription(patch.description);
    if (description === null) return { error: "description_invalid" };
    data.description = description;
  }

  if (patch.icon !== undefined) {
    if (patch.icon !== null && !isCustomFieldIcon(patch.icon)) {
      return { error: "icon_invalid" };
    }
    data.icon = patch.icon;
  }
  if (patch.allowCustomOptions !== undefined && usesOptions(field.type)) {
    data.allowCustomOptions = patch.allowCustomOptions === true;
  }

  if (
    field.type === "NUMBER" &&
    (patch.numberMode !== undefined ||
      patch.numberDecimals !== undefined ||
      patch.numberUnit !== undefined)
  ) {
    const number = cleanNumberSettings(patch);
    if (!number) return { error: "number_invalid" };
    data.numberMode = number.mode;
    data.numberDecimals = number.decimals;
    data.numberUnit = number.unit;
  }

  // What a choice may carry: the new setting, else the stored one.
  let visuals: OptionVisualKind[] = (field.optionVisuals ?? []).filter(
    isOptionVisual,
  );
  const visualsChanged =
    patch.optionVisuals !== undefined && usesOptions(field.type);
  if (visualsChanged) {
    const cleaned = cleanVisuals(patch.optionVisuals);
    if (!cleaned) return { error: "visuals_invalid" };
    visuals = cleaned;
    data.optionVisuals = cleaned;
  }

  let removed: string[] = [];
  let droppedImages: string[] = [];
  if (
    (patch.options !== undefined || visualsChanged) &&
    usesOptions(field.type)
  ) {
    // Without new choices, the stored ones are re-saved under the new rule.
    const source: OptionInput[] =
      patch.options !== undefined
        ? patch.options
        : toOptions(field.options).map((o) => ({
            id: o.id,
            label: o.label,
            color: o.color,
            icon: o.icon,
            image: o.image,
          }));
    const validated = validateOptions(field.type, withIds(source));
    if (!validated.ok) return { error: "options_invalid" };
    const options = {
      ...validated,
      options: limitOptionVisuals(validated.options, visuals),
    };
    const before = toOptions(field.options);
    const kept = new Set(options.options.map((o) => o.id));
    removed = before.map((o) => o.id).filter((optionId) => !kept.has(optionId));

    // Only new keys are checked; the ones the field already had are its own.
    const had = imageKeys(before);
    if (!(await imagesAreValid(scope.workspaceId, options.options, had))) {
      return { error: "image_invalid" };
    }
    const now = imageKeys(options.options);
    droppedImages = [...had].filter((key) => !now.has(key));
    data.options = plainOptions(options.options);
  }

  await db.$transaction(async (tx) => {
    await tx.customField.update({ where: { id }, data });

    if (removed.length === 0) return;
    if (field.type === "SELECT") {
      await tx.issueFieldValue.deleteMany({
        where: {
          fieldId: id,
          OR: removed.map((optionId) => ({ value: { equals: optionId } })),
        },
      });
      return;
    }
    const rows = await tx.issueFieldValue.findMany({
      where: { fieldId: id },
      select: { issueId: true, value: true },
    });
    for (const row of rows) {
      if (!Array.isArray(row.value)) continue;
      const next = (row.value as unknown[]).filter(
        (v): v is string => typeof v === "string" && !removed.includes(v),
      );
      if (next.length === row.value.length) continue;
      if (next.length === 0) {
        await tx.issueFieldValue.delete({
          where: { issueId_fieldId: { issueId: row.issueId, fieldId: id } },
        });
      } else {
        await tx.issueFieldValue.update({
          where: { issueId_fieldId: { issueId: row.issueId, fieldId: id } },
          data: { value: next },
        });
      }
    }
  });

  // Best effort, after the change is stored: a leftover object is harmless.
  await dropImages(droppedImages);

  await audit(
    "customfield.updated",
    actorId,
    { id, name: data.name ?? field.name },
    scope,
  );
  refresh();
  return { ok: true };
}

/** Puts the given fields in this order. The ids must all be in the one scope. */
export async function reorderCustomFields(input: {
  workspaceId: string;
  projectId?: string | null;
  ids: string[];
}): Promise<CustomFieldResult> {
  const scope = await scopeForNew(input);
  if (!scope) return { error: "not_found" };
  await requirePermission("customfield.manage", ctxOf(scope));

  const ids = [...new Set(input.ids)];
  const found = await db.customField.findMany({
    where: {
      id: { in: ids },
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
    },
    select: { id: true },
  });
  if (found.length !== ids.length) return { error: "not_found" };

  await db.$transaction(
    ids.map((id, position) =>
      db.customField.update({ where: { id }, data: { position } }),
    ),
  );
  refresh();
  return { ok: true };
}

/** Hides a field from pickers and cards but keeps what was entered. */
export async function setCustomFieldArchived(
  id: string,
  archived: boolean,
): Promise<CustomFieldResult> {
  const found = await loadField(id);
  if (!found) return { error: "not_found" };
  const { field, scope } = found;
  const actorId = await requirePermission("customfield.manage", ctxOf(scope));

  if (!archived) {
    // Restoring counts against the limit like creating does.
    const active = await db.customField.count({
      where: { workspaceId: scope.workspaceId, archivedAt: null },
    });
    if (active >= FIELD_LIMITS.fieldsPerWorkspace) {
      return { error: "limit_reached" };
    }
  }

  await db.customField.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
  });
  await audit(
    archived ? "customfield.archived" : "customfield.restored",
    actorId,
    field,
    scope,
  );
  refresh();
  return { ok: true };
}

/** Deletes the field and, with it, every value (cascade). Not undoable. */
export async function deleteCustomField(
  id: string,
): Promise<CustomFieldResult> {
  const found = await loadField(id);
  if (!found) return { error: "not_found" };
  const { field, scope } = found;
  const actorId = await requirePermission("customfield.manage", ctxOf(scope));

  const row = await db.customField.findUnique({
    where: { id },
    select: { options: true },
  });
  await db.customField.delete({ where: { id } });
  await dropImages(imageKeys(toOptions(row?.options)));
  await audit("customfield.deleted", actorId, field, scope);
  refresh();
  return { ok: true };
}

/**
 * First step of putting an image on a choice: checks the right to manage
 * fields where this field lives, and the type and size, then issues a
 * presigned PUT URL. The browser uploads straight to storage and sends the
 * returned key back with the next save; `createCustomField` and
 * `updateCustomField` check it before they keep it.
 */
export async function requestOptionImageUpload(input: {
  workspaceId: string;
  projectId?: string | null;
  contentType: string;
  contentLength: number;
}): Promise<{ ok: true; key: string; uploadUrl: string } | { error: string }> {
  const scope = await scopeForNew(input);
  if (!scope) return { error: "not_found" };
  await requirePermission("customfield.manage", ctxOf(scope));

  if (input.contentLength > FIELD_LIMITS.imageBytes) {
    return { error: "too_large" };
  }
  return requestAvatarUpload({
    kind: "fieldoption",
    ownerId: scope.workspaceId,
    contentType: input.contentType,
    contentLength: input.contentLength,
  });
}
