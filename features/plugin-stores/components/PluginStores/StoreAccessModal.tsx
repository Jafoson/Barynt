"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import styles from "./pluginStores.module.scss";
import { StoreAccessFields } from "./StoreAccessFields";

interface Props {
  storeName: string;
  /** A token is stored already. It is not shown, only replaced or removed. */
  hasCredential: boolean;
  initialUsername: string;
  /** Saves the token. `null` = done, otherwise the error text to show. */
  onSave: (input: {
    token: string;
    username: string;
  }) => Promise<string | null>;
  /** Removes the token. `null` = done, otherwise the error text to show. */
  onRemove: () => Promise<string | null>;
  close: () => void;
  sheet?: boolean;
}

/**
 * Access to a private repository for a store that is connected: set a token,
 * replace it, or remove it. The stored token is never sent back to the page, so
 * there is nothing to edit; entering a new one replaces it. The user name is not a
 * secret and is filled in.
 */
export function StoreAccessModal({
  storeName,
  hasCredential,
  initialUsername,
  onSave,
  onRemove,
  close,
  sheet,
}: Props) {
  const t = useTranslations();
  const [token, setToken] = useState("");
  const [username, setUsername] = useState(initialUsername);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  const title = t("pluginStores.accessTitle", { name: storeName });
  const canSave = !!token.trim() && !isPending;

  const finish = (failure: string | null) => {
    if (failure) setError(failure);
    else close();
  };

  const save = () => {
    if (!canSave) return;
    startTransition(async () => {
      finish(await onSave({ token: token.trim(), username: username.trim() }));
    });
  };

  const remove = () => {
    if (isPending) return;
    startTransition(async () => finish(await onRemove()));
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

      <ModalBody ref={bodyRef} className={styles.modalBody}>
        <p className={styles.accessDesc}>
          {hasCredential
            ? t("pluginStores.accessDescChange")
            : t("pluginStores.accessDescSet")}
        </p>
        <StoreAccessFields
          autoFocus={!sheet}
          token={token}
          username={username}
          onToken={setToken}
          onUsername={setUsername}
          disabled={isPending}
          tokenStored={hasCredential}
        />
        <p className={styles.accessNote}>
          <Icon icon="lucide:lock" width={14} />
          {t("pluginStores.accessNote")}
        </p>
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}
      </ModalBody>

      <ModalFooter
        hint={
          hasCredential ? (
            <Button
              variant="ghost"
              className={styles.dangerText}
              disabled={isPending}
              onClick={remove}
            >
              {t("pluginStores.accessRemove")}
            </Button>
          ) : undefined
        }
      >
        {!sheet && (
          <Button variant="ghost" disabled={isPending} onClick={close}>
            {t("actions.cancel")}
          </Button>
        )}
        <Button variant="primary" disabled={!canSave} onClick={save}>
          {t("actions.save")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
