"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import type { ViewGroupsPatch } from "@/features/issues/actions";
import {
  CARD_FIELD_KEYS,
  type CardFieldKey,
  isCardFieldKey,
} from "@/features/issues/card-fields";
import { GroupIcon } from "@/features/issues/components/GroupIcon/GroupIcon";
import {
  GROUP_KEYS,
  type GroupDef,
  type GroupKey,
  type GroupLookups,
  groupDefs,
} from "@/features/issues/group";
import {
  type GroupView,
  isGroupHidden,
  toggleGroupHidden,
} from "@/features/issues/hidden-groups";
import { SORT_KEYS, type SortKey } from "@/features/issues/sort";
import {
  type DetailFieldKey,
  visibleDetailFields,
} from "@/features/projects/detail-fields";
import { useRouter } from "@/i18n/navigation";
import { useModal } from "@/lib/context";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import { FilterOptions } from "./FilterPopup";
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

/** What can be grouped / ordered by right now — depends on the shown fields. */
function availableKeys(
  projectHiddenFields: string[],
  hidden: Set<CardFieldKey>,
) {
  const projectVisible = visibleDetailFields(projectHiddenFields);
  const sortKeys = SORT_KEYS.filter((key) => {
    const field = SORT_KEY_FIELD[key];
    if (!field || !projectVisible.has(field)) return !field;
    return !(isCardFieldKey(field) && hidden.has(field));
  });
  const groupKeys = GROUP_KEYS.filter((key) => {
    const field = GROUP_KEY_FIELD[key];
    if (!field) return true;
    return (
      projectVisible.has(field) && !(isCardFieldKey(field) && hidden.has(field))
    );
  });
  return { sortKeys, groupKeys };
}

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
  /** Lookups for the groups of the active grouping, to list them (BARY-47). */
  groupLookups: GroupLookups;
  /** Board or list — the defaults for which groups show differ. */
  view: GroupView;
  /** Groups this person hid in this view, as `hidden-groups.ts` entries. */
  hiddenGroups: string[];
  /** Empty groups hide themselves (BARY-47). */
  hideEmptyGroups: boolean;
  onGroupsChange: (
    patch: ViewGroupsPatch,
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
  groupLookups,
  view,
  hiddenGroups,
  hideEmptyGroups,
  onGroupsChange,
}: ViewSettingsProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(
    () => new Set(hiddenFields.filter(isCardFieldKey)),
  );

  const { sortKeys: availableSortKeys, groupKeys: availableGroupKeys } =
    availableKeys(projectHiddenFields, hidden);
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

  const [hiddenGroupList, setHiddenGroupList] = useState(hiddenGroups);

  const [hideEmpty, setHideEmpty] = useState(hideEmptyGroups);

  const saveGroups = (patch: ViewGroupsPatch) => {
    if (patch.hiddenGroups) setHiddenGroupList(patch.hiddenGroups);
    if (patch.hideEmptyGroups !== undefined)
      setHideEmpty(patch.hideEmptyGroups);
    startTransition(async () => {
      await onGroupsChange(patch);
      router.refresh();
    });
  };

  /** Shows or hides one group of the active grouping (BARY-47). */
  const toggleGroup = (group: GroupDef) =>
    saveGroups({
      hiddenGroups: toggleGroupHidden(hiddenGroupList, group, view),
    });

  const toggleHideEmpty = () => saveGroups({ hideEmptyGroups: !hideEmpty });

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
    if (hiddenGroupList.length > 0 || hideEmpty)
      saveGroups({ hiddenGroups: [], hideEmptyGroups: false });
  };

  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [facet, setFacet] = useState<DisplayFacet | null>(null);

  // The sheet lives in the modal layer, outside this component's tree, so
  // what it was opened with goes stale. It reads the latest values through
  // this ref, and changes things through the functions above.
  const latest = useRef<SheetSource>({
    groupKey: activeGroupKey,
    sortKey: activeSortKey,
    hidden,
    projectHiddenFields,
    groupLookups,
    view,
    hiddenGroups: hiddenGroupList,
    hideEmptyGroups: hideEmpty,
    toggleGroup,
    toggleHideEmpty,
    setGroup: onGroupChange,
    setSort: onSortChange,
    toggleField,
    reset,
  });
  latest.current = {
    groupKey: activeGroupKey,
    sortKey: activeSortKey,
    hidden,
    projectHiddenFields,
    groupLookups,
    view,
    hiddenGroups: hiddenGroupList,
    hideEmptyGroups: hideEmpty,
    toggleGroup,
    toggleHideEmpty,
    setGroup: onGroupChange,
    setSort: onSortChange,
    toggleField,
    reset,
  };

  const trigger = (
    <Chip
      type="filter"
      variant="text"
      icon={<Icon icon="lucide:sliders-horizontal" width={14} />}
      disabled={isPending}
      onClick={
        isPhone
          ? () =>
              openModal(
                ({ close }) => <ViewSheet latest={latest} close={close} />,
                { placement: "bottom", label: t("display.label") },
              )
          : undefined
      }
    >
      {t("display.label")}
    </Chip>
  );

  // Phone: a bottom sheet instead of a dropdown.
  if (isPhone) return trigger;

  // Tablet and desktop: rows with their values in a list, like the filters'
  // popup.
  return (
    <InlinePicker
      width={320}
      trigger={trigger}
      // Next time it opens, it starts at the rows again.
      onOpenChange={(open) => !open && setFacet(null)}
    >
      {() => (
        <div className={`${styles.panel} ${styles.scrolling}`}>
          <DisplayPanel
            state={{
              groupKey: activeGroupKey,
              sortKey: activeSortKey,
              hidden,
              projectHiddenFields,
              groupLookups,
              view,
              hiddenGroups: hiddenGroupList,
              hideEmptyGroups: hideEmpty,
            }}
            onGroup={onGroupChange}
            onSort={onSortChange}
            onToggleField={toggleField}
            onToggleGroup={toggleGroup}
            onToggleHideEmpty={toggleHideEmpty}
            onReset={reset}
            facet={facet}
            onFacetChange={setFacet}
            showBack
          />
        </div>
      )}
    </InlinePicker>
  );
}

