"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import type { ViewGroupsPatch } from "@/features/issues/actions";
import {
  CARD_FIELD_KEYS,
  type CardFieldKey,
  isCardFieldKey,
} from "@/features/issues/card-fields";
import {
  GROUP_KEYS,
  type GroupDef,
  type GroupKey,
  type GroupLookups,
  groupDefs,
} from "@/features/issues/group";
import { groupOrderEntries, orderGroups } from "@/features/issues/group-order";
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
import { GroupOrderList } from "./GroupOrderList";
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
  project: "fields.project",
} as const satisfies Record<GroupKey, string>;

/** "No lanes" in the lanes list — not a group key. */
const LANES_NONE = "_none";

/** Group keys that only make sense while the field they group by is shown. */
const GROUP_KEY_FIELD: Partial<Record<GroupKey, DetailFieldKey>> = {
  priority: "priority",
  storyPoints: "storyPoints",
};

/** What can be grouped / ordered by right now — depends on the shown fields. */
function availableKeys(
  projectHiddenFields: string[],
  hidden: Set<CardFieldKey>,
  /** Across projects (V8) — only there can one group by project. */
  crossProject: boolean,
) {
  const projectVisible = visibleDetailFields(projectHiddenFields);
  const sortKeys = SORT_KEYS.filter((key) => {
    const field = SORT_KEY_FIELD[key];
    if (!field || !projectVisible.has(field)) return !field;
    return !(isCardFieldKey(field) && hidden.has(field));
  });
  const groupKeys = GROUP_KEYS.filter((key) => {
    if (key === "project") return crossProject;
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
  /** The board's swimlanes (BARY-173); `null` = none. */
  laneKey: GroupKey | null;
  onLaneChange: (key: GroupKey | null) => void;
  /** Lanes without an issue hide themselves. */
  hideEmptyLanes: boolean;
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
  /** Sub-issues as cards of their own — only offered on the board. */
  showSubIssues: boolean;
  /** Own order of the groups, `group-order.ts` entries (BARY-165). */
  groupOrder: string[];
  onGroupsChange: (
    patch: ViewGroupsPatch,
  ) => Promise<{ ok: true } | { error: string }>;
  /** Board or list, chosen at the panel's top (V8) — on every board and
   *  list, the same place everywhere. */
  onLayoutChange?: (view: GroupView) => void;
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
  laneKey,
  onLaneChange,
  hideEmptyLanes,
  projectHiddenFields,
  sortKey,
  onSortChange,
  hiddenFields,
  onDisplayChange,
  groupLookups,
  view,
  hiddenGroups,
  hideEmptyGroups,
  showSubIssues,
  groupOrder,
  onGroupsChange,
  onLayoutChange,
}: ViewSettingsProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(
    () => new Set(hiddenFields.filter(isCardFieldKey)),
  );

  const { sortKeys: availableSortKeys, groupKeys: availableGroupKeys } =
    availableKeys(projectHiddenFields, hidden, Boolean(groupLookups.projects));
  const activeGroupKey = availableGroupKeys.includes(groupKey)
    ? groupKey
    : "status";
  const activeLaneKey =
    laneKey &&
    laneKey !== activeGroupKey &&
    availableGroupKeys.includes(laneKey)
      ? laneKey
      : null;
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

  const [hideEmptyLaneList, setHideEmptyLanes] = useState(hideEmptyLanes);

  const [subIssues, setSubIssues] = useState(showSubIssues);

  const [order, setOrder] = useState(groupOrder);

  // The values come back from outside too — the stored preference catching
  // up, or a saved view's address after "Discard" (BARY-165). Follow them.
  const hiddenFieldsKey = hiddenFields.join(",");
  const hiddenGroupsKey = hiddenGroups.join(",");
  const groupOrderKey = groupOrder.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: resync on new values only
  useEffect(() => {
    setHidden(new Set(hiddenFields.filter(isCardFieldKey)));
  }, [hiddenFieldsKey]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: resync on new values only
  useEffect(() => setHiddenGroupList(hiddenGroups), [hiddenGroupsKey]);
  useEffect(() => setHideEmpty(hideEmptyGroups), [hideEmptyGroups]);
  useEffect(() => setHideEmptyLanes(hideEmptyLanes), [hideEmptyLanes]);
  useEffect(() => setSubIssues(showSubIssues), [showSubIssues]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: resync on new values only
  useEffect(() => setOrder(groupOrder), [groupOrderKey]);

  const saveGroups = (patch: ViewGroupsPatch) => {
    if (patch.hiddenGroups) setHiddenGroupList(patch.hiddenGroups);
    if (patch.hideEmptyGroups !== undefined)
      setHideEmpty(patch.hideEmptyGroups);
    if (patch.showSubIssues !== undefined) setSubIssues(patch.showSubIssues);
    if (patch.groupOrder) setOrder(patch.groupOrder);
    if (patch.hideEmptyLanes !== undefined)
      setHideEmptyLanes(patch.hideEmptyLanes);
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

  const toggleSubIssues = () => saveGroups({ showSubIssues: !subIssues });

  const toggleHideEmptyLanes = () =>
    saveGroups({ hideEmptyLanes: !hideEmptyLaneList });

  /** A new order of the groups — from the column list (BARY-165). */
  const reorderGroups = (groups: GroupDef[]) =>
    saveGroups({ groupOrder: groupOrderEntries(groups) });

  const resetOrder = () => saveGroups({ groupOrder: [] });

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
    onLaneChange(null);
    save(new Set());
    if (
      hiddenGroupList.length > 0 ||
      hideEmpty ||
      subIssues ||
      order.length ||
      hideEmptyLaneList
    )
      saveGroups({
        hiddenGroups: [],
        hideEmptyGroups: false,
        showSubIssues: false,
        groupOrder: [],
        hideEmptyLanes: false,
      });
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
    showSubIssues: subIssues,
    groupOrder: order,
    laneKey: activeLaneKey,
    hideEmptyLanes: hideEmptyLaneList,
    toggleGroup,
    toggleHideEmpty,
    toggleSubIssues,
    toggleHideEmptyLanes,
    setLanes: onLaneChange,
    reorderGroups,
    resetOrder,
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
    showSubIssues: subIssues,
    groupOrder: order,
    laneKey: activeLaneKey,
    hideEmptyLanes: hideEmptyLaneList,
    toggleGroup,
    toggleHideEmpty,
    toggleSubIssues,
    toggleHideEmptyLanes,
    setLanes: onLaneChange,
    reorderGroups,
    resetOrder,
    setGroup: onGroupChange,
    setSort: onSortChange,
    toggleField,
    reset,
    layout: onLayoutChange,
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
              showSubIssues: subIssues,
              groupOrder: order,
              laneKey: activeLaneKey,
              hideEmptyLanes: hideEmptyLaneList,
            }}
            onGroup={onGroupChange}
            onLanes={onLaneChange}
            onToggleHideEmptyLanes={toggleHideEmptyLanes}
            onSort={onSortChange}
            onToggleField={toggleField}
            onToggleGroup={toggleGroup}
            onToggleHideEmpty={toggleHideEmpty}
            onToggleSubIssues={toggleSubIssues}
            onReorderGroups={reorderGroups}
            onResetOrder={resetOrder}
            onReset={reset}
            facet={facet}
            onFacetChange={setFacet}
            showBack
            onLayout={onLayoutChange}
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
  showSubIssues: boolean;
  groupOrder: string[];
  laneKey: GroupKey | null;
  hideEmptyLanes: boolean;
  toggleGroup: (group: GroupDef) => void;
  toggleHideEmpty: () => void;
  toggleSubIssues: () => void;
  toggleHideEmptyLanes: () => void;
  setLanes: (key: GroupKey | null) => void;
  reorderGroups: (groups: GroupDef[]) => void;
  resetOrder: () => void;
  setGroup: (key: GroupKey) => void;
  setSort: (key: SortKey) => void;
  toggleField: (key: CardFieldKey) => void;
  reset: () => void;
  layout?: (view: GroupView) => void;
}

type DisplayFacet = "group" | "lanes" | "sort" | "groups";

export interface DisplayState {
  groupKey: GroupKey;
  sortKey: SortKey;
  hidden: Set<CardFieldKey>;
  projectHiddenFields: string[];
  groupLookups: GroupLookups;
  view: GroupView;
  hiddenGroups: string[];
  hideEmptyGroups: boolean;
  /** Sub-issues as cards of their own — the switch only shows on the board. */
  showSubIssues: boolean;
  /** Own order of the groups (BARY-165). */
  groupOrder: string[];
  /** The board's swimlanes (BARY-173); `null` = none. */
  laneKey: GroupKey | null;
  hideEmptyLanes: boolean;
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
  const [subIssues, setSubIssues] = useState(latest.current.showSubIssues);
  const [order, setOrder] = useState(latest.current.groupOrder);
  const [laneKey, setLaneKey] = useState(latest.current.laneKey);
  const [hideEmptyLanes, setHideEmptyLanes] = useState(
    latest.current.hideEmptyLanes,
  );
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
    showSubIssues: subIssues,
    groupOrder: order,
    laneKey,
    hideEmptyLanes,
  };
  const facetTitle =
    facet === "group"
      ? t("display.grouping")
      : facet === "lanes"
        ? t("display.lanes")
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
    setSubIssues(false);
    setOrder([]);
    setLaneKey(null);
    setHideEmptyLanes(false);
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
              if (laneKey === key) setLaneKey(null);
              latest.current.setGroup(key);
            }}
            onLanes={(key) => {
              setLaneKey(key);
              latest.current.setLanes(key);
            }}
            onToggleHideEmptyLanes={() => {
              setHideEmptyLanes((prev) => !prev);
              latest.current.toggleHideEmptyLanes();
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
            onToggleSubIssues={() => {
              setSubIssues((prev) => !prev);
              latest.current.toggleSubIssues();
            }}
            onReorderGroups={(groups) => {
              setOrder(groupOrderEntries(groups));
              latest.current.reorderGroups(groups);
            }}
            onResetOrder={() => {
              setOrder([]);
              latest.current.resetOrder();
            }}
            onReset={resetToDefaults}
            facet={facet}
            onFacetChange={setFacet}
            showBack={false}
            hideReset
            alwaysSearch={false}
            onLayout={
              latest.current.layout
                ? (next) => {
                    latest.current.layout?.(next);
                    // The page underneath changes — the sheet goes with it.
                    close();
                  }
                : undefined
            }
          />
        </div>
      </ModalBody>
    </Modal>
  );
}

