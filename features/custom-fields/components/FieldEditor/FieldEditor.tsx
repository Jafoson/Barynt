"use client";

import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import {
  draftOf,
  problemOfDraft,
  valueOfDraft,
} from "@/features/custom-fields/fieldInput";
import type { CustomFieldRow } from "@/features/custom-fields/types";
import { ValuePopover } from "@/features/issues/components/ValuePopover/ValuePopover";
import type {
  FieldValue,
  NumberConfig,
  SelectConfig,
  TextConfig,
} from "@/lib/custom-fields/types";
import { fullName } from "@/lib/utils/string";
import type { User } from "@/types";
import styles from "./fieldEditor.module.scss";

interface Props {
  field: CustomFieldRow;
  value: FieldValue | null;
  members: User[];
  /** Sets the answer, or clears it with `null`. */
  onSave: (value: FieldValue | null) => void;
  /** From `InlinePicker`'s render prop. */
  close: () => void;
}

/**
 * The body of the popover that changes one answer. A choice and a person are picked from a list
 * (choosing is the confirmation, as everywhere else); a text, a number, a day and an address are
 * typed and saved with the button, so a half-typed value never reaches the server, and what cannot
 * be saved says why beside the box.
 */
export function FieldEditor({ field, value, members, onSave, close }: Props) {
  const t = useTranslations();

  if (field.type === "select") {
    const { options } = field.config as SelectConfig;
    return (
      <SelectMenu
        items={[
          { value: null, label: t("customFields.none") },
          ...options.map((option) => ({
            value: option.id,
            label: option.label,
            icon: option.color ? (
              <span
                className={styles.dot}
                style={
                  { "--option-color": option.color } as React.CSSProperties
                }
                aria-hidden="true"
              />
            ) : undefined,
          })),
        ]}
        value={value}
        onPick={(picked) => {
          onSave(picked as string | null);
          close();
        }}
        onClose={close}
      />
    );
  }

  if (field.type === "user") {
    return (
      <SelectMenu
        items={[
          {
            value: null,
            label: t("customFields.none"),
            icon: <Avatar avatar={null} size={18} placeholder />,
          },
          ...members.map((member) => ({
            value: member.id,
            label: fullName(member),
            icon: <Avatar avatar={member} size={18} />,
          })),
        ]}
        value={value}
        onPick={(picked) => {
          onSave(picked as string | null);
          close();
        }}
        onClose={close}
        searchable
      />
    );
  }

  return (
    <ValuePopover<string>
      initialValue={draftOf(value)}
      clearable={value !== null}
      problem={(text) => problemOfDraft(field, text)}
      onConfirm={(text) => onSave(valueOfDraft(field, text))}
      onClear={() => onSave(null)}
      close={close}
    >
      {(text, setText) => {
        const common = {
          size: "sm" as const,
          value: text,
          autoFocus: true,
          "aria-label": field.name,
        };
        if (field.type === "number") {
          const { integer, min, max } = field.config as NumberConfig;
          return (
            <Input
              {...common}
              variant="number"
              step={integer ? 1 : "any"}
              min={min ?? undefined}
              max={max ?? undefined}
              onChange={(e) => setText(e.target.value)}
            />
          );
        }
        if (field.type === "date") {
          return (
            <Input
              {...common}
              variant="date"
              onChange={(e) => setText(e.target.value)}
            />
          );
        }
        return (
          <Input
            {...common}
            variant={field.type === "url" ? "url" : "text"}
            maxLength={
              field.type === "text"
                ? (field.config as TextConfig).maxLength
                : undefined
            }
            onChange={(e) => setText(e.target.value)}
          />
        );
      }}
    </ValuePopover>
  );
}
