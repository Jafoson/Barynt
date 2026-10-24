"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
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
  type FilterGroup,
  type FilterNode,
  type FilterOp,
  type FilterRule,
  type IssueFilter,
  isGroup,
  ME,
  NONE_VALUE,
  rulesIn,
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
import { fromRootBox, rootBox } from "../filterModel";
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
  /** More settings between the conditions and the footer — a widget's
   *  order (BARY-182). */
  extra?: React.ReactNode;
  /** "Cancel" also puts those back. */
  onCancel?: () => void;
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
 * The advanced filter (BARY-166) as boxes. Each box says how its parts
 * combine — UND or ODER, a click switches — and holds conditions and
 * further boxes, as deep as anyone likes. The outermost box is the whole
 * filter. Every change applies at once.
 */
export function FilterEditor({
  filter,
  onChange,
  lookups,
  area,
  onDone,
  inSheet = false,
  extra,
  onCancel,
}: FilterEditorProps) {
  const t = useTranslations();
  const labels = useFilterLabels(lookups);

  const text = filter.rules.filter(
    (n): n is FilterRule => !isGroup(n) && n.field === "text",
  );
  // The editor's own copy — a condition just added has no value yet, a box
  // just added is empty; neither would survive the round trip through the
  // URL.
  const [root, setRoot] = useState<FilterGroup>(() => rootBox(filter));
  const [initial] = useState(filter);

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

  const emit = (next: FilterGroup) => {
    setRoot(next);
    onChange(fromRootBox(next, text));
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

  const card = {
    fields,
    labels,
    options,
    defaultValue,
  };

  const count = rulesIn(root).length;

  return (
    <div className={styles.editor} data-in-sheet={inSheet || undefined}>
      <div className={styles.scroll}>
        <Box
          box={root}
          top
          card={card}
          newRule={newRule}
          keyOf={keyOf}
          inherit={inherit}
          onChange={emit}
        />
      </div>

      {extra && <div className={styles.extra}>{extra}</div>}

      {!inSheet && (
        <div className={styles.footer}>
          <Button
            variant="ghost"
            className={styles.removeAll}
            disabled={count === 0}
            onClick={() => emit({ op: root.op, rules: [] })}
          >
            {t("filters.removeAll")}
          </Button>
          <div className={styles.footerActions}>
            {/* Changes apply at once; "cancel" puts back what was there
                when the editor opened. */}
            <Button
              variant="elevated"
              onClick={() => {
                onChange(initial);
                onCancel?.();
                onDone();
              }}
            >
              {t("actions.cancel")}
            </Button>
            <Button variant="primary" onClick={onDone}>
              {t("filters.done")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

type CardSetup = Pick<
  React.ComponentProps<typeof ConditionCard>,
  "fields" | "labels" | "options" | "defaultValue"
>;

/**
 * One box: a sentence on top that says how its parts combine (a select:
 * "all of these" / "one of these"), the parts — conditions and boxes — and
 * "+ condition" / "+ box" below. A new box is the opposite kind of the one
 * it sits in, since a box of the same kind would add nothing.
 */
function Box({
  box,
  top = false,
  card,
  newRule,
  keyOf,
  inherit,
  onChange,
  onRemove,
}: {
  box: FilterGroup;
  top?: boolean;
  card: CardSetup;
  newRule: () => FilterRule;
  keyOf: (o: object) => string;
  inherit: <T extends object>(from: object, to: T) => T;
  onChange: (next: FilterGroup) => void;
  onRemove?: () => void;
}) {
  const t = useTranslations();
  const set = (rules: FilterNode[]) =>
    onChange(inherit(box, { op: box.op, rules }));
  const replace = (i: number, next: FilterNode) =>
    set(box.rules.map((n, j) => (j === i ? inherit(n, next) : n)));
  const remove = (i: number) => set(box.rules.filter((_, j) => j !== i));

  return (
    <div className={styles.box} data-op={box.op} data-top={top || undefined}>
      <div className={styles.boxHead}>
        <TokenSelect
          label={t("filters.boxMode")}
          tone={box.op === "or" ? "or" : "and"}
          value={box.op}
          items={[
            { value: "and", label: t("filters.boxAll") },
            { value: "or", label: t("filters.boxAny") },
          ]}
          onChange={(op) =>
            onChange(inherit(box, { op: op as "and" | "or", rules: box.rules }))
          }
        />
        {onRemove && (
          <button
            type="button"
            className={styles.remove}
            aria-label={t("filters.removeBox")}
            title={t("filters.removeBox")}
            onClick={onRemove}
          >
            <Icon icon="lucide:x" width={14} />
          </button>
        )}
      </div>

      {box.rules.length === 0 && top && (
        <p className={styles.empty}>{t("filters.empty")}</p>
      )}

      {box.rules.map((node, i) =>
        isGroup(node) ? (
          <Box
            key={keyOf(node)}
            box={node}
            card={card}
            newRule={newRule}
            keyOf={keyOf}
            inherit={inherit}
            onChange={(next) => replace(i, next)}
            onRemove={() => remove(i)}
          />
        ) : (
          <ConditionCard
            key={keyOf(node)}
            rule={node}
            {...card}
            onChange={(next) => replace(i, next)}
            onRemove={() => remove(i)}
          />
        ),
      )}

      <div className={styles.adds}>
        <button
          type="button"
          className={styles.add}
          onClick={() => set([...box.rules, newRule()])}
        >
          <Icon icon="lucide:plus" width={13} />
          {t("filters.addCondition")}
        </button>
        <button
          type="button"
          className={styles.add}
          data-op={box.op === "and" ? "or" : "and"}
          onClick={() =>
            set([
              ...box.rules,
              { op: box.op === "and" ? "or" : "and", rules: [newRule()] },
            ])
          }
        >
          <Icon icon="lucide:plus" width={13} />
          {t("filters.addBox")}
        </button>
      </div>
    </div>
  );
}

// ─── One condition ──────────────────────────────────────────────────────────

/** From this many options on, a picker gets a search field. */
const SEARCH_FROM = 6;

/**
 * A pick that reads as a word of the sentence — "Status ▾ ist nicht ▾" —
 * opening the app's own menu (with a search once the list is long).
 */
function TokenSelect({
  label,
  value,
  items,
  onChange,
  tone,
}: {
  label: string;
  value: string;
  items: ISelectItem[];
  onChange: (value: string) => void;
  tone?: "op" | "not" | "and" | "or";
}) {
  const t = useTranslations();
  const current = items.find((item) => String(item.value) === value);
  return (
    <InlinePicker
      width={220}
      title={label}
      trigger={
        <button
          type="button"
          className={styles.token}
          data-tone={tone}
          aria-label={label}
          aria-haspopup="listbox"
        >
          {current?.icon}
          <span>{current?.label ?? value}</span>
          <Icon icon="lucide:chevron-down" width={12} aria-hidden="true" />
        </button>
      }
    >
      {(close) => (
        <SelectMenu
          items={items}
          value={current?.value ?? null}
          onPick={(v) => {
            if (v !== null) onChange(String(v));
            close();
          }}
          onClose={close}
          searchable={items.length >= SEARCH_FROM}
          placeholder={t("placeholders.search")}
        />
      )}
    </InlinePicker>
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
          title={labels.field(rule.field)}
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
            placeholder={t("placeholders.search")}
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
          .map((o) => ({ ...o, value: String(o.value) }))}
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
