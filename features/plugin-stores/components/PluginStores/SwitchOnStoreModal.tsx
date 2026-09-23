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
import { TrustNotice } from "./TrustNotice";

interface Props {
  storeName: string;
  /** Switches the store on. `null` = done, otherwise the error text to show. */
  onSwitchOn: () => Promise<string | null>;
  close: () => void;
  sheet?: boolean;
}

/**
 * Switching a store on again asks the same question as connecting it: a store
 * that was off is a store whose plugins may be approved again. The main store is
 * the exception and is switched on without it.
 */
export function SwitchOnStoreModal({
  storeName,
  onSwitchOn,
  close,
  sheet,
}: Props) {
  const t = useTranslations();
  const [trusted, setTrusted] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  const title = t("pluginStores.switchOnTitle", { name: storeName });

  const switchOn = () => {
    if (!trusted || isPending) return;
    startTransition(async () => {
      const failure = await onSwitchOn();
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

      <ModalBody ref={bodyRef} className={styles.modalBody}>
        <TrustNotice
          checked={trusted}
          onChange={setTrusted}
          disabled={isPending}
        />
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
          disabled={!trusted || isPending}
          onClick={switchOn}
        >
          {t("pluginStores.switchOn")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
