"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Input } from "@/components/ui/atoms/Input/Input";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import {
  MAX_STORE_NAME_LENGTH,
  MAX_STORE_URL_LENGTH,
} from "@/features/plugin-stores/constants";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import styles from "./pluginStores.module.scss";
import { StoreAccessFields } from "./StoreAccessFields";
import { TrustNotice } from "./TrustNotice";

export interface NewPluginStoreInput {
  name: string;
  url: string;
  trusted: boolean;
  /** For a private repository. Left out for a public one. */
  token?: string;
  username?: string;
}

interface Props {
  /** Connects the store. `null` = done, otherwise the error text to show. */
  onConnect: (input: NewPluginStoreInput) => Promise<string | null>;
  close: () => void;
  /** A bottom sheet (phone) instead of a dialog. */
  sheet?: boolean;
}

/**
 * "Connect a plugin store": a name, the address, optionally the access to a
 * private repository, and the question whether the admin trusts the store. A
 * dialog from a tablet up, a bottom sheet on a phone (`sheet`). The button stays
 * off until both fields are filled and the question is answered with yes.
 */
export function NewPluginStoreModal({ onConnect, close, sheet }: Props) {
  const t = useTranslations();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [trusted, setTrusted] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  const canConnect = !!name.trim() && !!url.trim() && trusted && !isPending;

  const connect = () => {
    if (!canConnect) return;
    startTransition(async () => {
      const failure = await onConnect({
        name: name.trim(),
        url: url.trim(),
        trusted,
        ...(token.trim()
          ? { token: token.trim(), username: username.trim() }
          : {}),
      });
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
          title={t("pluginStores.connectTitle")}
          onClose={close}
          closeLabel={t("actions.close")}
        />
      ) : (
        <ModalHeader
          title={t("pluginStores.connectTitle")}
          onClose={close}
          closeLabel={t("actions.close")}
        />
      )}

      <ModalBody ref={bodyRef} className={styles.modalBody}>
        <Input
          autoFocus={!sheet}
          label={t("pluginStores.nameLabel")}
          placeholder={t("pluginStores.namePlaceholder")}
          maxLength={MAX_STORE_NAME_LENGTH}
          value={name}
          disabled={isPending}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label={t("pluginStores.urlLabel")}
          hint={t("pluginStores.urlHint")}
          placeholder="https://github.com/company/barynt-plugins"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={MAX_STORE_URL_LENGTH}
          value={url}
          disabled={isPending}
          onChange={(e) => setUrl(e.target.value)}
        />

        {/* Native `details`: closed by default, so a public store is not asked
            for anything it does not need, and it needs no state of its own. */}
        <details className={styles.private}>
          <summary>{t("pluginStores.privateSummary")}</summary>
          <div className={styles.privateBody}>
            <p className={styles.accessDesc}>{t("pluginStores.privateHint")}</p>
            <StoreAccessFields
              token={token}
              username={username}
              onToken={setToken}
              onUsername={setUsername}
              disabled={isPending}
            />
          </div>
        </details>

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
        <Button variant="primary" disabled={!canConnect} onClick={connect}>
          {t("pluginStores.connect")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
