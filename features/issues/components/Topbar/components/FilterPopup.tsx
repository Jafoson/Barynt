"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import {
  LabelIcon,
  PriorityIcon,
  StatusIcon,
} from "@/features/issues/components/IssueIcons/IssueIcons";
import { STORY_POINTS_OPTIONS } from "@/features/issues/story-points";
import { visibleDetailFields } from "@/features/projects/detail-fields";
import type { Translator } from "@/i18n/types";
import { useModal } from "@/lib/context";
import { fullName } from "@/lib/utils/string";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import type { Label, Priority, Project, Status, User } from "@/types";
import type { FilterKey, FilterState, IssueArea } from "../useTopbar";
import styles from "./viewSettings.module.scss";

/** Same four values as the desktop chip (`DueDateFilter`). */
const DUE_DATE_BUCKETS = ["overdue", "today", "week", "none"] as const;

/** From this many values on, the list of a filter gets a search field. */
const SEARCH_FROM = 7;

interface FilterPopupProps {
  filters: FilterState;
  filterCount: number;
  area: IssueArea;
  /** Empty in the "My issues" area — same rule as `TopbarFilters`. */
  hiddenDetailFields: string[];
  statuses: Status[];
  priorities: Priority[];
  members: User[];
  labels: Label[];
  projects: Project[];
  onToggle: (key: FilterKey, value: string | number) => void;
  onClearAll: () => void;
}

export interface FilterOption {
  value: string | number;
  label: string;
  icon?: React.ReactNode;
}

/** One filter as the panel draws it. */
export interface Facet {
  key: FilterKey;
  title: string;
  options: FilterOption[];
  selected: (string | number)[];
}

/**
 * All the topbar filters in one popup — for a tablet and a phone, where a
 * row of one chip per filter doesn't fit. One button with the number of
 * active filters. Inside, one row per filter (name on the left, a button
 * on the right) with what's chosen as removable chips underneath; tapping
 * the row opens that filter's list of values in place, with a back button.
 * The rows follow the "Display" panel (`ViewSettings`) next to it.
 *
 * On a phone the panel is a bottom sheet instead of a dropdown.
 *
 * Says the same thing as `TopbarFilters` (same filters, same visibility
 * rules, same `onToggle`); it just lays it out differently. The desktop keeps
 * its chips.
 */
export function FilterPopup(props: FilterPopupProps) {
  const t = useTranslations();
  const { openModal } = useModal();
  // A phone gets a bottom sheet instead of a dropdown; a tablet keeps the
  // popup.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [facet, setFacet] = useState<FilterKey | null>(null);

  // The sheet lives in the modal layer, outside this component's tree, so
  // what it was opened with goes stale. It reads the latest props through
  // this ref — `onToggle` in particular builds on the URL as of its render.
  const latest = useRef(props);
  latest.current = props;

  const trigger = (
    <Chip
      type="filter"
      variant="text"
      selected={props.filterCount > 0}
      icon={<Icon icon="lucide:list-filter" width={14} />}
      trailing={
        props.filterCount > 0 ? (
          <Badge size="sm">{props.filterCount}</Badge>
        ) : null
      }
      onClick={
        isPhone
          ? () =>
              openModal(
                ({ close }) => <FilterSheet latest={latest} close={close} />,
                { placement: "bottom", label: t("filters.label") },
              )
          : undefined
      }
    >
      {t("filters.label")}
    </Chip>
  );

  if (isPhone) return trigger;

  return (
    <InlinePicker
      width={320}
      trigger={trigger}
      // Next time it opens, it starts at the rows again.
      onOpenChange={(open) => !open && setFacet(null)}
    >
      {() => (
        <div className={`${styles.panel} ${styles.scrolling}`}>
          <FilterPanel
            {...props}
            facet={facet}
            onFacetChange={setFacet}
            showBack
          />
        </div>
      )}
    </InlinePicker>
  );
}

/**
 * The phone's version: a bottom sheet with the same rows. It keeps its own
 * copy of the filters so a pick shows up at once, while the URL — where the
 * real state lives — catches up behind it.
 */