/** What the sheet reads and does — kept current through a ref. */
interface SheetSource {
  groupKey: GroupKey;
  sortKey: SortKey;
  hidden: Set<CardFieldKey>;
  projectHiddenFields: string[];
  groupLookups: GroupLookups;
  view: GroupView;
  hiddenGroups: string[];
  hideEmptyGroups: boolean;
  toggleGroup: (group: GroupDef) => void;
  toggleHideEmpty: () => void;
  setGroup: (key: GroupKey) => void;
  setSort: (key: SortKey) => void;
  toggleField: (key: CardFieldKey) => void;
  reset: () => void;
}

type DisplayFacet = "group" | "sort" | "groups";

export interface DisplayState {
  groupKey: GroupKey;
  sortKey: SortKey;
  hidden: Set<CardFieldKey>;
  projectHiddenFields: string[];
  groupLookups: GroupLookups;
  view: GroupView;
  hiddenGroups: string[];
  hideEmptyGroups: boolean;
}

/**
 * The phone's version of the "Display" panel: a bottom sheet with the same
 * rows. It keeps its own copy of the values, so a pick shows up at once
 * while the URL and the saved preference catch up behind it.
 */
function ViewSheet({
  latest,
  close,
}: {
  latest: React.RefObject<SheetSource>;
  close: () => void;
}) {
  const t = useTranslations();
  const [groupKey, setGroupKey] = useState(latest.current.groupKey);
  const [sortKey, setSortKey] = useState(latest.current.sortKey);
  const [hidden, setHidden] = useState(latest.current.hidden);
  const [hiddenGroups, setHiddenGroups] = useState(latest.current.hiddenGroups);
  const [hideEmpty, setHideEmpty] = useState(latest.current.hideEmptyGroups);
  const [facet, setFacet] = useState<DisplayFacet | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  const state: DisplayState = {
    groupKey,
    sortKey,
    hidden,
    projectHiddenFields: latest.current.projectHiddenFields,
    groupLookups: latest.current.groupLookups,
    view: latest.current.view,
    hiddenGroups,
    hideEmptyGroups: hideEmpty,
  };
  const facetTitle =
    facet === "group"
      ? t("display.grouping")
      : facet === "sort"
        ? t("display.ordering")
        : facet === "groups"
          ? t("display.groupsTitle")
          : null;
  const resetToDefaults = () => {
    setGroupKey("status");
    setSortKey("manual");
    setHidden(new Set());
    setHiddenGroups([]);
    setHideEmpty(false);
    latest.current.reset();
  };

  return (
    <Modal variant="sheet" style={swipe.style} {...swipe.handlers}>
      <SheetHeader
        title={facetTitle ?? t("display.label")}
        onBack={facet ? () => setFacet(null) : undefined}
        backLabel={t("filters.back")}
        action={
          facet
            ? undefined
            : { label: t("display.reset"), onClick: resetToDefaults }
        }
        onClose={close}
        closeLabel={t("actions.close")}
      />
      <ModalBody ref={bodyRef} className={styles.sheetBody}>
        <div className={styles.panel}>
          <DisplayPanel
            state={state}
            onGroup={(key) => {
              setGroupKey(key);
              latest.current.setGroup(key);
            }}
            onSort={(key) => {
              setSortKey(key);
              latest.current.setSort(key);
            }}
            onToggleField={(key) => {
              const next = new Set(hidden);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              // Same side effects as the panel's own toggle.
              if (next.has(key) && SORT_KEY_FIELD[sortKey] === key)
                setSortKey("manual");
              setGroupKey("status");
              setHidden(next);
              latest.current.toggleField(key);
            }}
            onToggleGroup={(group) => {
              setHiddenGroups((prev) =>
                toggleGroupHidden(prev, group, latest.current.view),
              );
              latest.current.toggleGroup(group);
            }}
            onToggleHideEmpty={() => {
              setHideEmpty((prev) => !prev);
              latest.current.toggleHideEmpty();
            }}
            onReset={resetToDefaults}
            facet={facet}
            onFacetChange={setFacet}
            showBack={false}
            hideReset
            alwaysSearch={false}
          />
        </div>
      </ModalBody>
    </Modal>
  );
}

