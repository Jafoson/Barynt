"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { Label as LabelChip } from "@/components/ui/atoms/Label/Label";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { FieldChoiceMenu } from "@/features/custom-fields/components/FieldChoiceMenu/FieldChoiceMenu";
import { OptionVisual } from "@/features/custom-fields/components/OptionVisual/OptionVisual";
import {
  fieldsFor,
  useFieldText,
  useFieldTimeZone,
} from "@/features/custom-fields/format";
import {
  fromInputString,
  inputStep,
  inputVariant,
  toInputString,
} from "@/features/custom-fields/input";
import { ValuePopover } from "@/features/issues/components/ValuePopover/ValuePopover";
import type { IssueComposerData, IssuePatch } from "@/features/issues/types";
import type { FieldDefinition } from "@/lib/custom-fields";
import type { IssueDetail } from "@/types";
import styles from "../issueDetail.module.scss";
import type { IssueDetailLayout } from "../types";
import fieldStyles from "./issueCustomFields.module.scss";

interface Props {
  issue: IssueDetail;
  data: IssueComposerData;
  layout: IssueDetailLayout;
  onPatch: (patch: IssuePatch) => void;
}

function Row({
  label,
  icon,
  hint,
  children,
}: {
  label: string;
  icon?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.row} title={hint || undefined}>
      <span className={styles.rowLabel}>
        {icon && (
          <Icon
            icon={icon}
            width={13}
            aria-hidden="true"
            className={fieldStyles.labelIcon}
          />
        )}
        {label}
      </span>
      <div className={styles.rowValue}>{children}</div>
    </div>
  );
}

/**
 * The issue's custom fields, one row each, in the order the workspace set.
 * Written through the same patch as every other attribute: the server checks
 * the value against the field's definition and the person's right to edit
 * the issue.
 */
