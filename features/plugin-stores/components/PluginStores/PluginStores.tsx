"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { AcknowledgeModal } from "@/components/ui/layout/AcknowledgeModal/AcknowledgeModal";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import {
  SettingsBody,
  type SettingsColumn,
  SettingsList,
  type SettingsRow,
} from "@/components/ui/layout/SettingsList/SettingsList";
import {
  addPluginStore,
  clearPluginStoreCredential,
  removePluginStore,
  setPluginStoreCredential,
  setPluginStoreEnabled,
} from "@/features/plugin-stores/actions";
import type { PluginStoreRow } from "@/features/plugin-stores/queries";
import { setAllowUnsignedPlugins } from "@/features/plugin-stores/unsignedActions";
import { useModal } from "@/lib/context";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import {
  type NewPluginStoreInput,
  NewPluginStoreModal,
} from "./NewPluginStoreModal";
import styles from "./pluginStores.module.scss";
import { StoreAccessModal } from "./StoreAccessModal";
import { SwitchOnStoreModal } from "./SwitchOnStoreModal";
import { UnsignedNotice } from "./UnsignedNotice";

interface Props {
  stores: PluginStoreRow[];
  /** Plugins that come from no store are allowed. Off by default. */
  allowUnsigned: boolean;
}

/**
 * Which plugin stores are on: the project's main store (on by default), and any
 * the admin connected. Switching a store on or connecting one asks whether the
 * admin trusts it; the server checks the answer too. Nothing here approves a
 * plugin: each plugin with code needs its own approval.
 *
 * Below the list, whether plugins from no store are allowed. Allowing them always
 * opens a warning that has to be answered with a yes, and the server asks for it
 * as well.
 */
