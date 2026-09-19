"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import {
  CARD_FIELD_KEYS,
  type CardFieldKey,
  isCardFieldKey,
} from "@/features/issues/card-fields";
import { GROUP_KEYS, type GroupKey } from "@/features/issues/group";
import { SORT_KEYS, type SortKey } from "@/features/issues/sort";
import {
  type DetailFieldKey,
  visibleDetailFields,
} from "@/features/projects/detail-fields";
import { useRouter } from "@/i18n/navigation";
import styles from "./viewSettings.module.scss";

const FIELD_LABEL_KEY = {
  priority: "fields.priority",
  labels: "fields.labels",
  storyPoints: "fields.storyPoints",
  dueDate: "fields.dueDate",
} as const satisfies Record<CardFieldKey, string>;

const SORT_LABEL_KEY = {
  manual: "sort.manual",
  priority: "sort.priority",
  type: "sort.type",
  status: "sort.status",
  storyPoints: "sort.storyPoints",
  dueDate: "sort.dueDate",
  assignee: "sort.assignee",
  estimate: "sort.estimate",
  title: "sort.title",
  created: "sort.created",
  updated: "sort.updated",
} as const satisfies Record<SortKey, string>;

/** Sort keys that only make sense while the field they sort by is shown. */
const SORT_KEY_FIELD: Partial<Record<SortKey, DetailFieldKey>> = {
  priority: "priority",
  storyPoints: "storyPoints",
  dueDate: "dueDate",
  estimate: "estimateHours",
};

const GROUP_LABEL_KEY = {
  status: "fields.status",
  priority: "fields.priority",
  type: "fields.type",
  assignee: "fields.assignee",
  storyPoints: "fields.storyPoints",
} as const satisfies Record<GroupKey, string>;

/** Group keys that only make sense while the field they group by is shown. */
const GROUP_KEY_FIELD: Partial<Record<GroupKey, DetailFieldKey>> = {
  priority: "priority",
  storyPoints: "storyPoints",
};

interface ViewSettingsProps {
  groupKey: GroupKey;
  onGroupChange: (key: GroupKey) => void;
  /** Fields the project (or, across projects, every project) hides. */
  projectHiddenFields: string[];
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  hiddenFields: string[];
  onDisplayChange: (
    hidden: string[],
  ) => Promise<{ ok: true } | { error: string }>;
}

/**
 * "Ordering" + "Display properties" in one panel (BARY-32/33/34) — one icon
 * button on Board and List alike, instead of a separate sort picker and
 * display picker. Ordering still lives in the URL (`?sort=`, `useTopbar`);
 * display properties are the per-user, per-project, per-view DB preference
 * (BARY-33). Different storage, same panel — from here that distinction
 * doesn't matter to the person using it.
 */
export function ViewSettings({
  groupKey,
  onGroupChange,
  projectHiddenFields,
  sortKey,
  onSortChange,
  hiddenFields,
  onDisplayChange,
}: ViewSettingsProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(
    () => new Set(hiddenFields.filter(isCardFieldKey)),
  );

  const projectVisible = visibleDetailFields(projectHiddenFields);
  const availableSortKeys = SORT_KEYS.filter((key) => {
    const field = SORT_KEY_FIELD[key];
    if (!field || !projectVisible.has(field)) return !field;
    return !(isCardFieldKey(field) && hidden.has(field));
  });
  const availableGroupKeys = GROUP_KEYS.filter((key) => {
    const field = GROUP_KEY_FIELD[key];
    if (!field) return true;
    return (
      projectVisible.has(field) && !(isCardFieldKey(field) && hidden.has(field))
    );
  });
  const activeGroupKey = availableGroupKeys.includes(groupKey)
    ? groupKey
    : "status";
  const activeSortKey = availableSortKeys.includes(sortKey)
    ? sortKey
    : "manual";

  const save = (next: Set<CardFieldKey>) => {
    setHidden(next);
    startTransition(async () => {
      await onDisplayChange([...next]);
      router.refresh();
    });
  };

  const toggleField = (key: CardFieldKey) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    if (next.has(key) && SORT_KEY_FIELD[sortKey] === key)
      onSortChange("manual");
    onGroupChange("status");
    save(next);
  };

  const reset = () => {
    onSortChange("manual");
    onGroupChange("status");
    save(new Set());
  };

  return (
    <InlinePicker
      width={260}
      trigger={
        <Chip
          type="filter"
          variant="text"
          icon={<Icon icon="lucide:sliders-horizontal" width={14} />}
          disabled={isPending}
        >
          {t("display.label")}
        </Chip>
      }
    >
      {() => (
        <div className={styles.panel}>
          <label className={styles.row} htmlFor="view-settings-grouping">
            <span className={styles.rowLabel}>{t("display.grouping")}</span>
            <select
              id="view-settings-grouping"
              className={styles.select}
              value={activeGroupKey}
              onChange={(e) => onGroupChange(e.target.value as GroupKey)}
            >
              {availableGroupKeys.map((key) => (
                <option key={key} value={key}>
                  {t(GROUP_LABEL_KEY[key])}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.row} htmlFor="view-settings-ordering">
            <span className={styles.rowLabel}>{t("display.ordering")}</span>
            <select
              id="view-settings-ordering"
              className={styles.select}
              value={activeSortKey}
              onChange={(e) => onSortChange(e.target.value as SortKey)}
            >
              {availableSortKeys.map((key) => (
                <option key={key} value={key}>
                  {t(SORT_LABEL_KEY[key])}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.section}>
            <span className={styles.sectionTitle}>
              {t("display.fieldsTitle")}
            </span>
            <div className={styles.chips}>
              {CARD_FIELD_KEYS.map((key) => (
                <Chip
                  key={key}
                  type="filter"
                  variant="text"
                  selected={!hidden.has(key)}
                  onClick={() => toggleField(key)}
                >
                  {t(FIELD_LABEL_KEY[key])}
                </Chip>
              ))}
            </div>
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.linkBtn} onClick={reset}>
              {t("display.reset")}
            </button>
          </div>
        </div>
      )}
    </InlinePicker>
  );
}
