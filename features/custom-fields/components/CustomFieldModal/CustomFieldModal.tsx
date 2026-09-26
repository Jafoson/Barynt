"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Input } from "@/components/ui/atoms/Input/Input";
import { Select } from "@/components/ui/atoms/Select/Select";
import { Textarea } from "@/components/ui/atoms/Textarea/Textarea";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import {
  changeCustomField,
  createCustomField,
} from "@/features/custom-fields/actions";
import { FieldIconPicker } from "@/features/custom-fields/components/FieldIconPicker/FieldIconPicker";
import {
  type FieldForm,
  groupIssues,
  initialForm,
  isDirty,
  optionUid,
  TYPE_CHOICES,
  toChangeInput,
  toCreateInput,
} from "@/features/custom-fields/formState";
import type {
  CustomFieldManageRow,
  CustomFieldScope,
} from "@/features/custom-fields/types";
import { deriveFieldKey } from "@/lib/custom-fields/config";
import {
  MAX_FIELD_DESCRIPTION_LENGTH,
  MAX_FIELD_NAME_LENGTH,
  MAX_OPTION_LABEL_LENGTH,
  MAX_SELECT_OPTIONS,
  MAX_TEXT_LENGTH,
} from "@/lib/custom-fields/types";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import styles from "./customFieldModal.module.scss";

export interface CustomFieldModalProps {
  /** Where a new field applies. Not used when a field is changed: it stays where it is. */
  scope: CustomFieldScope;
  /** Set = changing this field, unset = a new one. */
  field?: CustomFieldManageRow;
  onDone: () => void;
  close: () => void;
  /** A bottom sheet (phone) instead of a dialog. */
  sheet?: boolean;
}

/**
 * A new field, or a change to one. The key and the type are asked for when the field is made and
 * cannot be changed after: the API and a plugin's manifest use the key, and the answers would no
 * longer fit a new type. What the type allows (a length, a range, the options of a choice) can
 * change; taking an option away that an issue still answers with is refused by the server, which
 * says so under the options.
 */