function FilterSheet({
  latest,
  close,
}: {
  latest: React.RefObject<FilterPopupProps>;
  close: () => void;
}) {
  const t = useTranslations();
  const [filters, setFilters] = useState(latest.current.filters);
  const [facet, setFacet] = useState<FilterKey | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  const props = latest.current;
  const filterCount = Object.values(filters).reduce(
    (sum, values) => sum + values.length,
    0,
  );
  const panelProps = {
    ...props,
    filters,
    filterCount,
    facet,
    onFacetChange: setFacet,
    showBack: false,
    alwaysSearch: true,
    hideReset: true,
    onToggle: (key: FilterKey, value: string | number) => {
      setFilters((current) => {
        const list = current[key] as (string | number)[];
        const next = list.includes(value)
          ? list.filter((v) => v !== value)
          : [...list, value];
        return { ...current, [key]: next };
      });
      latest.current.onToggle(key, value);
    },
    onClearAll: () => {
      setFilters({
        status: [],
        priority: [],
        assignee: [],
        label: [],
        project: [],
        storyPoints: [],
        dueDate: [],
      });
      latest.current.onClearAll();
    },
  };
  const openFacet = buildFacets(panelProps, t).find((f) => f.key === facet);

  return (
    <Modal variant="sheet" style={swipe.style} {...swipe.handlers}>
      <SheetHeader
        title={openFacet?.title ?? t("filters.label")}
        onBack={openFacet ? () => setFacet(null) : undefined}
        backLabel={t("filters.back")}
        // On the rows (not inside one filter's list): reset everything.
        action={
          openFacet
            ? undefined
            : {
                label: t("display.reset"),
                ariaLabel: t("filters.clearAll"),
                disabled: filterCount === 0,
                onClick: panelProps.onClearAll,
              }
        }
        onClose={close}
        closeLabel={t("actions.close")}
      />
      <ModalBody ref={bodyRef} className={styles.sheetBody}>
        <div className={styles.panel}>
          <FilterPanel {...panelProps} />
        </div>
      </ModalBody>
    </Modal>
  );
}

type FilterPanelProps = FilterPopupProps & {
  /** The filter whose list is open, or `null` for the rows. */
  facet: FilterKey | null;
  onFacetChange: (facet: FilterKey | null) => void;
  /** A back row inside the panel — the popup has no header bar to hold one. */
  showBack: boolean;
  /** A search field on every list, not only long ones — the phone's sheet. */
  alwaysSearch?: boolean;
  /** No reset link below the rows — the sheet has it in its bar. */
  hideReset?: boolean;
};

/** The filters that apply here, in order, with their values. */
export function buildFacets(
  {
    filters,
    area,
    hiddenDetailFields,
    statuses,
    priorities,
    members,
    labels,
    projects,
  }: Pick<
    FilterPopupProps,
    | "filters"
    | "area"
    | "hiddenDetailFields"
    | "statuses"
    | "priorities"
    | "members"
    | "labels"
    | "projects"
  >,
  t: Translator,
): Facet[] {
  const visible = visibleDetailFields(hiddenDetailFields);
  const facets: Facet[] = [
    {
      key: "status",
      title: t("fields.status"),
      selected: filters.status,
      options: statuses.map((status) => ({
        value: status.id,
        label: status.name,
        icon: <StatusIcon status={status.id} size={14} color={status.color} />,
      })),
    },
  ];
  if (visible.has("priority")) {
    facets.push({
      key: "priority",
      title: t("fields.priority"),
      selected: filters.priority,
      options: priorities.map((priority) => ({
        value: priority.id,
        label: priority.name,
        icon: <PriorityIcon priority={priority.id} size={14} />,
      })),
    });
  }
  // The slot the area leaves open, as in `TopbarFilters`.
  if (area === "project") {
    facets.push({
      key: "assignee",
      title: t("fields.assignee"),
      selected: filters.assignee,
      options: members.map((user) => ({
        value: user.id,
        label: fullName(user),
        icon: <Avatar avatar={user} size={18} />,
      })),
    });
  } else {
    facets.push({
      key: "project",
      title: t("fields.project"),
      selected: filters.project,
      options: projects.map((project) => ({
        value: project.id,
        label: project.name,
        icon: <LabelIcon color={project.color} size={13} />,
      })),
    });
  }
  if (visible.has("labels") && labels.length > 0) {
    facets.push({
      key: "label",
      title: t("fields.label"),
      selected: filters.label,
      options: labels.map((label) => ({
        value: label.id,
        label: label.name,
        icon: <LabelIcon color={label.color} size={13} />,
      })),
    });
  }
  if (visible.has("storyPoints")) {
    facets.push({
      key: "storyPoints",
      title: t("fields.storyPoints"),
      selected: filters.storyPoints,
      options: STORY_POINTS_OPTIONS.map((points) => ({
        value: points,
        label: String(points),
      })),
    });
  }
  if (visible.has("dueDate")) {
    const dueDateLabel: Record<(typeof DUE_DATE_BUCKETS)[number], string> = {
      overdue: t("filters.dueDateOverdue"),
      today: t("filters.dueDateToday"),
      week: t("filters.dueDateWeek"),
      none: t("filters.dueDateNone"),
    };
    facets.push({
      key: "dueDate",
      title: t("fields.dueDate"),
      selected: filters.dueDate,
      options: DUE_DATE_BUCKETS.map((bucket) => ({
        value: bucket,
        label: dueDateLabel[bucket],
      })),
    });
  }
  return facets;
}

