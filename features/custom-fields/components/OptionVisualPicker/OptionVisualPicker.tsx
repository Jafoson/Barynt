"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { ColorPicker } from "@/components/ui/atoms/ColorPicker/ColorPicker";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { requestOptionImageUpload } from "@/features/custom-fields/actions";
import { OptionVisual } from "@/features/custom-fields/components/OptionVisual/OptionVisual";
import {
  CUSTOM_FIELD_ICONS,
  FIELD_LIMITS,
  type OptionVisualKind,
} from "@/lib/custom-fields";
import { AVATAR_MIME_EXTENSIONS } from "@/lib/storage/validation";
import styles from "./optionVisualPicker.module.scss";

export interface OptionVisualValue {
  icon: string | null;
  /** A hex colour such as `#ff0000`. */
  color: string | null;
  /** The storage key sent back to the server on save. */
  image: string | null;
  /** What the browser shows: the stored image's URL, or a local preview. */
  imageUrl: string | null;
}

interface Props {
  /** What the field lets a choice carry — only these are offered. */
  kinds: OptionVisualKind[];
  value: OptionVisualValue;
  workspaceId: string;
  projectId?: string | null;
  onChange: (next: OptionVisualValue) => void;
}

/**
 * Puts an icon or an image in front of one choice of a field. The icons are
 * the fixed list (`CUSTOM_FIELD_ICONS`); an image goes straight from the
 * browser to storage through a presigned URL and its key is kept with the
 * choice until the field is saved.
 */
export function OptionVisualPicker({
  kinds,
  value,
  workspaceId,
  projectId,
  onChange,
}: Props) {
  const t = useTranslations();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Which kind is open when more than one is allowed: the one the choice
  // already uses, else the first.
  const initialKind: OptionVisualKind =
    value.imageUrl && kinds.includes("image")
      ? "image"
      : value.icon && kinds.includes("icon")
        ? "icon"
        : value.color && kinds.includes("color")
          ? "color"
          : (kinds[0] ?? "icon");
  const [kind, setKind] = useState<OptionVisualKind>(initialKind);
  const kindLabel = (k: OptionVisualKind) =>
    k === "icon"
      ? t("customFields.visualIcon")
      : k === "image"
        ? t("customFields.visualImage")
        : t("customFields.visualColor");

  const upload = async (file: File) => {
    setError("");
    if (!(file.type in AVATAR_MIME_EXTENSIONS)) {
      setError(t("customFields.imageType"));
      return;
    }
    if (file.size > FIELD_LIMITS.imageBytes) {
      setError(t("customFields.imageTooLarge"));
      return;
    }
    setBusy(true);
    try {
      const requested = await requestOptionImageUpload({
        workspaceId,
        projectId: projectId ?? null,
        contentType: file.type,
        contentLength: file.size,
      });
      if ("error" in requested) {
        setError(t("customFields.imageFailed"));
        return;
      }
      let put: Response;
      try {
        put = await fetch(requested.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
      } catch {
        setError(t("customFields.imageFailed"));
        return;
      }
      if (!put.ok) {
        setError(t("customFields.imageFailed"));
        return;
      }
      onChange({
        ...value,
        icon: null,
        image: requested.key,
        imageUrl: URL.createObjectURL(file),
      });
    } finally {
      setBusy(false);
    }
  };

  const has = Boolean(value.icon || value.imageUrl || value.color);

  return (
    <InlinePicker
      width={280}
      trigger={
        <button
          type="button"
          className={styles.trigger}
          title={t("customFields.optionVisual")}
          aria-label={t("customFields.optionVisual")}
        >
          {has ? (
            <OptionVisual option={value} size={18} />
          ) : (
            <Icon icon="lucide:image-plus" width={16} />
          )}
        </button>
      }
    >
      {(close) => (
        <div className={styles.panel}>
          {/* Several kinds allowed: pick the kind first, like the other
              settings that offer more than one way. */}
          {kinds.length > 1 && (
            <SegmentedControl
              variant="surface"
              value={kind}
              onChange={(v) => setKind(v as OptionVisualKind)}
              items={kinds.map((k) => ({ value: k, label: kindLabel(k) }))}
            />
          )}

          {kind === "icon" && kinds.includes("icon") && (
            <div className={styles.grid}>
              {CUSTOM_FIELD_ICONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={styles.cell}
                  aria-pressed={value.icon === name && !value.image}
                  title={name.replace("lucide:", "")}
                  aria-label={name.replace("lucide:", "")}
                  onClick={() => {
                    onChange({
                      ...value,
                      icon: name,
                      image: null,
                      imageUrl: null,
                    });
                    close();
                  }}
                >
                  <Icon icon={name} width={16} />
                </button>
              ))}
            </div>
          )}

          {kind === "color" && kinds.includes("color") && (
            <div>
              <ColorPicker
                size="sm"
                value={value.color ?? undefined}
                onChange={(color) => {
                  onChange({ ...value, color });
                  close();
                }}
                swatchLabel={(c) => c}
              />
            </div>
          )}

          {kind === "image" && kinds.includes("image") && (
            <>
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="elevated"
                  size="sm"
                  disabled={busy}
                  icon={<Icon icon="lucide:upload" width={14} />}
                  onClick={() => input.current?.click()}
                >
                  {t("customFields.uploadImage")}
                </Button>
              </div>
              <p className={styles.hint}>{t("customFields.imageHint")}</p>
            </>
          )}

          {has && (
            <div className={styles.actions}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  onChange({
                    icon: null,
                    color: null,
                    image: null,
                    imageUrl: null,
                  });
                  close();
                }}
              >
                {t("customFields.removeVisual")}
              </Button>
            </div>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <input
            ref={input}
            type="file"
            accept={Object.keys(AVATAR_MIME_EXTENSIONS).join(",")}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload(file).then(() => undefined);
            }}
          />
        </div>
      )}
    </InlinePicker>
  );
}
