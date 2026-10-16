"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { createContext, Fragment, useContext, useState } from "react";
import {
  type FilterNode,
  type FilterRule,
  type IssueFilter,
  isGroup,
  rulesIn,
} from "@/features/issues/filter";
import { FILTER_ACCENT } from "../filterAccent";
import { type FilterLabelLookups, useFilterLabels } from "../filterLabels";
import styles from "../topbar.module.scss";
import type { FilterKey } from "../useTopbar";

/** One rule in words — "is not" said by crossing it out. */
function RuleText({
  rule,
  labelsOf,
}: {
  rule: FilterRule;
  labelsOf: ReturnType<typeof useFilterLabels>;
}) {
  // One inline run: in a flex parent, loose text pieces lose the spaces
  // between them.
  // "is not": the whole condition crossed out, read as "is" — easier to
  // spot than the words.
  if (rule.is === "none" && Array.isArray(rule.value))
    return (
      <s className={styles.notValues}>
        {`${labelsOf.field(rule.field)} ${labelsOf.op(rule.field, "any")} ${rule.value
          .map((v) => labelsOf.value(rule.field, v))
          .join(", ")}`}
      </s>
    );
  // A day as a date chip, like in descriptions.
  if (
    (rule.is === "before" || rule.is === "after") &&
    typeof rule.value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(rule.value)
  )
    return (
      <span>
        {`${labelsOf.field(rule.field)} ${labelsOf.op(rule.field, rule.is)} `}
        <span className={styles.dateChip}>
          <Icon icon="lucide:calendar" width={12} aria-hidden="true" />
          <time dateTime={rule.value} suppressHydrationWarning>
            {labelsOf.value(rule.field, rule.value)}
          </time>
        </span>
      </span>
    );
  return <span>{labelsOf.rule(rule)}</span>;
}

/** From this depth on (the row's own items being 1), a group shows folded
 *  as "⋯ n ▸" until opened — every box inside a group. Opened, it shows
 *  everything inside, however deep. */
const FOLD_FROM = 2;

/** Which folded groups are open, by top-level index and path. */
const FoldContext = createContext<{
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
}>({ isOpen: () => false, toggle: () => {} });

/** A group's parts in the group row: conditions as chips (a × on hover
 *  takes one out), a nested group in a frame of its kind's color, UND/ODER
 *  plaques between. */