interface DisplayPanelProps {
  state: DisplayState;
  onGroup: (key: GroupKey) => void;
  onLanes: (key: GroupKey | null) => void;
  onToggleHideEmptyLanes: () => void;
  onSort: (key: SortKey) => void;
  onToggleField: (key: CardFieldKey) => void;
  onToggleGroup: (group: GroupDef) => void;
  onToggleHideEmpty: () => void;
  onToggleSubIssues: () => void;
  /** The column list in a new order (BARY-165). */
  onReorderGroups: (groups: GroupDef[]) => void;
  onResetOrder: () => void;
  onReset: () => void;
  /** The list that's open, or `null` for the rows. */
  facet: DisplayFacet | null;
  onFacetChange: (facet: DisplayFacet | null) => void;
  /** A back row inside the panel — the popup has no header bar to hold one. */
  showBack: boolean;
  /** No reset button below — the sheet has it in its bar. */
  hideReset?: boolean;
  alwaysSearch?: boolean;
  /** Board | List at the top (V8). */
  onLayout?: (view: GroupView) => void;
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
  onLanes,
  onToggleHideEmptyLanes,
  onSort,
  onToggleField,
  onToggleGroup,
  onToggleHideEmpty,
  onToggleSubIssues,
  onReorderGroups,
  onResetOrder,
  onReset,
  facet,
  onFacetChange,
  showBack,
  hideReset = false,
  alwaysSearch = false,
  onLayout,
}: DisplayPanelProps) {
  const t = useTranslations();
  const { sortKeys, groupKeys } = availableKeys(
    state.projectHiddenFields,
    state.hidden,
    Boolean(state.groupLookups.projects),
  );

  // The groups of the active grouping (BARY-47) — for statuses all of them,
  // Canceled included.
  const groups: GroupDef[] = orderGroups(
    groupDefs(
      state.groupKey,
      state.groupLookups,
      {
        unassigned: t("fields.unassigned"),
        noStoryPoints: t("fields.noStoryPoints"),
      },
      [],
    ),
    state.groupOrder,
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
        <GroupOrderList
          groups={groups}
          isHidden={isHidden}
          onToggle={onToggleGroup}
          onReorder={onReorderGroups}
          onResetOrder={state.groupOrder.length > 0 ? onResetOrder : undefined}
        />
      </>
    );
  }

  if (facet === "lanes") {
    const title = t("display.lanes");
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
            options: [
              { value: LANES_NONE, label: t("display.lanesNone") },
              // Never the columns' own grouping — it would repeat them.
              ...groupKeys
                .filter((key) => key !== state.groupKey)
                .map((key) => ({ value: key, label: t(GROUP_LABEL_KEY[key]) })),
            ],
            selected: [state.laneKey ?? LANES_NONE],
          }}
          onToggle={(value) => {
            onLanes(value === LANES_NONE ? null : (value as GroupKey));
            onFacetChange(null);
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
      {/* Board or list first: everything below depends on it (V8). */}
      {onLayout && (
        <div className={styles.layoutSwitch}>
          <SegmentedControl
            variant="surface"
            value={state.view}
            onChange={(v) => onLayout(v as GroupView)}
            items={[
              {
                value: "board",
                label: t("nav.board"),
                icon: <Icon icon="lucide:layout-dashboard" width={15} />,
              },
              {
                value: "list",
                label: t("views.layoutList"),
                icon: <Icon icon="lucide:list" width={15} />,
              },
            ]}
          />
        </div>
      )}
      <ChoiceRow
        title={
          state.view === "board" ? t("display.columns") : t("display.grouping")
        }
        value={t(GROUP_LABEL_KEY[state.groupKey])}
        onOpen={() => onFacetChange("group")}
      />
      {/* Swimlanes: a second grouping, the board only (BARY-173). */}
      {state.view === "board" && (
        <ChoiceRow
          title={t("display.lanes")}
          value={
            state.laneKey
              ? t(GROUP_LABEL_KEY[state.laneKey])
              : t("display.lanesNone")
          }
          onOpen={() => onFacetChange("lanes")}
        />
      )}
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

      {state.view === "board" && state.laneKey && (
        <div className={`${styles.row} ${styles.switchRow}`}>
          <span className={styles.rowLabel}>{t("display.hideEmptyLanes")}</span>
          <Switch
            checked={state.hideEmptyLanes}
            onChange={onToggleHideEmptyLanes}
            label={t("display.hideEmptyLanes")}
            labelHidden
          />
        </div>
      )}

      {/* The list keeps sub-issues regardless — only the board can leave them out. */}
      {state.view === "board" && (
        <div className={`${styles.row} ${styles.switchRow}`}>
          <span className={styles.rowLabel}>{t("display.showSubIssues")}</span>
          <Switch
            checked={state.showSubIssues}
            onChange={onToggleSubIssues}
            label={t("display.showSubIssues")}
            labelHidden
          />
        </div>
      )}

      {/* The list chooses its columns in its own header (BARY-175). */}
      {state.view !== "list" && (
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
                selected={!state.hidden.has(key)}
                onClick={() => onToggleField(key)}
              >
                {t(FIELD_LABEL_KEY[key])}
              </Chip>
            ))}
          </div>
        </div>
      )}

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