interface DisplayPanelProps {
  state: DisplayState;
  onGroup: (key: GroupKey) => void;
  onSort: (key: SortKey) => void;
  onToggleField: (key: CardFieldKey) => void;
  onToggleGroup: (group: GroupDef) => void;
  onToggleHideEmpty: () => void;
  onReset: () => void;
  /** The list that's open, or `null` for the rows. */
  facet: DisplayFacet | null;
  onFacetChange: (facet: DisplayFacet | null) => void;
  /** A back row inside the panel — the popup has no header bar to hold one. */
  showBack: boolean;
  /** No reset button below — the sheet has it in its bar. */
  hideReset?: boolean;
  alwaysSearch?: boolean;
}

/**
 * The "Display" panel laid out like the filters' (`FilterPopup`), for a
 * tablet and a phone: grouping and ordering as rows showing their current
 * value — a tap opens the choices as a list — and the shown fields as
 * chips.
 */
export function DisplayPanel({
  state,
  onGroup,
  onSort,
  onToggleField,
  onToggleGroup,
  onToggleHideEmpty,
  onReset,
  facet,
  onFacetChange,
  showBack,
  hideReset = false,
  alwaysSearch = false,
}: DisplayPanelProps) {
  const t = useTranslations();
  const { sortKeys, groupKeys } = availableKeys(
    state.projectHiddenFields,
    state.hidden,
  );

  // The groups of the active grouping (BARY-47) — for statuses all of them,
  // Canceled included.
  const groups: GroupDef[] = groupDefs(
    state.groupKey,
    state.groupLookups,
    {
      unassigned: t("fields.unassigned"),
      noStoryPoints: t("fields.noStoryPoints"),
    },
    [],
  );
  const isHidden = (group: GroupDef) =>
    isGroupHidden(state.hiddenGroups, group, state.view);

  const visibleGroups = groups.filter((g) => !isHidden(g));

  if (facet === "groups") {
    const title = t("display.groupsTitle");
    return (
      <>
        {showBack && (
          <button
            type="button"
            className={styles.backRow}
            onClick={() => onFacetChange(null)}
          >
            <Icon icon="lucide:chevron-left" width={18} />
            {title}
          </button>
        )}
        <FilterOptions
          alwaysSearch={alwaysSearch}
          facet={{
            title,
            options: groups.map((group) => ({
              value: group.id,
              label: group.label,
              icon: <GroupIcon group={group} size={16} />,
            })),
            selected: visibleGroups.map((g) => g.id),
          }}
          // Several at a time: a tap toggles one and the list stays open.
          onToggle={(value) => {
            const group = groups.find((g) => g.id === String(value));
            if (group) onToggleGroup(group);
          }}
        />
      </>
    );
  }

  if (facet) {
    const isGroup = facet === "group";
    const title = isGroup ? t("display.grouping") : t("display.ordering");
    return (
      <>
        {showBack && (
          <button
            type="button"
            className={styles.backRow}
            onClick={() => onFacetChange(null)}
          >
            <Icon icon="lucide:chevron-left" width={18} />
            {title}
          </button>
        )}
        <FilterOptions
          single
          alwaysSearch={alwaysSearch}
          facet={{
            title,
            options: isGroup
              ? groupKeys.map((key) => ({
                  value: key,
                  label: t(GROUP_LABEL_KEY[key]),
                }))
              : sortKeys.map((key) => ({
                  value: key,
                  label: t(SORT_LABEL_KEY[key]),
                })),
            selected: [isGroup ? state.groupKey : state.sortKey],
          }}
          onToggle={(value) => {
            if (isGroup) onGroup(value as GroupKey);
            else onSort(value as SortKey);
            // One value at a time: choosing it is the end of the list.
            onFacetChange(null);
          }}
        />
      </>
    );
  }

  return (
    <>
      <ChoiceRow
        title={t("display.grouping")}
        value={t(GROUP_LABEL_KEY[state.groupKey])}
        onOpen={() => onFacetChange("group")}
      />
      <ChoiceRow
        title={t("display.ordering")}
        value={t(SORT_LABEL_KEY[state.sortKey])}
        onOpen={() => onFacetChange("sort")}
      />

      {groups.length > 0 && (
        <ChoiceRow
          title={t("display.groupsTitle")}
          value={
            visibleGroups.length === groups.length
              ? t("display.groupsAll")
              : `${visibleGroups.length}/${groups.length}`
          }
          onOpen={() => onFacetChange("groups")}
        />
      )}

      <div className={`${styles.row} ${styles.switchRow}`}>
        <span className={styles.rowLabel}>{t("display.hideEmptyGroups")}</span>
        <Switch
          checked={state.hideEmptyGroups}
          onChange={onToggleHideEmpty}
          label={t("display.hideEmptyGroups")}
          labelHidden
        />
      </div>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t("display.fieldsTitle")}</span>
        <div className={styles.chips}>
          {CARD_FIELD_KEYS.map((key) => (
            <Chip
              key={key}
              type="filter"
              variant="text"
              selected={!state.hidden.has(key)}
              onClick={() => onToggleField(key)}
            >
              {t(FIELD_LABEL_KEY[key])}
            </Chip>
          ))}
        </div>
      </div>

      {!hideReset && (
        <div className={styles.footer}>
          <Button
            type="button"
            variant="outline"
            full
            icon={<Icon icon="lucide:rotate-ccw" width={14} />}
            onClick={onReset}
          >
            {t("display.reset")}
          </Button>
        </div>
      )}
    </>
  );
}

/** A row like the filters': name on the left, the current value and an arrow. */
function ChoiceRow({
  title,
  value,
  onOpen,
}: {
  title: string;
  value: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.row} ${styles.facetRow}`}
      aria-haspopup="true"
      onClick={onOpen}
    >
      <span className={styles.rowLabel}>{title}</span>
      <span className={styles.pick}>
        <span>{value}</span>
        <Icon icon="lucide:chevron-right" width={14} />
      </span>
    </button>
  );
}
