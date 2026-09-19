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
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhooks/events";
import styles from "./workspaceWebhooks.module.scss";

export interface NewWebhookInput {
  url: string;
  events: WebhookEvent[];
}

interface NewWebhookModalProps {
  /** One label per event, translated by the caller. */
  eventLabel: Record<WebhookEvent, string>;
  /** Creates the webhook. `null` = done, otherwise the error text to show. */
  onCreate: (input: NewWebhookInput) => Promise<string | null>;
  close: () => void;
  /** A bottom sheet (phone) instead of a dialog. */
  sheet?: boolean;
}

/**
 * "New webhook": the address and the events it should hear about. A dialog
 * from a tablet up, a bottom sheet on a phone (`sheet`). The one-time reveal
 * of the signing secret stays on the page (`WorkspaceWebhooks`), so it isn't
 * lost with this window.
 */
export function NewWebhookModal({
  eventLabel,
  onCreate,
  close,
  sheet,
}: NewWebhookModalProps) {
  const t = useTranslations();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<WebhookEvent>>(new Set());
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  const toggleEvent = (event: WebhookEvent, checked: boolean) =>
    setEvents((prev) => {
      const next = new Set(prev);
      if (checked) next.add(event);
      else next.delete(event);
      return next;
    });

  const canCreate = !!url.trim() && events.size > 0 && !isPending;

  const create = () => {
    if (!canCreate) return;
    startTransition(async () => {
      const failure = await onCreate({ url: url.trim(), events: [...events] });
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
          title={t("webhooks.newWebhook")}
          onClose={close}
          closeLabel={t("actions.close")}
        />
      ) : (
        <ModalHeader
          title={t("webhooks.newWebhook")}
          onClose={close}
          closeLabel={t("actions.close")}
        />
      )}

      <ModalBody ref={bodyRef} className={styles.modalBody}>
        <Input
          autoFocus={!sheet}
          label={t("webhooks.urlLabel")}
          placeholder={t("webhooks.urlPlaceholder")}
          value={url}
          disabled={isPending}
          onChange={(e) => setUrl(e.target.value)}
        />

        <div className={styles.eventSection}>
          <span className={styles.fieldLabel}>{t("webhooks.eventsLabel")}</span>
          <div className={styles.eventCards}>
            {WEBHOOK_EVENTS.map((event) => (
              <label
                key={event}
                className={styles.eventCard}
                data-checked={events.has(event) || undefined}
              >
                <input
                  type="checkbox"
                  checked={events.has(event)}
                  disabled={isPending}
                  onChange={(e) => toggleEvent(event, e.target.checked)}
                />
                <code>{event}</code>
                <span>{eventLabel[event]}</span>
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
          {t("webhooks.create")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
