"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { ColorPicker } from "@/components/ui/atoms/ColorPicker/ColorPicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { Label } from "@/components/ui/atoms/Label/Label";
import {
  ModalFooter,
  ModalShortcut,
} from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import { createLabel, updateLabel } from "@/features/issues/actions";
import { PALETTE } from "@/lib/utils";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import styles from "./labelModal.module.scss";

/** What the dialog needs from an existing label — project as well as workspace. */
interface EditableLabel {
  id: string;
  name: string;
  color: string;
}

export interface LabelModalProps {
  workspaceId: string;
  /**
   * The project the new label should belong to. Without it, a
   * workspace-level label is created that applies in every one of its
   * projects — the same dialog, one level up. When editing, the ownership
   * is already decided anyway.
   */
  projectId?: string | null;
  /** Set = editing, unset = creating. */
  label?: EditableLabel;
  onDone: () => void;
  close: () => void;
  /** A bottom sheet (phone) instead of a dialog. */
  sheet?: boolean;
}

/**
 * Create and edit share one dialog — they're the same two fields.
 *
 * The slug is deliberately absent: when creating, the server derives it
 * from the name; when editing, it stays fixed because it's embedded in
 * filter URLs. A field you can see but not change raises more questions
 * than it answers — the list shows the slug next to it instead.
 */
export function LabelModal({
  workspaceId,
  projectId,
  label,
  onDone,
  close,
  sheet,
}: LabelModalProps) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  const [name, setName] = useState(label?.name ?? "");
  const [color, setColor] = useState(label?.color ?? PALETTE[0]);
  const [error, setError] = useState("");

  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed || isPending) return;

    startTransition(async () => {
      try {
        // `createLabel` throws (it also serves the label picker in the
        // issue), `updateLabel` reports back. Both paths end up in the
        // same line here — the dialog shouldn't have to know the
        // difference.
        if (label) {
          const result = await updateLabel(label.id, { name: trimmed, color });
          if ("error" in result) {
            setError(result.error);
            return;
          }
        } else {
          await createLabel({
            name: trimmed,
            color,
            workspaceId,
            projectId: projectId ?? null,
          });
        }
        onDone();
        close();
      } catch {
        setError(t("projectLabels.saveFailed"));
      }
    });
  };

  return (
    <Modal
      width={440}
      variant={sheet ? "sheet" : "dialog"}
      style={sheet ? swipe.style : undefined}
      {...(sheet ? swipe.handlers : {})}
    >
      {sheet ? (
        <SheetHeader
          title={
            label ? t("projectLabels.editTitle") : t("projectLabels.newTitle")
          }
          onClose={close}
          closeLabel={t("actions.cancel")}
        />
      ) : (
        <ModalHeader
          title={
            label ? t("projectLabels.editTitle") : t("projectLabels.newTitle")
          }
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
            label={t("fields.name")}
            value={name}
            autoFocus={!sheet}
            maxLength={40}
            error={error || undefined}
            placeholder={t("projectLabels.namePlaceholder")}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
          />

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("fields.color")}</span>
            <ColorPicker
              value={color}
              onChange={setColor}
              swatchLabel={(c) => t("projectLabels.pickColor", { color: c })}
            />
          </div>

          <div className={styles.preview}>
            <span className={styles.previewLabel}>
              {t("projectLabels.preview")}
            </span>
            <Label color={color} filled>
              {trimmed || t("projectLabels.namePlaceholder")}
            </Label>
          </div>

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
          {label ? t("actions.save") : t("actions.create")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
