"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import styles from "./acknowledgeModal.module.scss";

interface Props {
  title: string;
  confirmLabel: string;
  /** The warning and the checkbox that answers it. */
  notice: (state: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled: boolean;
  }) => ReactNode;
  /** Does it. `null` = done, otherwise the error text to show. */
  onConfirm: () => Promise<string | null>;
  close: () => void;
  /** A bottom sheet (phone) instead of a dialog. */
  sheet?: boolean;
}

/**
 * A warning that has to be answered with a yes before anything happens: a dialog
 * from a tablet up, a bottom sheet on a phone. The button stays off until the box
 * is ticked (`WarningBox` is the usual `notice`). The server asks for the same yes,
 * so this is the question, not the protection.
 */
export function AcknowledgeModal({
  title,
  confirmLabel,
  notice,
  onConfirm,
  close,
  sheet,
}: Props) {
  const t = useTranslations();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  const confirm = () => {
    if (!checked || isPending) return;
    startTransition(async () => {
      const failure = await onConfirm();
      if (failure) setError(failure);
      else close();
    });
  };

  return (
    <Modal
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

      <ModalBody ref={bodyRef} className={styles.body}>
        {notice({ checked, onChange: setChecked, disabled: isPending })}
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}
      </ModalBody>

      <ModalFooter>
        {!sheet && (
          <Button variant="ghost" disabled={isPending} onClick={close}>
            {t("actions.cancel")}
          </Button>
        )}
        <Button
          variant="primary"
          disabled={!checked || isPending}
          onClick={confirm}
        >
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
