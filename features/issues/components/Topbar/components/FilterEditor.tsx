"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Button } from "@/components/ui/atoms/Button/Button";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { NativeSelect } from "@/components/ui/atoms/NativeSelect/NativeSelect";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import {
  type ISelectItem,
  SelectMenu,
} from "@/components/ui/atoms/SelectMenu/SelectMenu";
import {
  LabelIcon,
  PriorityIcon,
  StatusIcon,
  TypeIcon,
} from "@/features/issues/components/IssueIcons/IssueIcons";
import {
  type FilterField,
  type FilterGroup,
  type FilterOp,
  type FilterRule,
  type IssueFilter,
  isGroup,
  ME,
  NONE_VALUE,
} from "@/features/issues/filter";
import { STORY_POINTS_OPTIONS } from "@/features/issues/story-points";
import { randomId } from "@/lib/utils/id";
import { fullName } from "@/lib/utils/string";
import {
  EDITOR_FIELDS,
  EDITOR_OPS,
  type FilterLabelLookups,
  RELATIVE_OPTIONS,
  useFilterLabels,
} from "../filterLabels";
import styles from "./filterEditor.module.scss";

type Node = FilterRule | FilterGroup;

interface FilterEditorProps {
  /** The current filter, ids — search text included, which stays as is. */
  filter: IssueFilter;
  onChange: (next: IssueFilter) => void;
  lookups: FilterLabelLookups;
  /** "my": across projects, so project is a field too. */
  area: "project" | "my";
  onDone: () => void;
}

const isList = (is: FilterOp) => is === "any" || is === "none" || is === "all";
const needsNoValue = (is: FilterOp) => is === "empty" || is === "notEmpty";
const isDateField = (f: FilterField) =>
  f === "dueDate" || f === "created" || f === "updated";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** What "within" offers per date field — the future only for due dates. */
const relativeFor = (field: FilterField) =>
  field === "dueDate"
    ? RELATIVE_OPTIONS
    : RELATIVE_OPTIONS.filter((r) => r !== "overdue" && r !== "next_7_days");

/**
 * The advanced filter (BARY-166): the whole tree as conditions — field,
 * operator, value — with one sentence on top saying how they combine ("all"
 * or "at least one"), UND/ODER plaques between them, and groups ("one of
 * these is enough") only for mixing both. Every change applies at once.
 */