function GroupParts({
  node,
  labelsOf,
  onOpen,
  onRemove,
  path = [],
  scope = "",
  unfolded = false,
}: {
  node: FilterNode;
  labelsOf: ReturnType<typeof useFilterLabels>;
  /** Opens the editor — without it the text is just text. */
  onOpen?: () => void;
  onRemove: (path: number[]) => void;
  path?: number[];
  /** The top-level node's index — names this group's folds. */
  scope?: string;
  /** Inside an opened fold: everything shows, nothing folds again. */
  unfolded?: boolean;
}) {
  const t = useTranslations();
  const fold = useContext(FoldContext);
  if (!isGroup(node))
    return (
      <span
        className={styles.condChip}
        // The same outline as the field's own chip above.
        style={
          node.field in FILTER_ACCENT
            ? ({
                "--filter-accent": FILTER_ACCENT[node.field as FilterKey],
              } as React.CSSProperties)
            : undefined
        }
      >
        {onOpen ? (
          <button type="button" className={styles.condLabel} onClick={onOpen}>
            <RuleText rule={node} labelsOf={labelsOf} />
          </button>
        ) : (
          <span className={styles.condLabel}>
            <RuleText rule={node} labelsOf={labelsOf} />
          </span>
        )}
        <button
          type="button"
          className={styles.condRemove}
          aria-label={t("filters.removeRule", { rule: labelsOf.rule(node) })}
          title={t("filters.removeRule", { rule: labelsOf.rule(node) })}
          onClick={() => onRemove(path)}
        >
          <Icon icon="lucide:x" width={12} />
        </button>
      </span>
    );
  return (
    <>
      {node.rules.map((child, i) => (
        <Fragment key={`${i}:${labelsOf.member(child)}`}>
          {i > 0 && (
            <span className={styles.opPill} data-op={node.op}>
              {node.op === "or" ? t("filters.or") : t("filters.and")}
            </span>
          )}
          {isGroup(child) &&
          // The top-level group is depth 1, its boxes 2, theirs 3, …
          !unfolded &&
          path.length + 2 >= FOLD_FROM &&
          !fold.isOpen(`${scope}:${[...path, i].join(".")}`) ? (
            <button
              type="button"
              className={styles.foldChip}
              data-op={child.op}
              title={labelsOf.node(child)}
              aria-expanded={false}
              onClick={() => fold.toggle(`${scope}:${[...path, i].join(".")}`)}
            >
              <Icon icon="lucide:ellipsis" width={14} aria-hidden="true" />
              {rulesIn(child).length}
              <Icon icon="lucide:chevron-right" width={13} aria-hidden="true" />
            </button>
          ) : isGroup(child) ? (
            <span className={styles.groupBox} data-op={child.op}>
              <GroupParts
                node={child}
                labelsOf={labelsOf}
                onOpen={onOpen}
                onRemove={onRemove}
                path={[...path, i]}
                scope={scope}
                // Opened here (or above): show all of it.
                unfolded={unfolded || path.length + 2 >= FOLD_FROM}
              />
              {!unfolded && path.length + 2 >= FOLD_FROM && (
                <button
                  type="button"
                  className={styles.foldChip}
                  aria-expanded
                  aria-label={t("filters.fold")}
                  title={t("filters.fold")}
                  onClick={() =>
                    fold.toggle(`${scope}:${[...path, i].join(".")}`)
                  }
                >
                  <Icon
                    icon="lucide:chevron-left"
                    width={13}
                    aria-hidden="true"
                  />
                </button>
              )}
              <button
                type="button"
                className={styles.groupRemove}
                aria-label={t("filters.removeRule", {
                  rule: labelsOf.node(child),
                })}
                title={t("filters.removeRule", { rule: labelsOf.node(child) })}
                onClick={() => onRemove([...path, i])}
              >
                <Icon icon="lucide:x" width={13} />
              </button>
            </span>
          ) : (
            <GroupParts
              node={child}
              labelsOf={labelsOf}
              onOpen={onOpen}
              onRemove={onRemove}
              path={[...path, i]}
              scope={scope}
              unfolded={unfolded}
            />
          )}
        </Fragment>
      ))}
    </>
  );
}

/**
 * Tablet and phone: every active filter in a row of its own under the
 * filter button, scrolling sideways — fields, single rules and UND/ODER
 * groups alike, each condition with a × (BARY-166). The desktop shows the
 * same through its chips and group row.
 */
export function ActiveFilters({
  tree,
  lookups,
  onRemove,
}: {
  tree: IssueFilter;
  lookups: FilterLabelLookups;
  /** Removes the top-level node at `index` — or, with a `path`, one part. */
  onRemove: (index: number, path?: number[]) => void;
}) {
  const t = useTranslations();
  const labelsOf = useFilterLabels(lookups);
  // Folds opened in this row; a changed filter may shift the paths, so a
  // fold can fall shut again — harmless.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const fold = {
    isOpen: (key: string) => open.has(key),
    toggle: (key: string) =>
      setOpen((cur) => {
        const next = new Set(cur);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
  };
  const nodes = tree.rules
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => isGroup(node) || node.field !== "text");
  if (!nodes.length) return null;

  return (
    <FoldContext.Provider value={fold}>
      <div className={styles.activeRow}>
        {nodes.map(({ node, index }) =>
          isGroup(node) ? (
            // The whole group in one frame of its kind's color — ODER amber —
            // so what belongs together reads as one.
            <span
              key={`${index}:${labelsOf.node(node)}`}
              className={`${styles.groupBox} ${styles.activeGroup}`}
              data-op={node.op}
            >
              <GroupParts
                node={node}
                labelsOf={labelsOf}
                onRemove={(path) => onRemove(index, path)}
                scope={String(index)}
              />
              <button
                type="button"
                className={styles.groupRemove}
                aria-label={t("filters.removeRule", {
                  rule: labelsOf.node(node),
                })}
                onClick={() => onRemove(index)}
              >
                <Icon icon="lucide:x" width={13} />
              </button>
            </span>
          ) : (
            <GroupParts
              key={`${index}:${labelsOf.node(node)}`}
              node={node}
              labelsOf={labelsOf}
              onRemove={() => onRemove(index)}
            />
          ),
        )}
      </div>
    </FoldContext.Provider>
  );
}
