"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import { useModal } from "@/lib/context";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import styles from "./confirmDialog.module.scss";

export interface ConfirmOptions {
  title: string;
  /** What's at stake. The title asks, this sentence explains. */
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  /**
   * The confirmation leads to a loss (discard, delete) and is rendered in
   * red. Default: false.
   */
  danger?: boolean;
}

/**
 * Confirmation prompt as a dialog instead of `window.confirm`.
 *
 * Used everywhere the answer needs to be awaited without blocking the
 * browser: `confirm()` blocks the main thread and can't be translated or
 * styled — and some browsers let users permanently suppress the dialog,
 * which would silently turn the prompt into a "Cancel".
 *
 * ```tsx
 * const confirm = useConfirm()
 * if (await confirm({ title, confirmLabel, cancelLabel })) …
 * ```
 *
 * Escape and backdrop both count as "Cancel": a dismissed dialog must not
 * trigger anything.
 */
export function useConfirm() {
  const { openModal } = useModal();

  return useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // The dialog can end in two ways — answered or dismissed.
        // Both converge here, and the first one wins.
        let answered = false;
        const settle = (value: boolean) => {
          if (answered) return;
          answered = true;
          resolve(value);
        };

        openModal(
          ({ close }) => (
            <ConfirmDialog
              options={options}
              onAnswer={(value) => {
                settle(value);
                close();
              }}
            />
          ),
          { label: options.title, onClose: () => settle(false) },
        );
      }),
    [openModal],
  );
}

function ConfirmDialog({
  options,
  onAnswer,
}: {
  options: ConfirmOptions;
  onAnswer: (value: boolean) => void;
}) {
  // Enter answers "yes" directly — the confirm button is already the
  // dialog's primary/default action (`variant="primary"`), same as Enter
  // activating the default button in a native dialog. No `hasOpenModal`
  // guard: that flag would already be true just from this dialog being on
  // the stack, so it can't tell "am I the topmost" apart — not worth the
  // extra plumbing since nothing in this app opens a modal on top of an
  // open confirmation.
  useShortcut("enter", () => onAnswer(true));

  return (
    // Narrower than a form modal: this only holds two sentences and two buttons.
    <Modal width={440}>
      <ModalHeader title={options.title} divider={false} />

      {options.description && (
        <ModalBody className={styles.body}>
          <p className={styles.text}>{options.description}</p>
        </ModalBody>
      )}

      <ModalFooter divider={false}>
        <Button variant="text" onClick={() => onAnswer(false)}>
          {options.cancelLabel}
        </Button>
        <Button
          variant="primary"
          className={options.danger ? styles.danger : undefined}
          onClick={() => onAnswer(true)}
        >
          {options.confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