export function PluginStores({ stores, allowUnsigned }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const run = (action: () => Promise<{ ok: true } | { error: string }>): void =>
    startTransition(async () => {
      const result = await action();
      setError("error" in result ? result.error : "");
      router.refresh();
    });

  // A dialog from a tablet up, a bottom sheet on a phone.
  const modalOptions = (label: string) => ({
    ...(isPhone ? { placement: "bottom" as const } : {}),
    label,
  });

  // What a dialog gets back from an action: `null` = done, otherwise the error text.
  const settle = (result: { ok: true } | { error: string }): string | null => {
    if ("error" in result) return result.error;
    setError("");
    router.refresh();
    return null;
  };

  const connect = async (input: NewPluginStoreInput) =>
    settle(await addPluginStore(input));

  const openConnect = () =>
    openModal(
      ({ close }) => (
        <NewPluginStoreModal
          close={close}
          sheet={isPhone}
          onConnect={connect}
        />
      ),
      modalOptions(t("pluginStores.connectTitle")),
    );

  const switchOn = (store: PluginStoreRow) => {
    if (store.official) {
      run(() => setPluginStoreEnabled(store.id, true));
      return;
    }
    openModal(
      ({ close }) => (
        <SwitchOnStoreModal
          close={close}
          sheet={isPhone}
          storeName={store.name}
          onSwitchOn={async () =>
            settle(await setPluginStoreEnabled(store.id, true, true))
          }
        />
      ),
      modalOptions(t("pluginStores.switchOnTitle", { name: store.name })),
    );
  };

  // The token is never sent to the page: the dialog can set, replace or remove it,
  // not read it.
  const openAccess = (store: PluginStoreRow) =>
    openModal(
      ({ close }) => (
        <StoreAccessModal
          close={close}
          sheet={isPhone}
          storeName={store.name}
          hasCredential={store.hasCredential}
          initialUsername={store.credentialUser ?? ""}
          onSave={async (input) =>
            settle(await setPluginStoreCredential(store.id, input))
          }
          onRemove={async () =>
            settle(await clearPluginStoreCredential(store.id))
          }
        />
      ),
      modalOptions(t("pluginStores.accessTitle", { name: store.name })),
    );

  const openAllowUnsigned = () =>
    openModal(
      ({ close }) => (
        <AcknowledgeModal
          close={close}
          sheet={isPhone}
          title={t("pluginStores.unsignedAllowTitle")}
          confirmLabel={t("pluginStores.unsignedAllow")}
          notice={(state) => <UnsignedNotice {...state} />}
          onConfirm={async () =>
            settle(await setAllowUnsignedPlugins(true, true))
          }
        />
      ),
      modalOptions(t("pluginStores.unsignedAllowTitle")),
    );

  const disallowUnsigned = async () => {
    const ok = await confirm({
      title: t("pluginStores.unsignedOffTitle"),
      description: t("pluginStores.unsignedOffDesc"),
      confirmLabel: t("pluginStores.unsignedOff"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (ok) run(() => setAllowUnsignedPlugins(false));
  };

  const switchOff = async (store: PluginStoreRow) => {
    const ok = await confirm({
      title: t("pluginStores.switchOffTitle", { name: store.name }),
      description: t("pluginStores.switchOffDesc"),
      confirmLabel: t("pluginStores.switchOff"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (ok) run(() => setPluginStoreEnabled(store.id, false));
  };

  const remove = async (store: PluginStoreRow) => {
    const ok = await confirm({
      title: t("pluginStores.removeTitle", { name: store.name }),
      description: t("pluginStores.removeDesc"),
      confirmLabel: t("actions.remove"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (ok) run(() => removePluginStore(store.id));
  };

  const columns: SettingsColumn[] = [
    { id: "enabled", header: t("pluginStores.colOn"), width: "70px" },
    { id: "actions", header: "", width: "84px" },
  ];

  const rows: SettingsRow[] = stores.map((store) => ({
    id: store.id,
    label: store.name,
    desc: (
      <span className={styles.storeDesc}>
        <code className={styles.storeUrl}>{store.url}</code>
        {store.official && (
          <Badge size="sm" mono={false} active>
            {t("pluginStores.official")}
          </Badge>
        )}
        {store.hasCredential && (
          <span className={styles.accessMark}>
            <Icon icon="lucide:lock" width={12} />
            {t("pluginStores.accessBadge")}
          </span>
        )}
      </span>
    ),
    cells: {
      enabled: (
        <Switch
          id={`plugin-store-enabled-${store.id}`}
          label={t("pluginStores.colOn")}
          labelHidden
          checked={store.enabled}
          disabled={isPending}
          onChange={(checked) =>
            checked ? switchOn(store) : void switchOff(store)
          }
        />
      ),
      actions: (
        <span className={styles.rowActions}>
          <Button
            variant="text"
            size="sm"
            icon={<Icon icon="lucide:key-round" width={14} />}
            aria-label={
              store.hasCredential
                ? t("pluginStores.accessChange")
                : t("pluginStores.accessAdd")
            }
            disabled={isPending}
            onClick={() => openAccess(store)}
          />
          {/* The main store can be switched off but not removed. Its slot stays,
              unseen, so the key is in the same place in every row. */}
          <span className={store.official ? styles.slotHidden : undefined}>
            <Button
              variant="text"
              size="sm"
              icon={<Icon icon="lucide:trash-2" width={14} />}
              aria-label={t("actions.remove")}
              disabled={isPending || store.official}
              onClick={() => remove(store)}
            />
          </span>
        </span>
      ),
    },
  }));

  const unsignedRows: SettingsRow[] = [
    {
      id: "allow-unsigned",
      label: t("pluginStores.unsignedLabel"),
      desc: t("pluginStores.unsignedDesc"),
      control: (
        <Switch
          id="plugin-unsigned-allowed"
          label={t("pluginStores.unsignedLabel")}
          labelHidden
          checked={allowUnsigned}
          disabled={isPending}
          onChange={(checked) =>
            checked ? openAllowUnsigned() : void disallowUnsigned()
          }
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        divider={false}
        title={t("pluginStores.title")}
        actions={
          <Button
            variant="primary"
            icon={<Icon icon="lucide:plus" width={15} />}
            onClick={openConnect}
          >
            {t("pluginStores.connect")}
          </Button>
        }
      />

      <SettingsBody>
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}

        {stores.length > 0 && stores.every((store) => !store.enabled) && (
          <output className={styles.notice}>
            <Icon icon="lucide:info" width={14} />
            {t("pluginStores.noneOn")}
          </output>
        )}

        {rows.length > 0 ? (
          <SettingsList
            rows={rows}
            columns={columns}
            label={t("pluginStores.title")}
          />
        ) : (
          <p className={styles.empty}>{t("pluginStores.empty")}</p>
        )}

        <p className={styles.footnote}>{t("pluginStores.footnote")}</p>

        <SettingsList
          rows={unsignedRows}
          title={t("pluginStores.unsignedTitle")}
        />
      </SettingsBody>
    </>
  );
}
