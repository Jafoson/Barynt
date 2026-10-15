"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Fragment, useRef, useState } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Button } from "@/components/ui/atoms/Button/Button";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
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
import { fromAlternatives, toAlternatives } from "../filterModel";
import styles from "./filterEditor.module.scss";

interface FilterEditorProps {
  /** The current filter, ids — search text included, which stays as is. */
  filter: IssueFilter;
  onChange: (next: IssueFilter) => void;
  lookups: FilterLabelLookups;
  /** "my": across projects, so project is a field too. */
  area: "project" | "my";
  onDone: () => void;
  /** Inside the phone's filter sheet: no footer — "remove all" sits in the
   *  sheet's bar and its back button is "done" — and touch-sized controls. */
  inSheet?: boolean;
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
 * The advanced filter (BARY-166): one list of conditions — field, operator,
 * values — with a switch between every two: UND or ODER. UND binds tighter,
 * so what's joined by UND belongs together and an ODER starts the next
 * alternative: "(me UND overdue) ODER urgent". With more than one
 * alternative each gets a bar of its own color along its side. Every
 * change applies at once.
 */
export function FilterEditor({
  filter,
  onChange,
  lookups,
  area,
  onDone,
  inSheet = false,
}: FilterEditorProps) {
  const t = useTranslations();
  const labels = useFilterLabels(lookups);

  const text = filter.rules.filter(
    (n): n is FilterRule => !isGroup(n) && n.field === "text",
  );
  // The editor's own copy — a condition just added has no value yet and
  // wouldn't survive the round trip through the URL.
  const [alts, setAlts] = useState<FilterRule[][]>(() =>
    toAlternatives(filter),
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

  const emit = (next: FilterRule[][]) => {
    const kept = next.filter((alt) => alt.length > 0);
    setAlts(kept);
    onChange(fromAlternatives(kept, text));
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

  // ── Editing the list ──

  const setRule = (a: number, r: number, next: FilterRule) =>
    emit(
      alts.map((alt, i) =>
        i === a
          ? alt.map((rule, j) => (j === r ? inherit(rule, next) : rule))
          : alt,
      ),
    );

  const removeRule = (a: number, r: number) =>
    emit(alts.map((alt, i) => (i === a ? alt.filter((_, j) => j !== r) : alt)));

  /** The switch after rule `r` of alternative `a`: ODER splits the
   *  alternative there, UND (on its last rule) joins it with the next. */
  const setLink = (a: number, r: number, or: boolean) => {
    const alt = alts[a];
    const last = r === alt.length - 1;
    if (or && !last)
      emit([
        ...alts.slice(0, a),
        alt.slice(0, r + 1),
        alt.slice(r + 1),
        ...alts.slice(a + 1),
      ]);
    else if (!or && last && a + 1 < alts.length)
      emit([
        ...alts.slice(0, a),
        [...alt, ...alts[a + 1]],
        ...alts.slice(a + 2),
      ]);
  };

  const addRule = () =>
    emit(
      alts.length
        ? [...alts.slice(0, -1), [...alts[alts.length - 1], newRule()]]
        : [[newRule()]],
    );

  const count = alts.reduce((n, alt) => n + alt.length, 0);

  return (
    <div className={styles.editor} data-sheet={inSheet || undefined}>
      {count > 1 && <p className={styles.hint}>{t("filters.linkHint")}</p>}

      {count === 0 ? (
        <p className={styles.empty}>{t("filters.empty")}</p>
      ) : (
        <div className={styles.list}>
          {alts.map((alt, a) => (
            <Fragment key={keyOf(alt[0])}>
              {a > 0 && (
                <LinkSwitch
                  or
                  onChange={(or) => setLink(a - 1, alts[a - 1].length - 1, or)}
                />
              )}
              <div
                className={styles.alternative}
                data-bar={alts.length > 1 ? a % 2 : undefined}
              >
                {alt.map((rule, r) => (
                  <Fragment key={keyOf(rule)}>
                    {r > 0 && (
                      <LinkSwitch
                        or={false}
                        onChange={(or) => setLink(a, r - 1, or)}
                      />
                    )}
                    <ConditionCard
                      rule={rule}
                      fields={fields}
                      labels={labels}
                      options={options}
                      defaultValue={defaultValue}
                      onChange={(next) => setRule(a, r, next)}
                      onRemove={() => removeRule(a, r)}
                    />
                  </Fragment>
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      )}

      <button type="button" className={styles.add} onClick={addRule}>
        <Icon icon="lucide:plus" width={13} />
        {t("filters.addCondition")}
      </button>

      {!inSheet && (
        <div className={styles.footer}>
          <Button
            variant="ghost"
            size="sm"
            className={styles.removeAll}
            disabled={count === 0}
            onClick={() => emit([])}
          >
            {t("filters.removeAll")}
          </Button>
          <Button variant="primary" size="sm" onClick={onDone}>
            {t("filters.done")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** UND | ODER between two conditions. */
function LinkSwitch({
  or,
  onChange,
}: {
  or: boolean;
  onChange: (or: boolean) => void;
}) {
  const t = useTranslations();
  return (
    <fieldset className={styles.link} aria-label={t("filters.link")}>
      <button
        type="button"
        aria-pressed={!or}
        data-kind="and"
        onClick={() => onChange(false)}
      >
        {t("filters.and")}
      </button>
      <button
        type="button"
        aria-pressed={or}
        data-kind="or"
        onClick={() => onChange(true)}
      >
        {t("filters.or")}
      </button>
    </fieldset>
  );
}

// ─── One condition ──────────────────────────────────────────────────────────

/** A select that reads as a word of the sentence — "Status ▾ ist nicht ▾". */
function TokenSelect({
  label,
  value,
  items,
  onChange,
  tone,
}: {
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
  tone?: "op" | "not";
}) {
  return (
    <span className={styles.token} data-tone={tone}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <Icon icon="lucide:chevron-down" width={12} aria-hidden="true" />
    </span>
  );
}

function ConditionCard({
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

  let value: React.ReactNode = null;
  if (rule.field === "parent" || needsNoValue(rule.is)) {
    value = null;
  } else if (isList(rule.is)) {
    const selected = Array.isArray(rule.value) ? rule.value : [];
    const items = options(rule.field);
    const toggle = (v: string | number) =>
      onChange(
        make(
          rule.field,
          rule.is,
          selected.includes(v)
            ? selected.filter((x) => x !== v)
            : [...selected, v],
        ),
      );
    value = (
      <>
        {selected.map((v) => {
          const item = items.find((o) => o.value === v);
          const name = labels.value(rule.field, v);
          return (
            <span key={String(v)} className={styles.chip}>
              {item?.icon}
              <span>{name}</span>
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={t("filters.removeValue", { value: name })}
                onClick={() => toggle(v)}
              >
                <Icon icon="lucide:x" width={12} />
              </button>
            </span>
          );
        })}
        <InlinePicker
          width={260}
          trigger={
            <button type="button" className={styles.addValue}>
              <Icon icon="lucide:plus" width={13} />
              {selected.length === 0 && t("filters.pickValue")}
            </button>
          }
        >
          <SelectMenu
            items={items}
            value={selected}
            onPick={(v) => v !== null && toggle(v)}
            multi
            searchable
          />
        </InlinePicker>
      </>
    );
  } else if (rule.is === "gte" || rule.is === "lte") {
    value = (
      <TokenSelect
        label={t("filters.value")}
        value={String(rule.value ?? "")}
        items={options(rule.field)
          .filter((o) => o.value !== ME && o.value !== NONE_VALUE)
          .map((o) => ({ value: String(o.value), label: o.label }))}
        onChange={(v) => onChange(make(rule.field, rule.is, Number(v)))}
      />
    );
  } else if (rule.is === "within") {
    value = (
      <TokenSelect
        label={t("filters.value")}
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
    <div className={styles.card}>
      <div className={styles.head}>
        <TokenSelect
          label={t("filters.field")}
          value={rule.field}
          items={fields.map((f) => ({ value: f, label: labels.field(f) }))}
          onChange={(v) => setField(v as FilterField)}
        />
        <TokenSelect
          label={t("filters.operator")}
          tone={rule.is === "none" ? "not" : "op"}
          value={rule.is}
          items={ops.map((o) => ({
            value: o,
            label: labels.op(rule.field, o),
          }))}
          onChange={(v) => setOp(v as FilterOp)}
        />
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
      {value && <div className={styles.values}>{value}</div>}
    </div>
  );
}
