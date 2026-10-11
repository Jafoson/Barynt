"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/atoms/Input/Input";
import { linkProblem } from "@/features/custom-fields/input";
import { ValuePopover } from "@/features/issues/components/ValuePopover/ValuePopover";
import { FIELD_LIMITS, type FieldDefinition } from "@/lib/custom-fields";

interface Props {
  field: FieldDefinition;
  /** What the input starts with (see `toInputString`). */
  url: string;
  title: string;
  clearable: boolean;
  /** `url` is `null` when only the scheme was left. */
  onConfirm: (url: string | null, title: string | null) => void;
  onClear: () => void;
  close: () => void;
}

/** The popover of a link field: the link, and a title of its own. */
export function LinkValuePopover({
  field,
  url,
  title,
  clearable,
  onConfirm,
  onClear,
  close,
}: Props) {
  const t = useTranslations();
  return (
    <ValuePopover<{ url: string; title: string }>
      initialValue={{ url, title }}
      clearable={clearable}
      validate={(next) => {
        const problem = linkProblem(field, next.url);
        return problem ? t(`customFields.${problem}`) : null;
      }}
      onConfirm={(next) => {
        const link = next.url.trim();
        const bare = /^https?:\/\/$/i.test(link);
        const text = next.title.trim();
        onConfirm(
          link === "" || bare ? null : link,
          link === "" || bare || text === "" ? null : text,
        );
      }}
      onClear={onClear}
      close={close}
    >
      {(pending, setPending) => (
        <>
          <Input
            size="sm"
            value={pending.url}
            autoFocus
            aria-label={field.name}
            onChange={(e) => setPending({ ...pending, url: e.target.value })}
          />
          <Input
            size="sm"
            value={pending.title}
            maxLength={FIELD_LIMITS.linkTitle}
            placeholder={
              field.linkFetchTitle
                ? t("customFields.linkTitlePlaceholder")
                : t("customFields.linkTitle")
            }
            aria-label={t("customFields.linkTitle")}
            onChange={(e) => setPending({ ...pending, title: e.target.value })}
          />
        </>
      )}
    </ValuePopover>
  );
}