export function CustomFieldModal({
  scope,
  field,
  onDone,
  close,
  sheet,
}: CustomFieldModalProps) {
  const t = useTranslations();
  const idPrefix = useId();
  const formId = `${idPrefix}-form`;
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);
  const [isPending, startTransition] = useTransition();
  const [start] = useState(() => initialForm(field));
  const [form, setForm] = useState(start);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");

  const change = <K extends keyof FieldForm>(key: K, value: FieldForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setIssues(({ [key as string]: _gone, ...rest }) => rest);
    setFailure("");
  };
  const setOption = (uid: string, patch: { label: string }) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option) =>
        option.uid === uid ? { ...option, ...patch } : option,
      ),
    }));
    setIssues(({ config: _gone, ...rest }) => rest);
    setFailure("");
  };

  const dirty = isDirty(start, form) && form.name.trim() !== "";
  const title = field
    ? t("customFields.editTitle", { name: field.name })
    : t("customFields.newTitle");

  const submit = () => {
    if (!dirty || isPending) return;
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createCustomField>>;
      try {
        result = field
          ? await changeCustomField(field.id, toChangeInput(form))
          : await createCustomField(scope, toCreateInput(form));
      } catch {
        setIssues({});
        setFailure(t("customFields.saveFailed"));
        return;
      }
      if ("error" in result) {
        setIssues(groupIssues(result.issues));
        setFailure(result.error);
        return;
      }
      onDone();
      close();
    });
  };

  const optionsBlock = form.type === "select" && (
    <fieldset className={styles.options} disabled={isPending}>
      <legend className={styles.legend}>{t("customFields.options")}</legend>
      <ul className={styles.optionList}>
        {form.options.map((option, index) => (
          <li key={option.uid} className={styles.optionRow}>
            <Input
              id={`${idPrefix}-option-${option.uid}`}
              label={t("customFields.optionLabel", { number: index + 1 })}
              value={option.label}
              maxLength={MAX_OPTION_LABEL_LENGTH}
              onChange={(e) => setOption(option.uid, { label: e.target.value })}
            />
            <Button
              variant="text"
              size="sm"
              type="button"
              icon={<Icon icon="lucide:trash-2" width={14} />}
              aria-label={t("customFields.removeOption", {
                name: option.label,
              })}
              title={t("customFields.removeOption", { name: option.label })}
              onClick={() =>
                change(
                  "options",
                  form.options.filter((o) => o.uid !== option.uid),
                )
              }
            />
          </li>
        ))}
      </ul>
      <Button
        variant="text"
        size="sm"
        type="button"
        icon={<Icon icon="lucide:plus" width={14} />}
        disabled={form.options.length >= MAX_SELECT_OPTIONS}
        onClick={() =>
          change("options", [
            ...form.options,
            { uid: optionUid(), id: null, label: "", color: null },
          ])
        }
      >
        {t("customFields.addOption")}
      </Button>
      {issues.config && <p className={styles.error}>{issues.config}</p>}
    </fieldset>
  );

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
          closeLabel={t("actions.close")}
        />
      ) : (
        <ModalHeader
          title={title}
          onClose={close}
          closeLabel={t("actions.close")}
        />
      )}

      <ModalBody ref={bodyRef}>
        <form
          id={formId}
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            id={`${idPrefix}-name`}
            label={t("customFields.name")}
            value={form.name}
            autoFocus={!sheet}
            maxLength={MAX_FIELD_NAME_LENGTH}
            disabled={isPending}
            error={issues.name}
            onChange={(e) => change("name", e.target.value)}
          />

          {!field && (
            <Input
              id={`${idPrefix}-key`}
              label={t("customFields.key")}
              hint={t("customFields.keyHint")}
              value={form.key}
              placeholder={form.name ? deriveFieldKey(form.name) : ""}
              disabled={isPending}
              error={issues.key}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => change("key", e.target.value.toLowerCase())}
            />
          )}

          <Select
            id={`${idPrefix}-type`}
            label={t("customFields.type")}
            hint={field ? t("customFields.typeFixed") : undefined}
            value={form.type}
            disabled={isPending || !!field}
            error={issues.type}
            onChange={(e) =>
              change("type", e.target.value as FieldForm["type"])
            }
          >
            {TYPE_CHOICES.map((type) => (
              <option key={type} value={type}>
                {t(`customFields.types.${type}`)}
              </option>
            ))}
          </Select>

          <FieldIconPicker
            value={form.icon}
            type={form.type}
            disabled={isPending}
            onChange={(icon) => change("icon", icon)}
          />

          {form.type === "text" && (
            <Input
              id={`${idPrefix}-length`}
              variant="number"
              label={t("customFields.maxLength")}
              value={form.maxLength}
              min={1}
              max={MAX_TEXT_LENGTH}
              step={1}
              disabled={isPending}
              error={issues.config}
              onChange={(e) => change("maxLength", e.target.value)}
            />
          )}

          {form.type === "number" && (
            <div className={styles.numberSettings}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={form.integer}
                  disabled={isPending}
                  onChange={(e) => change("integer", e.target.checked)}
                />
                <span>{t("customFields.integer")}</span>
              </label>
              <div className={styles.range}>
                <Input
                  id={`${idPrefix}-min`}
                  variant="number"
                  label={t("customFields.min")}
                  value={form.min}
                  step="any"
                  disabled={isPending}
                  onChange={(e) => change("min", e.target.value)}
                />
                <Input
                  id={`${idPrefix}-max`}
                  variant="number"
                  label={t("customFields.max")}
                  value={form.max}
                  step="any"
                  disabled={isPending}
                  onChange={(e) => change("max", e.target.value)}
                />
              </div>
              {issues.config && <p className={styles.error}>{issues.config}</p>}
            </div>
          )}

          {optionsBlock}

          <Textarea
            id={`${idPrefix}-description`}
            label={t("customFields.description")}
            value={form.description}
            rows={2}
            maxLength={MAX_FIELD_DESCRIPTION_LENGTH}
            disabled={isPending}
            error={issues.description}
            onChange={(e) => change("description", e.target.value)}
          />

          {failure && (
            <p className={styles.error} role="alert">
              <Icon icon="lucide:circle-alert" width={14} />
              {failure}
            </p>
          )}
        </form>
      </ModalBody>

      <ModalFooter>
        {!sheet && (
          <Button variant="ghost" disabled={isPending} onClick={close}>
            {t("actions.cancel")}
          </Button>
        )}
        <Button
          variant="primary"
          type="submit"
          form={formId}
          disabled={!dirty || isPending}
        >
          {t("actions.save")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
