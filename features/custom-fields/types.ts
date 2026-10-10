import type {
  CustomFieldType,
  DateMode,
  FieldOption,
} from "@/lib/custom-fields";

export interface CustomFieldRow {
  id: string;
  key: string;
  name: string;
  description: string;
  type: CustomFieldType;
  options: FieldOption[];
  icon: string | null;
  dateMode: DateMode;
  allowCustomOptions: boolean;
  archived: boolean;
  /** How many issues have a value in this field. */
  valueCount: number;
}

export interface CustomFieldsView {
  /** The fields that belong to this scope and can be changed here. */
  own: CustomFieldRow[];
  /**
   * For a project: the workspace's fields, shown for reference. They apply
   * in the project but are changed in the workspace settings. Empty on the
   * workspace page.
   */
  inherited: CustomFieldRow[];
}

/** Why a field action did not go through. Mapped to text by the UI. */
export type CustomFieldError =
  | "name_invalid"
  | "description_invalid"
  | "type_invalid"
  | "options_invalid"
  | "icon_invalid"
  | "image_invalid"
  | "date_mode_invalid"
  | "limit_reached"
  | "not_found";

export type CustomFieldResult<T extends object = object> =
  | ({ ok: true } & T)
  | { error: CustomFieldError };

export interface OptionInput {
  id?: string;
  label: string;
  color?: string | null;
  icon?: string | null;
  /** The object key from `requestOptionImageUpload`, or an unchanged stored one. */
  image?: string | null;
}
