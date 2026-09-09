"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { CopyField } from "@/components/ui/atoms/CopyField/CopyField";
import { Input } from "@/components/ui/atoms/Input/Input";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import {
  SettingsBody,
  type SettingsColumn,
  SettingsList,
  type SettingsRow,
} from "@/components/ui/layout/SettingsList/SettingsList";
import {
  createWebhook,
  deleteWebhook,
  setWebhookEnabled,
} from "@/features/webhooks/actions";
import type { WebhooksView } from "@/features/webhooks/types";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhooks/events";
import styles from "./workspaceWebhooks.module.scss";

interface Props extends WebhooksView {
  workspaceId: string;
}

/**
 * A workspace's webhook endpoints — sends a signed HTTP POST request
 * (`lib/webhooks/deliver.ts`) whenever a subscribed event happens in this
 * workspace. Unlike API keys, these belong to the workspace, not a person:
 * an integration like a Slack or CI notification is shared configuration.
 *
 * Structurally mirrors `AccountApiKeys` (create form, reveal-the-secret-
 * once, `SettingsList` table) for the create/reveal/list shape, and
 * `WorkspaceMembers`' `run()` wrapper for the row actions (enable/disable,
 * delete) that throw on failure rather than returning `{error}` — same
 * split as `setMemberRole`/`removeMember` there.
 */
export function WorkspaceWebhooks({ workspaceId, webhooks }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<WebhookEvent>>(new Set());
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const eventLabel: Record<WebhookEvent, string> = {
    "issue.created": t("webhooks.eventIssueCreated"),
    "issue.updated": t("webhooks.eventIssueUpdated"),
    "issue.deleted": t("webhooks.eventIssueDeleted"),
    "comment.created": t("webhooks.eventCommentCreated"),
  };

  const toggleEvent = (event: WebhookEvent, checked: boolean) => {
    setEvents((prev) => {
      const next = new Set(prev);
      if (checked) next.add(event);
      else next.delete(event);
      return next;
    });
  };

  const resetForm = () => {
    setUrl("");
    setEvents(new Set());
  };

  const run = (action: () => Promise<unknown>, failure: string) =>
    startTransition(async () => {
      try {
        await action();
        setError("");
        router.refresh();
      } catch {
        setError(failure);
      }
    });

  const create = () => {
    const trimmed = url.trim();
    if (!trimmed || events.size === 0 || isPending) return;
    startTransition(async () => {
      const result = await createWebhook(workspaceId, {
        url: trimmed,
        events: [...events],
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError("");
      setCreatedSecret(result.secret);
      setFormOpen(false);
      resetForm();
      router.refresh();
    });
  };

  const remove = async (id: string, hookUrl: string) => {
    const ok = await confirm({
      title: t("webhooks.deleteTitle", { url: hookUrl }),
      description: t("webhooks.deleteDesc"),
      confirmLabel: t("actions.delete"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (!ok) return;
    run(() => deleteWebhook(id), t("webhooks.deleteFailed"));
  };

  const columns: SettingsColumn[] = [
    {
      id: "lastDelivery",
      header: t("webhooks.colLastDelivery"),
      width: "170px",
    },
    { id: "enabled", header: t("webhooks.colEnabled"), width: "70px" },
    { id: "actions", header: "", width: "40px" },
  ];

  const rows: SettingsRow[] = webhooks.map((hook) => ({
    id: hook.id,
    label: hook.url,
    desc: (
      <span className={styles.eventBadges}>
        {hook.events.map((event) => (
          <Badge key={event} size="sm" mono={false}>
            {eventLabel[event]}
          </Badge>
        ))}
      </span>
    ),
    cells: {
      lastDelivery: hook.lastDeliveryAt ? (
        <span className={styles.delivery}>
          <Badge
            size="sm"
            mono={false}
            active={
              hook.lastDeliveryStatus !== null && hook.lastDeliveryStatus < 300
            }
          >
            {hook.lastDeliveryError
              ? t("webhooks.deliveryError")
              : hook.lastDeliveryStatus}
          </Badge>
          <span>
            {format.dateTime(hook.lastDeliveryAt, { dateStyle: "medium" })}
          </span>
        </span>
      ) : (
        t("webhooks.neverDelivered")
      ),
      enabled: (
        <Switch
          id={`webhook-enabled-${hook.id}`}
          label={t("webhooks.colEnabled")}
          labelHidden
          checked={hook.enabled}
          disabled={isPending}
          onChange={(checked) =>
            run(
              () => setWebhookEnabled(hook.id, checked),
              t("webhooks.toggleFailed"),
            )
          }
        />
      ),
      actions: (
        <Button
          variant="text"
          size="sm"
          icon={<Icon icon="lucide:trash-2" width={14} />}
          aria-label={t("actions.delete")}
          disabled={isPending}
          onClick={() => remove(hook.id, hook.url)}
        />
      ),
    },
  }));

  return (
    <>
      <PageHeader
        divider={false}
        title={t("webhooks.title")}
        description={t("webhooks.desc")}
        actions={
          !formOpen &&
          !createdSecret && (
            <Button
              variant="primary"
              icon={<Icon icon="lucide:plus" width={15} />}
              onClick={() => setFormOpen(true)}
            >
              {t("webhooks.newWebhook")}
            </Button>
          )
        }
      />

      <SettingsBody>
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}

        {createdSecret && (
          <div className={styles.reveal}>
            <p className={styles.revealTitle}>{t("webhooks.createdTitle")}</p>
            <p className={styles.revealDesc}>{t("webhooks.createdDesc")}</p>
            <CopyField
              value={createdSecret}
              copyLabel={t("apiKeys.copyLabel")}
              copiedLabel={t("apiKeys.copiedLabel")}
            />
            <div className={styles.actions}>
              <Button variant="text" onClick={() => setCreatedSecret(null)}>
                {t("actions.close")}
              </Button>
            </div>
          </div>
        )}

        {!createdSecret && formOpen && (
          <div className={styles.form}>
            <Input
              label={t("webhooks.urlLabel")}
              placeholder={t("webhooks.urlPlaceholder")}
              value={url}
              disabled={isPending}
              onChange={(e) => setUrl(e.target.value)}
            />

            <div className={styles.eventSection}>
              <span className={styles.fieldLabel}>
                {t("webhooks.eventsLabel")}
              </span>
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

            <div className={styles.actions}>
              <Button
                variant="text"
                disabled={isPending}
                onClick={() => {
                  setFormOpen(false);
                  resetForm();
                }}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={!url.trim() || events.size === 0 || isPending}
                onClick={create}
              >
                {t("webhooks.create")}
              </Button>
            </div>
          </div>
        )}

        {rows.length > 0 ? (
          <SettingsList
            rows={rows}
            columns={columns}
            label={t("webhooks.title")}
          />
        ) : (
          !formOpen && <p className={styles.empty}>{t("webhooks.empty")}</p>
        )}
      </SettingsBody>
    </>
  );
}
