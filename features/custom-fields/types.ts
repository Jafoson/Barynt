import type { DefinitionIssue } from "@/lib/custom-fields/config";
import type {
  CustomFieldConfig,
  CustomFieldType,
} from "@/lib/custom-fields/types";

/** A field's definition as the screens and the API read it. */
export interface CustomFieldRow {
  id: string;
  key: string;
  name: string;
  description: string;
  type: CustomFieldType;
  /** In its normal form; never throws to read (`fieldConfigOrDefault`). */
  config: CustomFieldConfig;
  position: number;
  archived: boolean;
  /** The plugin that declared it: a plugin's field is the plugin's to change. `null` for a person's. */
  pluginId: string | null;
  workspaceId: string;
  /** `null` = the whole workspace, else that project only. */
  projectId: string | null;
}

/** A row on the management page: how many answers it holds tells what deleting it costs. */
export interface CustomFieldManageRow extends CustomFieldRow {
  valueCount: number;
}

/** Where a set of fields is managed: the workspace's own, or one project's. */
export type CustomFieldScope = { workspaceId: string } | { projectId: string };

/** What the management page of a workspace's or a project's fields shows. */
export interface CustomFieldsView {
  level: "workspace" | "project";
  workspaceId: string;
  /** `null` on the workspace's page. */
  projectId: string | null;
  /** Its own fields, the archived ones too, in their order. */
  fields: CustomFieldManageRow[];
  /** On a project's page: the workspace-wide fields that apply there as well. Read only here. */
  inherited: CustomFieldRow[];
  /** `customfield.manage` in this scope. Without it the page only shows. */
  canManage: boolean;
  /** How many more fields the workspace may have (the projects' included). */
  room: number;
}

/**
 * What a write says: the id of the field, or a sentence. `issues` says which part of the
 * definition is wrong, so a form can show it under its field.
 */
export type CustomFieldResult =
  | { ok: true; id: string }
  | { error: string; issues?: DefinitionIssue[] };