export function FilterEditor({
  filter,
  onChange,
  lookups,
  area,
  onDone,
}: FilterEditorProps) {
  const t = useTranslations();
  const labels = useFilterLabels(lookups);

  const text = filter.rules.filter((n) => !isGroup(n) && n.field === "text");
  // The editor's own copy — a condition just added has no value yet and
  // wouldn't survive the round trip through the URL.
  const [nodes, setNodes] = useState<Node[]>(() =>
    filter.rules.filter((n) => isGroup(n) || n.field !== "text"),
  );
  const [anyMode, setAnyMode] = useState(
    () => nodes.length === 1 && isGroup(nodes[0]),
  );

  // Stable keys across edits: a replaced rule inherits its predecessor's
  // key, so an open value menu stays open while its rule changes.
  const ids = useRef(new WeakMap<object, string>());
  const keyOf = (o: object) => {
    let id = ids.current.get(o);
    if (!id) {
      id = randomId();
      ids.current.set(o, id);
    }
    return id;
  };
  const inherit = <T extends object>(from: object, to: T): T => {
    ids.current.set(to, keyOf(from));
    return to;
  };

  const emit = (next: Node[]) => {
    setNodes(next);
    onChange({ op: "and", rules: [...next, ...text] });
  };

  const fields = EDITOR_FIELDS.filter((f) => f !== "project" || area === "my");

  const options = (field: FilterField): ISelectItem[] => {
    switch (field) {
      case "status":
        return lookups.statuses.map((s) => ({
          value: s.id,
          label: s.name,
          icon: <StatusIcon status={s.id} size={15} color={s.color} />,
        }));
      case "priority":
        return [...lookups.priorities]
          .sort((a, b) => b.id - a.id)
          .map((p) => ({
            value: p.id,
            label: p.name,
            icon: <PriorityIcon priority={p.id} size={15} />,
          }));
      case "type":
        return lookups.issueTypes.map((x) => ({
          value: x.id,
          label: x.name,
          icon: <TypeIcon type={x.id} size={15} color={x.color} />,
        }));
      case "assignee":
      case "reporter":
        return [
          {
            value: ME,
            label: t("filters.me"),
            hint: t("filters.meHint"),
            icon: <Icon icon="lucide:user-round" width={18} />,
          },
          ...(field === "assignee"
            ? [
                {
                  value: NONE_VALUE,
                  label: t("fields.unassigned"),
                  icon: <Icon icon="lucide:user-x" width={18} />,
                },
              ]
            : []),
          ...lookups.members.map((u) => ({
            value: u.id,
            label: fullName(u),
            icon: <Avatar avatar={u} size={20} />,
          })),
        ];
      case "label":
        return [
          { value: NONE_VALUE, label: t("filters.notSet") },
          ...lookups.labels.map((l) => ({
            value: l.id,
            label: l.name,
            icon: <LabelIcon color={l.color} size={13} />,
          })),
        ];
      case "project":
        return lookups.projects.map((p) => ({
          value: p.id,
          label: p.name,
          icon: <LabelIcon color={p.color} size={13} />,
        }));
      case "storyPoints":
        return [
          ...STORY_POINTS_OPTIONS.map((n) => ({ value: n, label: String(n) })),
          { value: NONE_VALUE, label: t("filters.notSet") },
        ];
      default:
        return [];
    }
  };

  /** A sensible value for `field` with `is` — what a new row starts with. */
  const defaultValue = (field: FilterField, is: FilterOp) => {
    if (needsNoValue(is)) return undefined;
    if (isList(is)) return [] as (string | number)[];
    if (is === "within") return relativeFor(field)[0];
    if (is === "before" || is === "after") return todayIso();
    // gte / lte: the first plain option (High for priority).
    const first = options(field).find(
      (o) => o.value !== ME && o.value !== NONE_VALUE,
    );
    if (field === "priority")
      return (
        lookups.priorities.find((p) => p.key === "high")?.id ??
        (first?.value as number)
      );
    return first?.value as number;
  };

  const newRule = (field: FilterField = "status"): FilterRule => {
    const is = EDITOR_OPS[field]?.[0] ?? "any";
    const value = defaultValue(field, is);
    return value === undefined ? { field, is } : { field, is, value };
  };

  // ── Reading and writing what's shown ──

  const anyRules: FilterRule[] =
    anyMode && nodes[0] && isGroup(nodes[0]) ? nodes[0].rules : [];
  const hasGroups = nodes.some(isGroup);

  const setAnyRules = (rules: FilterRule[]) =>
    emit(
      rules.length
        ? [
            nodes[0] && isGroup(nodes[0])
              ? inherit(nodes[0], { op: "or" as const, rules })
              : { op: "or" as const, rules },
          ]
        : [],
    );

  const switchMode = (toAny: boolean) => {
    if (toAny === anyMode) return;
    setAnyMode(toAny);
    if (toAny) {
      const rules = nodes.filter((n): n is FilterRule => !isGroup(n));
      emit(rules.length ? [{ op: "or", rules }] : []);
    } else emit(anyRules);
  };

  const ruleRow = (
    rule: FilterRule,
    onRule: (next: FilterRule) => void,
    onRemove: () => void,
  ) => (
    <ConditionRow
      rule={rule}
      fields={fields}
      labels={labels}
      options={options}
      defaultValue={defaultValue}
      onChange={onRule}
      onRemove={onRemove}
    />
  );

  const Link = ({ kind }: { kind: "and" | "or" }) => (
    <div className={styles.link}>
      <span className={styles.pill} data-kind={kind}>
        {kind === "and" ? t("filters.and") : t("filters.or")}
      </span>
    </div>
  );

  return (
    <div className={styles.editor}>
      <div className={styles.mode}>
        <span>{t("filters.modeIntro")}</span>
        <SegmentedControl
          variant="surface"
          value={anyMode ? "any" : "all"}
          onChange={(v) => switchMode(v === "any")}
          items={[
            { value: "all", label: t("filters.modeAll") },
            { value: "any", label: t("filters.modeAny") },
          ]}
        />
        <span>{t("filters.modeOutro")}</span>
      </div>
      {!anyMode && hasGroups && (
        <p className={styles.hint}>{t("filters.modeGroupsHint")}</p>
      )}

      <div className={styles.list}>
        {anyMode ? (
          anyRules.length === 0 ? (
            <p className={styles.empty}>{t("filters.empty")}</p>
          ) : (
            anyRules.map((rule, i) => (
              <div key={keyOf(rule)}>
                {i > 0 && <Link kind="or" />}
                {ruleRow(
                  rule,
                  (next) =>
                    setAnyRules(
                      anyRules.map((r, j) => (j === i ? inherit(r, next) : r)),
                    ),
                  () => setAnyRules(anyRules.filter((_, j) => j !== i)),
                )}
              </div>
            ))
          )
        ) : nodes.length === 0 ? (
          <p className={styles.empty}>{t("filters.empty")}</p>
        ) : (
          nodes.map((node, i) => (
            <div key={keyOf(node)}>
              {i > 0 && <Link kind="and" />}
              {isGroup(node) ? (
                <div className={styles.group}>
                  <div className={styles.groupHead}>
                    {t("filters.groupTitle")}
                  </div>
                  {node.rules.map((rule, j) => (
                    <div key={keyOf(rule)}>
                      {j > 0 && <Link kind="or" />}
                      {ruleRow(
                        rule,
                        (next) =>
                          emit(
                            nodes.map((n, k) =>
                              k === i
                                ? inherit(node, {
                                    op: "or" as const,
                                    rules: node.rules.map((r, m) =>
                                      m === j ? inherit(r, next) : r,
                                    ),
                                  })
                                : n,
                            ),
                          ),
                        () => {
                          const rest = node.rules.filter((_, m) => m !== j);
                          emit(
                            rest.length
                              ? nodes.map((n, k) =>
                                  k === i
                                    ? inherit(node, {
                                        op: "or" as const,
                                        rules: rest,
                                      })
                                    : n,
                                )
                              : nodes.filter((_, k) => k !== i),
                          );
                        },
                      )}
                    </div>
                  ))}
                  <div className={styles.adds}>
                    <button
                      type="button"
                      className={styles.add}
                      data-kind="or"
                      onClick={() =>
                        emit(
                          nodes.map((n, k) =>
                            k === i
                              ? inherit(node, {
                                  op: "or" as const,
                                  rules: [...node.rules, newRule()],
                                })
                              : n,
                          ),
                        )
                      }
                    >
                      <Icon icon="lucide:plus" width={13} />
                      {t("filters.addAlternative")}
                    </button>
                  </div>
                </div>
              ) : (
                ruleRow(
                  node,
                  (next) =>
                    emit(nodes.map((n, k) => (k === i ? inherit(n, next) : n))),
                  () => emit(nodes.filter((_, k) => k !== i)),
                )
              )}
            </div>
          ))
        )}
      </div>

      <div className={styles.adds}>
        <button
          type="button"
          className={styles.add}
          onClick={() =>
            anyMode
              ? setAnyRules([...anyRules, newRule()])
              : emit([...nodes, newRule()])
          }
        >
          <Icon icon="lucide:plus" width={13} />
          {t("filters.addCondition")}
        </button>
        {!anyMode && (
          <button
            type="button"
            className={styles.add}
            data-kind="or"
            onClick={() =>
              emit([...nodes, { op: "or", rules: [newRule("priority")] }])
            }
          >
            <Icon icon="lucide:plus" width={13} />
            {t("filters.addGroup")}
          </button>
        )}
      </div>

      <div className={styles.footer}>
        <Button
          variant="ghost"
          size="sm"
          className={styles.removeAll}
          disabled={nodes.length === 0}
          onClick={() => emit([])}
        >
          {t("filters.removeAll")}
        </Button>
        <Button variant="primary" size="sm" onClick={onDone}>
          {t("filters.done")}
        </Button>
      </div>
    </div>
  );
}

