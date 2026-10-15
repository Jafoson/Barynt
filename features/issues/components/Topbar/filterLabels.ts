"use client";

import { useTranslations } from "next-intl";
import {
  type FilterField,
  type FilterNode,
  type FilterOp,
  type FilterRule,
  isGroup,
  ME,
  NONE_VALUE,
  type RelativeDate,
} from "@/features/issues/filter";
import { fullName } from "@/lib/utils/string";
import type {
  IssueType,
  Label,
  Priority,
  Project,
  Status,
  User,
} from "@/types";

/** What the labels are looked up from — the topbar's own data. */
export interface FilterLabelLookups {
  statuses: Status[];
  priorities: Priority[];
  issueTypes: IssueType[];
  members: User[];
  labels: Label[];
  projects: Project[];
}

/** The fields the editor offers, in its menu's order (BARY-166). Project
 *  only across projects ("my issues"). */
export const EDITOR_FIELDS: FilterField[] = [
  "status",
  "priority",
  "type",
  "assignee",
  "reporter",
  "label",
  "project",
  "storyPoints",
  "dueDate",
  "created",
  "updated",
  "parent",
];

/** The operators the editor offers per field — a curated subset of what the
 *  tree knows (`FILTER_FIELDS`), in the order people reach for them. */
export const EDITOR_OPS: Partial<Record<FilterField, FilterOp[]>> = {
  status: ["any", "none"],
  priority: ["any", "none", "gte", "lte"],
  type: ["any", "none"],
  assignee: ["any", "none", "empty", "notEmpty"],
  reporter: ["any", "none"],
  label: ["any", "none", "all", "empty", "notEmpty"],
  project: ["any", "none"],
  storyPoints: ["any", "none", "gte", "lte", "empty", "notEmpty"],
  dueDate: ["within", "before", "after", "empty", "notEmpty"],
  created: ["within", "before", "after"],
  updated: ["within", "before", "after"],
  parent: ["empty", "notEmpty"],
};

export const RELATIVE_OPTIONS: RelativeDate[] = [
  "overdue",
  "today",
  "next_7_days",
  "last_7_days",
  "last_30_days",
];

/**
 * Words for fields, operators and values — shared by the rule chips and the
 * editor, so both say the same thing.
 */
export function useFilterLabels(lookups: FilterLabelLookups) {
  const t = useTranslations();

  const field = (f: FilterField): string => {
    switch (f) {
      case "status":
        return t("fields.status");
      case "priority":
        return t("fields.priority");
      case "type":
        return t("fields.type");
      case "assignee":
        return t("fields.assignee");
      case "reporter":
        return t("filters.fieldReporter");
      case "label":
        return t("fields.label");
      case "project":
        return t("fields.project");
      case "storyPoints":
        return t("fields.storyPoints");
      case "dueDate":
        return t("fields.dueDate");
      case "created":
        return t("fields.created");
      case "updated":
        return t("fields.updated");
      case "parent":
        return t("filters.fieldParent");
      default:
        return f;
    }
  };

  const op = (f: FilterField, o: FilterOp): string => {
    if (f === "parent")
      return o === "empty"
        ? t("filters.opParentEmpty")
        : t("filters.opParentSet");
    switch (o) {
      case "any":
        return t("filters.opAny");
      case "none":
        return t("filters.opNone");
      case "all":
        return t("filters.opAll");
      case "empty":
        return t("filters.opEmpty");
      case "notEmpty":
        return t("filters.opNotEmpty");
      case "gte":
        return t("filters.opGte");
      case "lte":
        return t("filters.opLte");
      case "before":
        return t("filters.opBefore");
      case "after":
        return t("filters.opAfter");
      case "within":
        return t("filters.opWithin");
      default:
        return o;
    }
  };

  const relative = (r: string): string => {
    switch (r) {
      case "overdue":
        return t("filters.relOverdue");
      case "today":
        return t("filters.relToday");
      case "next_7_days":
        return t("filters.relNext7");
      case "last_7_days":
        return t("filters.relLast7");
      case "last_30_days":
        return t("filters.relLast30");
      default:
        return r;
    }
  };

  const value = (f: FilterField, v: string | number): string => {
    if (v === ME) return t("filters.me");
    if (v === NONE_VALUE) return t("filters.notSet");
    switch (f) {
      case "status":
        return lookups.statuses.find((s) => s.id === v)?.name ?? String(v);
      case "priority":
        return lookups.priorities.find((p) => p.id === v)?.name ?? String(v);
      case "type":
        return lookups.issueTypes.find((x) => x.id === v)?.name ?? String(v);
      case "assignee":
      case "reporter": {
        const m = lookups.members.find((u) => u.id === v);
        return m ? fullName(m) : String(v);
      }
      case "label":
        return lookups.labels.find((l) => l.id === v)?.name ?? String(v);
      case "project":
        return lookups.projects.find((p) => p.id === v)?.name ?? String(v);
      case "dueDate":
      case "created":
      case "updated":
        return String(v) === "today"
          ? t("filters.relToday")
          : relative(String(v));
      default:
        return String(v);
    }
  };

  /** "Priority at least High", "Label is empty". */
  const rule = (r: FilterRule): string => {
    if (r.field === "parent") return `${field(r.field)}: ${op(r.field, r.is)}`;
    const head = `${field(r.field)} ${op(r.field, r.is)}`;
    if (r.value === undefined) return head;
    const values = Array.isArray(r.value) ? r.value : [r.value];
    return `${head} ${values.map((v) => value(r.field, v)).join(", ")}`;
  };

  /** A rule or a whole group in one line, nested groups in parentheses:
   *  "Status Todo UND (Label Bug ODER Priority High)". */
  const node = (n: FilterNode): string =>
    isGroup(n)
      ? n.rules
          .map((child) => (isGroup(child) ? `(${node(child)})` : rule(child)))
          .join(` ${n.op === "or" ? t("filters.or") : t("filters.and")} `)
      : rule(n);

  /** One part of a group: a rule, or a group in parentheses. */
  const member = (n: FilterNode): string =>
    isGroup(n) ? `(${node(n)})` : rule(n);

  return { field, op, value, relative, rule, member, node };
}