/** The rows and the reset link — or one filter's list of values. */
function FilterPanel(props: FilterPanelProps) {
  const t = useTranslations();
  const {
    facet,
    onFacetChange,
    showBack,
    alwaysSearch,
    hideReset,
    filterCount,
    onToggle,
    onClearAll,
  } = props;
  const facets = buildFacets(props, t);
  const open = facets.find((f) => f.key === facet);

  if (open) {
    return (
      <>
        {showBack && (
          <button
            type="button"
            className={styles.backRow}
            onClick={() => onFacetChange(null)}
          >
            <Icon icon="lucide:chevron-left" width={18} />
            {open.title}
          </button>
        )}
        <FilterOptions
          facet={open}
          alwaysSearch={alwaysSearch}
          onToggle={(value) => onToggle(open.key, value)}
        />
      </>
    );
  }

  return (
    <>
      {facets.map((f) => (
        <FilterRow
          key={f.key}
          facet={f}
          onOpen={() => onFacetChange(f.key)}
          onToggle={(value) => onToggle(f.key, value)}
        />
      ))}

      {!hideReset && (
        <div className={styles.footer}>
          <Button
            type="button"
            variant="outline"
            full
            disabled={filterCount === 0}
            icon={<Icon icon="lucide:x" width={14} />}
            onClick={onClearAll}
          >
            {t("filters.clearAll")}
          </Button>
        </div>
      )}
    </>
  );
}

interface FilterRowProps {
  facet: Facet;
  /** Opens this filter's list of values. */
  onOpen: () => void;
  /** Takes a value off again (the chip's cross). */
  onToggle: (value: string | number) => void;
}

/**
 * One filter, laid out like the rows of the "Display" panel: the name on the
 * left, a button on the right that opens its values, and — once something is
 * chosen — the chosen values as removable chips underneath.
 */
export function FilterRow({ facet, onOpen, onToggle }: FilterRowProps) {
  const t = useTranslations();
  const chosen = facet.options.filter((option) =>
    facet.selected.includes(option.value),
  );

  return (
    <div className={styles.facet}>
      <button
        type="button"
        className={`${styles.row} ${styles.facetRow}`}
        aria-haspopup="true"
        onClick={onOpen}
      >
        <span className={styles.rowLabel}>{facet.title}</span>
        <span className={styles.pick}>
          {/* Not on a phone: there the row is just name and arrow, like the
              quick actions' rows. */}
          <span className={styles.pickText}>{t("filters.choose")}</span>
          <Icon icon="lucide:chevron-right" width={14} />
        </span>
      </button>

      {chosen.length > 0 && (
        <div className={styles.chips}>
          {chosen.map((option) => (
            <Chip
              key={option.value}
              type="filter"
              variant="text"
              icon={option.icon}
              selected
              onRemove={() => onToggle(option.value)}
              removeLabel={t("actions.clearFilter", { field: option.label })}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

interface FilterOptionsProps {
  facet: Pick<Facet, "title" | "options" | "selected">;
  onToggle: (value: string | number) => void;
  /** A search field even for a short list. */
  alwaysSearch?: boolean;
  /** One value at a time (grouping, ordering) instead of several. */
  single?: boolean;
}

/**
 * One filter's values as a list: icon, name, a check on what's chosen.
 * Several can be chosen; a tap toggles and the list stays open. A long list
 * gets a search field.
 */
export function FilterOptions({
  facet,
  onToggle,
  alwaysSearch = false,
  single = false,
}: FilterOptionsProps) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = facet.options.filter((option) =>
    option.label.toLowerCase().includes(needle),
  );

  return (
    <div className={styles.optionsList}>
      {(alwaysSearch || facet.options.length >= SEARCH_FROM) && (
        <Input
          variant="search"
          className={styles.optionSearch}
          placeholder={t("placeholders.search")}
          aria-label={facet.title}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <div
        role="listbox"
        aria-multiselectable={!single}
        aria-label={facet.title}
      >
        {shown.map((option) => {
          const on = facet.selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={on}
              className={styles.optionRow}
              onClick={() => onToggle(option.value)}
            >
              <span className={styles.optionIcon}>{option.icon}</span>
              <span className={styles.optionLabel}>{option.label}</span>
              {on && (
                <Icon
                  icon="lucide:check"
                  width={18}
                  className={styles.optionCheck}
                />
              )}
            </button>
          );
        })}
        {shown.length === 0 && (
          <p className={styles.optionEmpty}>{t("filters.noMatches")}</p>
        )}
      </div>
    </div>
  );
}