// ─── One condition ──────────────────────────────────────────────────────────

function ConditionRow({
  rule,
  fields,
  labels,
  options,
  defaultValue,
  onChange,
  onRemove,
}: {
  rule: FilterRule;
  fields: FilterField[];
  labels: ReturnType<typeof useFilterLabels>;
  options: (field: FilterField) => ISelectItem[];
  defaultValue: (
    field: FilterField,
    is: FilterOp,
  ) => FilterRule["value"] | undefined;
  onChange: (next: FilterRule) => void;
  onRemove: () => void;
}) {
  const t = useTranslations();
  const ops = EDITOR_OPS[rule.field] ?? [rule.is];

  const make = (
    field: FilterField,
    is: FilterOp,
    value?: FilterRule["value"],
  ) => (value === undefined ? { field, is } : { field, is, value });

  const setField = (field: FilterField) => {
    const is = EDITOR_OPS[field]?.[0] ?? "any";
    onChange(make(field, is, defaultValue(field, is)));
  };

  const setOp = (is: FilterOp) => {
    // A list stays a list ("is" ↔ "is not"); otherwise start fresh.
    const keep = isList(is) && isList(rule.is) ? rule.value : undefined;
    onChange(make(rule.field, is, keep ?? defaultValue(rule.field, is)));
  };

  let value: React.ReactNode = <span />;
  if (rule.field === "parent" || needsNoValue(rule.is)) {
    value = <span />;
  } else if (isList(rule.is)) {
    const selected = Array.isArray(rule.value) ? rule.value : [];
    const summary = selected.map((v) => labels.value(rule.field, v)).join(", ");
    value = (
      <InlinePicker
        width={260}
        trigger={
          <button type="button" className={styles.select}>
            <span className={summary ? undefined : styles.placeholder}>
              {summary || t("filters.choose")}
            </span>
            <Icon icon="lucide:chevron-down" width={13} />
          </button>
        }
      >
        <SelectMenu
          items={options(rule.field)}
          value={selected}
          onPick={(v) => {
            if (v === null) return;
            const next = selected.includes(v)
              ? selected.filter((x) => x !== v)
              : [...selected, v];
            onChange(make(rule.field, rule.is, next));
          }}
          multi
          searchable
        />
      </InlinePicker>
    );
  } else if (rule.is === "gte" || rule.is === "lte") {
    value = (
      <NativeSelect
        label={t("filters.value")}
        className={styles.native}
        value={String(rule.value ?? "")}
        items={options(rule.field)
          .filter((o) => o.value !== ME && o.value !== NONE_VALUE)
          .map((o) => ({ value: String(o.value), label: o.label }))}
        onChange={(v) => onChange(make(rule.field, rule.is, Number(v)))}
      />
    );
  } else if (rule.is === "within") {
    value = (
      <NativeSelect
        label={t("filters.value")}
        className={styles.native}
        value={String(rule.value ?? "")}
        items={(isDateField(rule.field)
          ? relativeFor(rule.field)
          : RELATIVE_OPTIONS
        ).map((r) => ({ value: r, label: labels.relative(r) }))}
        onChange={(v) => onChange(make(rule.field, rule.is, v))}
      />
    );
  } else if (rule.is === "before" || rule.is === "after") {
    value = (
      <input
        type="date"
        aria-label={t("filters.date")}
        className={styles.date}
        value={String(rule.value ?? "")}
        onChange={(e) =>
          e.target.value && onChange(make(rule.field, rule.is, e.target.value))
        }
      />
    );
  }

  return (
    <div className={styles.condition}>
      <NativeSelect
        label={t("filters.field")}
        className={styles.native}
        value={rule.field}
        items={fields.map((f) => ({ value: f, label: labels.field(f) }))}
        onChange={(v) => setField(v as FilterField)}
      />
      <NativeSelect
        label={t("filters.operator")}
        className={styles.native}
        value={rule.is}
        items={ops.map((o) => ({ value: o, label: labels.op(rule.field, o) }))}
        onChange={(v) => setOp(v as FilterOp)}
      />
      <div className={styles.value}>{value}</div>
      <button
        type="button"
        className={styles.remove}
        aria-label={t("filters.removeCondition")}
        title={t("filters.removeCondition")}
        onClick={onRemove}
      >
        <Icon icon="lucide:x" width={14} />
      </button>
    </div>
  );
}
