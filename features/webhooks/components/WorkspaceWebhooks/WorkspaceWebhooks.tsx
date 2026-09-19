"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { CopyField } from "@/components/ui/atoms/CopyField/CopyField";
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
import { useModal } from "@/lib/context";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import type { WebhookEvent } from "@/lib/webhooks/events";
import { type NewWebhookInput, NewWebhookModal } from "./NewWebhookModal";
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

  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const eventLabel: Record<WebhookEvent, string> = {
    "issue.created": t("webhooks.eventIssueCreated"),
    "issue.updated": t("webhooks.eventIssueUpdated"),
    "issue.deleted": t("webhooks.eventIssueDeleted"),
    "comment.created": t("webhooks.eventCommentCreated"),
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

  const createHook = async ({ url, events }: NewWebhookInput) => {
    const result = await createWebhook(workspaceId, { url, events });
    if ("error" in result) return result.error;
    setError("");
    setCreatedSecret(result.secret);
    router.refresh();
    return null;
  };

  // A dialog from a tablet up, a bottom sheet on a phone.
  const openNewWebhook = () =>
    openModal(
      ({ close }) => (
        <NewWebhookModal
          close={close}
          sheet={isPhone}
          eventLabel={eventLabel}
          onCreate={createHook}
        />
      ),
      {
        ...(isPhone ? { placement: "bottom" as const } : {}),
        label: t("webhooks.newWebhook"),
      },
    );

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
          !createdSecret && (
            <Button
              variant="primary"
              icon={<Icon icon="lucide:plus" width={15} />}
              onClick={openNewWebhook}
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

        {rows.length > 0 ? (
          <SettingsList
            rows={rows}
            columns={columns}
            label={t("webhooks.title")}
          />
        ) : (
          <p className={styles.empty}>{t("webhooks.empty")}</p>
        )}
      </SettingsBody>
    </>
  );
}
