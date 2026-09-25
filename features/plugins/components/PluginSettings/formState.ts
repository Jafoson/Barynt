import type { SettingsSaveResult } from "@/features/plugins/types";
import type {
  SettingField,
  SettingsForm,
  SettingsIssue,
  SettingValue,
} from "@/lib/plugins/settings";

// What a settings form holds while someone types, and what it hands to the action. Pure: no
// React, so the conversions are tested on their own. A text, a number and a choice are kept as
// the string the control shows (a half-typed number is not a number yet); a yes/no as a boolean.

export type FieldState = string | boolean;
export type FormState = Record<string, FieldState>;

/** What one field shows at the start: its value now, an empty box for "not set". */
function initialField(
  field: SettingField,
  value: SettingValue | null | undefined,
): FieldState {
  if (field.type === "boolean") return value === true;
  return value === null || value === undefined ? "" : String(value);
}

/** Every field's starting state, from the values the page read. */
export function initialState(form: SettingsForm): FormState {
  const state: FormState = {};
  for (const field of form.fields) {
    // Own values only: a setting may be called `constructor`.
    const value = Object.hasOwn(form.values, field.id)
      ? form.values[field.id]
      : undefined;
    state[field.id] = initialField(field, value);
  }
  return state;
}

/**
 * What the action is given: the whole form, one entry per field. An empty box is `null` ("not
 * set", which the server reads as the default); a number is what the box says, and text that
 * is not a number stays one that the server refuses, so nothing is quietly turned into `0`.
 */
export function toSubmit(
  fields: readonly SettingField[],
  state: FormState,
): Record<string, SettingValue | null> {
  const values: Record<string, SettingValue | null> = {};
  for (const field of fields) {
    const current = state[field.id];
    if (field.type === "boolean") {
      values[field.id] = current === true;
    } else if (field.type === "number") {
      const text = typeof current === "string" ? current.trim() : "";
      values[field.id] = text === "" ? null : Number(text);
    } else {
      values[field.id] = typeof current === "string" ? current : "";
    }
  }
  return values;
}

/** Whether something differs from what the form started with. */
export function isDirty(start: FormState, now: FormState): boolean {
  return Object.keys(now).some((id) => now[id] !== start[id]);
}

/** A problem's sentence, as a line under a field: it starts with a capital letter. */
const sentence = (message: string): string =>
  message.charAt(0).toUpperCase() + message.slice(1);

/**
 * The problems by setting, one line each (the first if there are several), and the ones that
 * are about the values as a whole (`id` empty), which have no field.
 */
export function groupIssues(issues: readonly SettingsIssue[] | undefined): {
  byField: Record<string, string>;
  whole: string[];
} {
  const byField: Record<string, string> = {};
  const whole: string[] = [];
  for (const issue of issues ?? []) {
    if (issue.id === "") whole.push(issue.message);
    // Own keys only: a setting may be called `constructor`.
    else if (!Object.hasOwn(byField, issue.id)) {
      byField[issue.id] = sentence(issue.message);
    }
  }
  return { byField, whole };
}

/**
 * Whether the box has to be filled. An empty box means the default (the server reads it so), so
 * a setting that has one is never "required", whatever the manifest says.
 */
export function mustFill(field: SettingField): boolean {
  return field.required && field.default === null;
}

/**
 * A field's default as the hint under it says it, for "Default: …"; `null` when there is none
 * to say. A yes/no shows its default by the box, so it has no line.
 */
export function defaultText(field: SettingField): string | null {
  const value = field.default;
  if (field.type === "boolean" || value === null || value === "") return null;
  if (field.type === "select") {
    return (
      field.options.find((option) => option.value === value)?.label ?? null
    );
  }
  return String(value);
}

/** The sentences a failed save is told in, already in the reader's language. */
export interface SaveWords {
  /** The save threw: the network, or a server that is not there. */
  saveFailed: string;
  /** Some settings are wrong, and each says which under its field. */
  notValid: string;
  /** The values are too large together. */
  tooLarge: string;
}

export type SaveOutcome =
  | { saved: true }
  | { saved: false; errors: Record<string, string>; failure: string };

/**
 * Saves the whole form and says what came of it: saved, or what to show. A problem with a
 * setting goes under that setting; the line above the buttons names the general one: "some
 * are not valid", the values' size, or, when no setting is at fault, the server's own sentence
 * (a plugin that was switched off meanwhile). A save that throws is "could not be saved", never
 * a raw error.
 */
export async function saveForm(
  form: SettingsForm,
  state: FormState,
  save: (
    values: Record<string, SettingValue | null>,
  ) => Promise<SettingsSaveResult>,
  words: SaveWords,
): Promise<SaveOutcome> {
  let result: SettingsSaveResult;
  try {
    result = await save(toSubmit(form.fields, state));
  } catch {
    return { saved: false, errors: {}, failure: words.saveFailed };
  }
  if (!("error" in result)) return { saved: true };

  const { byField, whole } = groupIssues(result.issues);
  const failure =
    whole.length > 0
      ? // The one whole-set problem the server knows says it in words; any other is "not valid".
        whole
          .map((message) =>
            message === "is too large" ? words.tooLarge : words.notValid,
          )
          .join(" ")
      : Object.keys(byField).length > 0
        ? words.notValid
        : result.error;
  return { saved: false, errors: byField, failure };
}
