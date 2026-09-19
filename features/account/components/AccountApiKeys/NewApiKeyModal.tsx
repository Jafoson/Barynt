"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import { API_SCOPES, type ApiScope } from "@/lib/api/scopes";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import styles from "./accountApiKeys.module.scss";

type ExpiryChoice = "never" | "30" | "60" | "90";

export interface NewApiKeyInput {
  name: string;
  scopes: ApiScope[];
  expiresAt: Date | undefined;
}

interface NewApiKeyModalProps {
  /** One sentence per scope, translated by the caller. */
  scopeDesc: Record<ApiScope, string>;
  /** Creates the key. `null` = done, otherwise the error text to show. */
  onCreate: (input: NewApiKeyInput) => Promise<string | null>;
  close: () => void;
  /** A bottom sheet (phone) instead of a dialog. */
  sheet?: boolean;
}

/**
 * "New key": name, expiry and the scopes it may use. A dialog from a tablet
 * up, a bottom sheet on a phone (`sheet`). The one-time reveal of the secret
 * stays on the page (`AccountApiKeys`), so it isn't lost with this window.
 */
export function NewApiKeyModal({
  scopeDesc,
  onCreate,
  close,
  sheet,
}: NewApiKeyModalProps) {
  const t = useTranslations();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Set<ApiScope>>(new Set());
  const [expiry, setExpiry] = useState<ExpiryChoice>("90");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  const toggleScope = (scope: ApiScope, checked: boolean) =>
    setScopes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(scope);
      else next.delete(scope);
      return next;
    });

  const canCreate = !!name.trim() && scopes.size > 0 && !isPending;

  const create = () => {
    if (!canCreate) return;
    startTransition(async () => {
      const failure = await onCreate({
        name: name.trim(),
        scopes: [...scopes],
        expiresAt:
          expiry === "never"
            ? undefined
            : new Date(Date.now() + Number(expiry) * 24 * 60 * 60 * 1000),
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
          title={t("apiKeys.newKey")}
          onClose={close}
          closeLabel={t("actions.close")}
        />
      ) : (
        <ModalHeader
          title={t("apiKeys.newKey")}
          onClose={close}
          closeLabel={t("actions.close")}
        />
      )}

      <ModalBody ref={bodyRef} className={styles.modalBody}>
        <div className={styles.formTop}>
          <Input
            autoFocus={!sheet}
            label={t("fields.name")}
            placeholder={t("apiKeys.namePlaceholder")}
            value={name}
            disabled={isPending}
            onChange={(e) => setName(e.target.value)}
          />
          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              {t("apiKeys.expiryFieldLabel")}
            </span>
            <InlinePicker
              trigger={
                <button type="button" className={styles.expiryTrigger}>
                  {expiry === "never"
                    ? t("apiKeys.expiryNever")
                    : t("apiKeys.expiresInDays", { count: Number(expiry) })}
                  <Icon icon="lucide:chevron-down" width={14} />
                </button>
              }
              width={200}
              stop
            >
              {(closePicker) => (
                <SelectMenu
                  items={[
                    { value: "never", label: t("apiKeys.expiryNever") },
                    {
                      value: "30",
                      label: t("apiKeys.expiresInDays", { count: 30 }),
                    },
                    {
                      value: "60",
                      label: t("apiKeys.expiresInDays", { count: 60 }),
                    },
                    {
                      value: "90",
                      label: t("apiKeys.expiresInDays", { count: 90 }),
                    },
                  ]}
                  value={expiry}
                  onPick={(value) => {
                    setExpiry(value as ExpiryChoice);
                    closePicker();
                  }}
                  onClose={closePicker}
                />
              )}
            </InlinePicker>
          </div>
        </div>

        <div className={styles.scopeSection}>
          <span className={styles.fieldLabel}>{t("apiKeys.scopesLabel")}</span>
          <div className={styles.scopeCards}>
            {API_SCOPES.map((scope) => (
              <label
                key={scope}
                className={styles.scopeCard}
                data-checked={scopes.has(scope) || undefined}
              >
                <input
                  type="checkbox"
                  checked={scopes.has(scope)}
                  disabled={isPending}
                  onChange={(e) => toggleScope(scope, e.target.checked)}
                />
                <span className={styles.scopeCardText}>
                  <code>{scope}</code>
                  <span>{scopeDesc[scope]}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

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
        <Button variant="primary" disabled={!canCreate} onClick={create}>
          {t("apiKeys.create")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
