"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import { Input } from "@/components/ui/atoms/Input/Input";
import { NativeSelect } from "@/components/ui/atoms/NativeSelect/NativeSelect";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import {
  ModalFooter,
  ModalShortcut,
} from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import {
  createCustomField,
  updateCustomField,
} from "@/features/custom-fields/actions";
import { OptionVisualPicker } from "@/features/custom-fields/components/OptionVisualPicker/OptionVisualPicker";
import type { CustomFieldRow } from "@/features/custom-fields/types";
import {
  CUSTOM_FIELD_ICONS,
  CUSTOM_FIELD_TYPES,
  type CustomFieldType,
  DATE_MODES,
  type DateMode,
  FIELD_LIMITS,
  NUMBER_DECIMALS_RANGE,
  NUMBER_MODES,
  type NumberMode,
  OPTION_VISUALS,
  type OptionVisualKind,
  usesOptions,
} from "@/lib/custom-fields";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import styles from "./customFieldModal.module.scss";

export interface CustomFieldModalProps {
  workspaceId: string;
  /** The project the new field belongs to; without it a workspace field. */
  projectId?: string | null;
  /** Set = editing, unset = creating. */
  field?: CustomFieldRow;
  onDone: () => void;
  close: () => void;
  sheet?: boolean;
}

interface OptionDraft {
  /** Existing choices keep their id so stored values stay attached. */
  id?: string;
  label: string;
  icon: string | null;
  color: string | null;
  image: string | null;
  imageUrl: string | null;
}

/**
 * Create and edit share one dialog. When editing, the type is fixed (values
 * already stored under it would not fit another) and so is the key (what
 * integrations address the field by) — both are shown, not offered.
 */
