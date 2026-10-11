"use client";

import { Icon } from "@iconify/react";
import { LinkText } from "@/features/custom-fields/components/LinkChip/LinkChip";
import { OptionVisual } from "@/features/custom-fields/components/OptionVisual/OptionVisual";
import { SiteIcon } from "@/features/custom-fields/components/SiteIcon/SiteIcon";
import { fieldsFor, useFieldText } from "@/features/custom-fields/format";
import type { IssueLookups } from "@/features/issues/types";
import {
  type FieldDefinition,
  titleKey,
  withScheme,
} from "@/lib/custom-fields";
import { usePreferences } from "@/lib/preferences/PreferencesContext";
import type { Issue } from "@/types";
import styles from "./fieldChips.module.scss";

interface Props {
  issue: Pick<Issue, "project" | "fieldValues">;
  fields: FieldDefinition[];
  members: IssueLookups["members"];
  /** How many chips before the rest folds into "+N". */
  max?: number;
}

/**
 * The custom fields of an issue that have a value, as small `name value`
 * chips — for a board card or a list row. Fields without a value take no
 * room, so a workspace with many fields doesn't make every card tall.
 *
 * Read-only: changing a value happens in the issue itself, a click on the
 * card opens it.
 */
export function FieldChips({ issue, fields, members, max = 3 }: Props) {
  const text = useFieldText();
  const { fieldLabelMode } = usePreferences();

  const filled = fieldsFor(fields, issue.project).flatMap((field) => {
    const value = issue.fieldValues?.[field.id];
    if (value === undefined) return [];
    // A checkbox that is off says nothing worth a chip.
    if (field.type === "CHECKBOX" && value === false) return [];
    const shown = text(field, value, members);
    // The chosen options of a choice field, to show their icons or images.
    const ids =
      field.type === "SELECT"
        ? [value]
        : field.type === "MULTI_SELECT" && Array.isArray(value)
          ? value
          : [];
    const picked = ids.flatMap((id) => {
      const option = field.options.find((o) => o.id === id);
      return option ? [option] : [];
    });
    return shown === "" ? [] : [{ field, shown, picked }];
  });

  if (filled.length === 0) return null;
  const visible = filled.slice(0, max);
  const rest = filled.length - visible.length;

  return (
    <div className={styles.chips}>
      {visible.map(({ field, shown, picked }) => {
        // What stands before the value is the person's choice. A field
        // without an icon shows its name where the icon was asked for, so a
        // chip is never a bare value.
        // A link with its site's icon turned on shows that icon instead.
        const link =
          field.type === "URL" &&
          typeof issue.fieldValues?.[field.id] === "string"
            ? withScheme(String(issue.fieldValues?.[field.id]))
            : null;
        const siteIcon = link !== null && field.linkFavicon;
        const hasIcon = Boolean(field.icon) || siteIcon;
        const showIcon = hasIcon && (siteIcon || fieldLabelMode !== "name");
        const showName =
          fieldLabelMode === "name" || fieldLabelMode === "both" || !hasIcon;
        const own = issue.fieldValues?.[titleKey(field.id)];
        return (
          <span
            key={field.id}
            className={styles.chip}
            title={`${field.name}: ${shown}`}
          >
            {showIcon && siteIcon && link && <SiteIcon url={link} size={12} />}
            {showIcon && !siteIcon && field.icon && (
              <Icon
                icon={field.icon}
                width={12}
                className={styles.icon}
                aria-hidden="true"
              />
            )}
            {showName && <span className={styles.name}>{field.name}</span>}
            {picked.length > 0 ? (
              <span className={styles.choices}>
                {picked.map((option, i) => (
                  <span key={option.id} className={styles.choice}>
                    <OptionVisual option={option} size={14} />
                    {option.label}
                    {i < picked.length - 1 ? "," : ""}
                  </span>
                ))}
              </span>
            ) : (
              <span className={styles.value}>
                {link ? (
                  <LinkText
                    url={link}
                    title={typeof own === "string" ? own : null}
                    fetchTitle={field.linkFetchTitle}
                  />
                ) : (
                  shown
                )}
              </span>
            )}
          </span>
        );
      })}
      {rest > 0 && (
        <span className={`${styles.chip} ${styles.more}`}>+{rest}</span>
      )}
    </div>
  );
}
