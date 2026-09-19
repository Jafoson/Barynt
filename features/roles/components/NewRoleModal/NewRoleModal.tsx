"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Input } from "@/components/ui/atoms/Input/Input";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import styles from "./newRoleModal.module.scss";

interface NewRoleModalProps {
  /** Creates the role. `null` = done, otherwise the error text to show. */
  onCreate: (name: string, desc: string) => Promise<string | null>;
  close: () => void;
  /** A bottom sheet (phone) instead of a dialog. */
  sheet?: boolean;
}

/**
 * "New role": name and description, then create. A dialog from a tablet up,
 * a bottom sheet on a phone (`sheet`). An error from the server stays in it
 * instead of vanishing behind it.
 */
export function NewRoleModal({ onCreate, close, sheet }: NewRoleModalProps) {
  const t = useTranslations();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const failure = await onCreate(trimmed, desc.trim());
      if (failure) setError(failure);
      else close();
    });
  };

  return (
    <Modal
      variant={sheet ? "sheet" : "dialog"}
      compact={!sheet}
      style={sheet ? swipe.style : undefined}
      {...(sheet ? swipe.handlers : {})}
    >
      {sheet ? (
        <SheetHeader
          title={t("roles.newRole")}
          onClose={close}
          closeLabel={t("actions.close")}
        />
      ) : (
        <ModalHeader
          title={t("roles.newRole")}
          onClose={close}
          closeLabel={t("actions.close")}
        />
      )}

      <ModalBody ref={bodyRef} className={styles.body}>
        <Input
          autoFocus
          placeholder={t("roles.newRolePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <Input
          placeholder={t("roles.newRoleDescPlaceholder")}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </ModalBody>

      <ModalFooter>
        {!sheet && (
          <Button variant="ghost" onClick={close}>
            {t("actions.cancel")}
          </Button>
        )}
        <Button
          variant="primary"
          onClick={submit}
          disabled={pending || !name.trim()}
        >
          {t("actions.create")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