export function IssueCustomFields({ issue, data, layout, onPatch }: Props) {
  const t = useTranslations();
  const text = useFieldText();
  const confirm = useConfirm();
  const timeZone = useFieldTimeZone();
  const canEdit = issue.access.canEdit;
  const fields = fieldsFor(data.customFields, issue.project);

  if (fields.length === 0) return null;

  const set = (field: FieldDefinition, value: unknown) =>
    onPatch({ fieldValues: { [field.id]: value } });

  const rowFor = (field: FieldDefinition) => {
    const value = issue.fieldValues[field.id] ?? null;
    const empty = (
      <span className={styles.valueText}>{t("customFields.noValue")}</span>
    );

    const shown =
      value === null ? (
        empty
      ) : field.type === "URL" ? (
        <a
          className={fieldStyles.link}
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {String(value)}
        </a>
      ) : field.type === "SELECT" ? (
        <span className={`${styles.valueText} ${fieldStyles.withVisual}`}>
          {(() => {
            const option = field.options.find((o) => o.id === value);
            return option ? <OptionVisual option={option} size={14} /> : null;
          })()}
          {text(field, value, data.members)}
        </span>
      ) : (
        <span className={styles.valueText}>
          {text(field, value, data.members)}
        </span>
      );

    if (!canEdit) {
      return (
        <Row
          key={field.id}
          label={field.name}
          icon={field.icon}
          hint={field.description}
        >
          <span className={styles.valueBtn}>{shown}</span>
        </Row>
      );
    }

    if (field.type === "CHECKBOX") {
      return (
        <Row
          key={field.id}
          label={field.name}
          icon={field.icon}
          hint={field.description}
        >
          <Switch
            checked={value === true}
            label={field.name}
            labelHidden
            onChange={(checked) => set(field, checked)}
          />
        </Row>
      );
    }

    const trigger = (
      <button type="button" className={styles.valueBtn} data-field-nav>
        {shown}
      </button>
    );

    // Several choices show the way labels do: a chip each, with a cross to
    // take one off, and the plus that opens the picker. In the narrow
    // sidebar the chips sit below the name, in the column next to it.
    if (field.type === "MULTI_SELECT") {
      const picked = (Array.isArray(value) ? value : [])
        .filter((v): v is string => typeof v === "string")
        .flatMap((id) => {
          const option = field.options.find((o) => o.id === id);
          return option ? [option] : [];
        });

      const removeChoice = async (id: string, name: string) => {
        // Same guard as the labels: Backspace on a focused chip is one
        // keystroke, easy to hit while arrowing through the row.
        const ok = await confirm({
          title: t("actions.removeLabel", { name }),
          confirmLabel: t("actions.remove"),
          cancelLabel: t("actions.cancel"),
          danger: true,
        });
        if (!ok) return;
        const next = picked.map((o) => o.id).filter((x) => x !== id);
        set(field, next.length > 0 ? next : null);
      };

      const chips = picked.map((option) => (
        <LabelChip
          key={option.id}
          color={option.color ?? undefined}
          hasIcon={Boolean(option.icon || option.imageUrl)}
          size="sm"
          onRemove={
            canEdit ? () => removeChoice(option.id, option.label) : undefined
          }
          removeLabel={t("actions.removeLabel", { name: option.label })}
        >
          <OptionVisual option={option} size={13} showColor={false} />
          {option.label}
        </LabelChip>
      ));

      const picker = (trigger: React.ReactElement) => (
        <InlinePicker
          width={260}
          align={layout === "aside" ? "end" : "start"}
          stop
          trigger={trigger}
          title={field.name}
        >
          {(close) => (
            <FieldChoiceMenu
              field={field}
              members={data.members}
              value={value}
              onChange={(next) => set(field, next)}
              close={close}
            />
          )}
        </InlinePicker>
      );

      const head = (
        <span
          className={styles.rowLabel}
          title={field.description || undefined}
        >
          {field.icon && (
            <Icon
              icon={field.icon}
              width={13}
              aria-hidden="true"
              className={fieldStyles.labelIcon}
            />
          )}
          {field.name}
        </span>
      );

      if (layout === "aside") {
        return (
          <div key={field.id} className={styles.labels}>
            <div className={styles.labelsHead}>
              {head}
              {canEdit &&
                picker(
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={field.name}
                    title={field.name}
                    data-field-nav
                  >
                    <Icon icon="lucide:plus" width={14} />
                  </button>,
                )}
            </div>
            {picked.length > 0 && (
              <div className={`${styles.labelsList} ${styles.labelsListAside}`}>
                {chips}
              </div>
            )}
          </div>
        );
      }

      return (
        <div key={field.id} className={styles.row}>
          {head}
          <div className={`${styles.rowValue} ${styles.labelsList}`}>
            {chips}
            {canEdit &&
              picker(
                <button
                  type="button"
                  className={styles.addLabel}
                  aria-label={field.name}
                  title={field.name}
                  data-field-nav
                >
                  <Icon icon="lucide:plus" width={13} aria-hidden="true" />
                  {picked.length === 0 && (
                    <span>{t("customFields.noValue")}</span>
                  )}
                </button>,
              )}
          </div>
        </div>
      );
    }

    // A choice, several choices or a person: the same menu the labels and
    // the assignee use. A single pick commits and closes, a multi list
    // writes on every toggle.
    if (field.type === "SELECT" || field.type === "USER") {
      return (
        <Row
          key={field.id}
          label={field.name}
          icon={field.icon}
          hint={field.description}
        >
          <InlinePicker width={260} stop trigger={trigger} title={field.name}>
            {(close) => (
              <FieldChoiceMenu
                field={field}
                members={data.members}
                value={value}
                onChange={(next) => set(field, next)}
                close={close}
              />
            )}
          </InlinePicker>
        </Row>
      );
    }

    // TEXT, URL, NUMBER and the three date modes: typed in, saved with the
    // button so a value that is still being typed never reaches the server.
    // An instant is entered in the person's own zone and stored in UTC.
    return (
      <Row
        key={field.id}
        label={field.name}
        icon={field.icon}
        hint={field.description}
      >
        <InlinePicker width={260} stop trigger={trigger} title={field.name}>
          {(close) => (
            <ValuePopover<string>
              initialValue={toInputString(field, value, timeZone)}
              clearable={value !== null}
              onConfirm={(next) =>
                set(field, fromInputString(field, next, timeZone))
              }
              onClear={() => set(field, null)}
              close={close}
            >
              {(pending, setPending) => (
                <Input
                  variant={inputVariant(field)}
                  step={inputStep(field)}
                  iconRight={
                    field.type === "NUMBER" && field.numberUnit ? (
                      <span>{field.numberUnit}</span>
                    ) : undefined
                  }
                  size="sm"
                  value={pending}
                  autoFocus
                  aria-label={field.name}
                  onChange={(e) => setPending(e.target.value)}
                />
              )}
            </ValuePopover>
          )}
        </InlinePicker>
      </Row>
    );
  };

  const rows = <>{fields.map(rowFor)}</>;
  if (layout === "aside") return rows;

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <Icon icon="lucide:text-cursor-input" width={15} aria-hidden="true" />
        <h3 className={styles.sectionTitle}>{t("customFields.title")}</h3>
      </header>
      <div className={styles.rowGrid}>{rows}</div>
    </section>
  );
}