export function CustomFieldModal({
  workspaceId,
  projectId,
  field,
  onDone,
  close,
  sheet,
}: CustomFieldModalProps) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  const [name, setName] = useState(field?.name ?? "");
  const [description, setDescription] = useState(field?.description ?? "");
  const [type, setType] = useState<CustomFieldType>(field?.type ?? "TEXT");
  const [icon, setIcon] = useState<string | null>(field?.icon ?? null);
  const [dateMode, setDateMode] = useState<DateMode>(field?.dateMode ?? "DATE");
  const [allowCustom, setAllowCustom] = useState(
    field?.allowCustomOptions ?? false,
  );
  const [numberMode, setNumberMode] = useState<NumberMode>(
    field?.numberMode ?? "FREE",
  );
  const [numberDecimals, setNumberDecimals] = useState(
    field?.numberDecimals ?? NUMBER_DECIMALS_RANGE.default,
  );
  const [numberUnit, setNumberUnit] = useState(field?.numberUnit ?? "");
  // What a choice may carry besides its name.
  const [visuals, setVisuals] = useState<OptionVisualKind[]>(
    field?.optionVisuals ?? [],
  );
  const [options, setOptions] = useState<OptionDraft[]>(
    field?.options.map((o) => ({
      id: o.id,
      label: o.label,
      icon: o.icon ?? null,
      color: o.color ?? null,
      image: o.image ?? null,
      imageUrl: o.imageUrl ?? null,
    })) ?? [],
  );
  const [error, setError] = useState("");

  const kindLabel = (kind: OptionVisualKind) =>
    kind === "icon"
      ? t("customFields.visualIcon")
      : kind === "image"
        ? t("customFields.visualImage")
        : t("customFields.visualColor");

  const trimmed = name.trim();
  const hasOptions = usesOptions(type);
  const title = field
    ? t("customFields.editTitle")
    : t("customFields.newTitle");

  const setOption = (index: number, label: string) =>
    setOptions((list) =>
      list.map((o, i) => (i === index ? { ...o, label } : o)),
    );

  const submit = () => {
    if (!trimmed || isPending) return;
    const choices = hasOptions
      ? options
          .map((o) => ({
            id: o.id,
            label: o.label.trim(),
            icon: o.icon,
            color: o.color,
            image: o.image,
          }))
          .filter((o) => o.label !== "")
      : [];

    startTransition(async () => {
      try {
        const result = field
          ? await updateCustomField(field.id, {
              name: trimmed,
              description,
              icon,
              ...(type === "NUMBER"
                ? {
                    numberMode,
                    numberDecimals:
                      numberMode === "DECIMAL" ? numberDecimals : null,
                    numberUnit,
                  }
                : {}),
              ...(hasOptions
                ? {
                    options: choices,
                    allowCustomOptions: allowCustom,
                    optionVisuals: visuals,
                  }
                : {}),
            })
          : await createCustomField({
              workspaceId,
              projectId: projectId ?? null,
              name: trimmed,
              description,
              type,
              options: choices,
              icon,
              ...(type === "DATE" ? { dateMode } : {}),
              ...(type === "NUMBER"
                ? {
                    numberMode,
                    numberDecimals:
                      numberMode === "DECIMAL" ? numberDecimals : null,
                    numberUnit,
                  }
                : {}),
              ...(hasOptions
                ? { allowCustomOptions: allowCustom, optionVisuals: visuals }
                : {}),
            });
        if ("error" in result) {
          setError(t(`customFields.errors.${result.error}`));
          return;
        }
        onDone();
        close();
      } catch {
        setError(t("customFields.errors.failed"));
      }
    });
  };

  return (
    <Modal
      width={480}
      variant={sheet ? "sheet" : "dialog"}
      style={sheet ? swipe.style : undefined}
      {...(sheet ? swipe.handlers : {})}
    >
      {sheet ? (
        <SheetHeader
          title={title}
          onClose={close}
          closeLabel={t("actions.cancel")}
        />
      ) : (
        <ModalHeader
          title={title}
          onClose={close}
          closeLabel={t("actions.cancel")}
        />
      )}

      <ModalBody ref={bodyRef}>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            label={t("customFields.name")}
            value={name}
            autoFocus={!sheet}
            maxLength={FIELD_LIMITS.name}
            placeholder={t("customFields.namePlaceholder")}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
          />

          <Input
            label={t("customFields.description")}
            value={description}
            maxLength={FIELD_LIMITS.description}
            placeholder={t("customFields.descriptionPlaceholder")}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("customFields.type")}</span>
            <NativeSelect
              label={t("customFields.type")}
              value={type}
              disabled={Boolean(field)}
              onChange={(value) => setType(value as CustomFieldType)}
              items={CUSTOM_FIELD_TYPES.map((value) => ({
                value,
                label: t(`customFields.types.${value}`),
              }))}
            />
            {field && (
              <p className={styles.hint}>{t("customFields.typeLocked")}</p>
            )}
          </div>

          {type === "NUMBER" && (
            <>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t("customFields.numberMode")}
                </span>
                <NativeSelect
                  label={t("customFields.numberMode")}
                  value={numberMode}
                  onChange={(value) => setNumberMode(value as NumberMode)}
                  items={NUMBER_MODES.map((value) => ({
                    value,
                    label: t(`customFields.numberModes.${value}`),
                  }))}
                />
              </div>
              {numberMode === "DECIMAL" && (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>
                    {t("customFields.numberDecimals")}
                  </span>
                  <NativeSelect
                    label={t("customFields.numberDecimals")}
                    value={String(numberDecimals)}
                    onChange={(value) => setNumberDecimals(Number(value))}
                    items={Array.from(
                      {
                        length:
                          NUMBER_DECIMALS_RANGE.max -
                          NUMBER_DECIMALS_RANGE.min +
                          1,
                      },
                      (_, i) => {
                        const n = NUMBER_DECIMALS_RANGE.min + i;
                        return { value: String(n), label: String(n) };
                      },
                    )}
                  />
                </div>
              )}
              <Input
                label={t("customFields.numberUnit")}
                value={numberUnit}
                maxLength={FIELD_LIMITS.numberUnit}
                placeholder={t("customFields.numberUnitPlaceholder")}
                onChange={(e) => setNumberUnit(e.target.value)}
              />
            </>
          )}

          {type === "DATE" && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                {t("customFields.dateMode")}
              </span>
              <NativeSelect
                label={t("customFields.dateMode")}
                value={dateMode}
                disabled={Boolean(field)}
                onChange={(value) => setDateMode(value as DateMode)}
                items={DATE_MODES.map((value) => ({
                  value,
                  label: t(`customFields.dateModes.${value}`),
                }))}
              />
              {field && (
                <p className={styles.hint}>
                  {t("customFields.dateModeLocked")}
                </p>
              )}
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("customFields.icon")}</span>
            <div className={styles.icons}>
              <button
                type="button"
                className={styles.iconBtn}
                aria-pressed={icon === null}
                title={t("customFields.noIcon")}
                aria-label={t("customFields.noIcon")}
                onClick={() => setIcon(null)}
              >
                <Icon icon="lucide:ban" width={16} />
              </button>
              {CUSTOM_FIELD_ICONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={styles.iconBtn}
                  aria-pressed={icon === name}
                  title={name.replace("lucide:", "")}
                  aria-label={name.replace("lucide:", "")}
                  onClick={() => setIcon(name)}
                >
                  <Icon icon={name} width={16} />
                </button>
              ))}
            </div>
          </div>

          {field && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t("customFields.key")}</span>
              <span className={styles.key}>{field.key}</span>
            </div>
          )}

          {hasOptions && (
            <div className={styles.field}>
              <Switch
                checked={allowCustom}
                onChange={setAllowCustom}
                label={t("customFields.allowCustom")}
              />
            </div>
          )}

          {hasOptions && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                {t("customFields.optionVisuals")}
              </span>
              <div className={styles.kinds}>
                {OPTION_VISUALS.map((kind) => (
                  <Chip
                    key={kind}
                    type="filter"
                    selected={visuals.includes(kind)}
                    onClick={() =>
                      setVisuals((list) =>
                        list.includes(kind)
                          ? list.filter((k) => k !== kind)
                          : [...list, kind],
                      )
                    }
                  >
                    {kindLabel(kind)}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {hasOptions && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                {t("customFields.options")}
              </span>
              <div className={styles.options}>
                {options.map((option, index) => (
                  <div
                    className={styles.option}
                    key={option.id ?? `new-${index}`}
                  >
                    {visuals.length > 0 && (
                      <OptionVisualPicker
                        kinds={visuals}
                        value={option}
                        workspaceId={workspaceId}
                        projectId={projectId}
                        onChange={(visual) =>
                          setOptions((list) =>
                            list.map((o, i) =>
                              i === index ? { ...o, ...visual } : o,
                            ),
                          )
                        }
                      />
                    )}
                    <div className={styles.optionName}>
                      <Input
                        aria-label={t("customFields.optionPlaceholder")}
                        value={option.label}
                        maxLength={FIELD_LIMITS.optionLabel}
                        placeholder={t("customFields.optionPlaceholder")}
                        onChange={(e) => setOption(index, e.target.value)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      icon={<Icon icon="lucide:x" width={15} />}
                      title={t("customFields.removeOption")}
                      aria-label={t("customFields.removeOption")}
                      onClick={() =>
                        setOptions((list) => list.filter((_, i) => i !== index))
                      }
                    />
                  </div>
                ))}
                {options.length < FIELD_LIMITS.options && (
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      icon={<Icon icon="lucide:plus" width={15} />}
                      onClick={() =>
                        setOptions((list) => [
                          ...list,
                          {
                            label: "",
                            icon: null,
                            color: null,
                            image: null,
                            imageUrl: null,
                          },
                        ])
                      }
                    >
                      {t("customFields.addOption")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          {/* Submit via Enter — the button below sits outside the form. */}
          <button type="submit" hidden />
        </form>
      </ModalBody>

      <ModalFooter hint={<ModalShortcut keys="enter" />}>
        {!sheet && (
          <Button variant="ghost" disabled={isPending} onClick={close}>
            {t("actions.cancel")}
          </Button>
        )}
        <Button
          variant="primary"
          disabled={!trimmed || isPending}
          onClick={submit}
        >
          {field ? t("actions.save") : t("actions.create")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
