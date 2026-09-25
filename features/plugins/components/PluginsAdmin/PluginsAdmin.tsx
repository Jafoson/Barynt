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
import { UnsignedNotice } from "@/features/plugin-stores/components/PluginStores/UnsignedNotice";
import {
  approvePluginCode,
  revokePluginCodeApproval,
} from "@/features/plugins/actions";
import {
  installPlugin,
  rollbackPlugin,
  setPluginStatus,
  uninstallPlugin,
  updatePlugin,
} from "@/features/plugins/lifecycleActions";
import type {
  AvailablePlugin,
  InstalledPlugin,
  PluginsOverview,
} from "@/features/plugins/overview";
import { scopeMessageKey } from "@/features/plugins/scopeText";
import { savePlatformPluginSettings } from "@/features/plugins/settingsActions";
import type { PluginActionResult } from "@/features/plugins/types";
import { Link } from "@/i18n/navigation";
import { useModal } from "@/lib/context";
import { adminPath } from "@/lib/nav";
import type { PluginRowScope } from "@/lib/plugins/scope";
import type { SettingsForm } from "@/lib/plugins/settings";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import { useOpenPluginSettings } from "../PluginSettings/useOpenPluginSettings";
import { PluginsTabs } from "../PluginsTabs/PluginsTabs";
import { ApproveWarning } from "./ApproveWarning";
import { PluginFacts } from "./PluginFacts";
import styles from "./pluginsAdmin.module.scss";
import { toneOf, useRuntimeText } from "./runtimeText";

interface Props {
  overview: PluginsOverview;
}

const TONE_ICON = {
  ok: "lucide:circle-check",
  idle: "lucide:circle-dashed",
  problem: "lucide:circle-alert",
} as const;

/**
 * The plugins of the platform: what is installed and what became of it, what lies
 * in the plugin directory, and the actions on both. Every action asks the server
 * for the same yes it asks here (the approval, the risk of a plugin from no store),
 * so the dialogs are the question and the server is the protection.
 */
export function PluginsAdmin({ overview }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const openSettings = useOpenPluginSettings();
  const text = useRuntimeText();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  /** What an action gave back: `null` = done, otherwise the error text. */
  const settle = (result: PluginActionResult): string | null => {
    if ("error" in result) return result.error;
    setError("");
    setWarning(
      result.warning
        ? t("pluginsAdmin.warning", { message: result.warning })
        : "",
    );
    router.refresh();
    return null;
  };

  const run = (action: () => Promise<PluginActionResult>): void =>
    startTransition(async () => {
      const failure = settle(await action());
      if (failure) setError(failure);
    });

  // A dialog from a tablet up, a bottom sheet on a phone.
  const modalOptions = (label: string) => ({
    ...(isPhone ? { placement: "bottom" as const } : {}),
    label,
  });

  const openApprove = (plugin: InstalledPlugin) =>
    openModal(
      ({ close }) => (
        <AcknowledgeModal
          close={close}
          sheet={isPhone}
          title={t("pluginsAdmin.approveTitle", { name: plugin.name })}
          confirmLabel={t("pluginsAdmin.approveConfirm")}
          notice={(state) => (
            <>
              <PluginFacts
                version={plugin.version}
                origin={plugin.origin}
                hash={plugin.integrity}
                capabilities={plugin.capabilities}
                showCapabilities
              />
              <ApproveWarning {...state} />
            </>
          )}
          onConfirm={async () =>
            settle(
              await approvePluginCode(plugin.id, {
                hash: plugin.integrity,
                acknowledged: true,
              }),
            )
          }
        />
      ),
      modalOptions(t("pluginsAdmin.approveTitle", { name: plugin.name })),
    );

  const withdraw = async (plugin: InstalledPlugin) => {
    const ok = await confirm({
      title: t("pluginsAdmin.withdrawTitle", { name: plugin.name }),
      description: t("pluginsAdmin.withdrawDesc"),
      confirmLabel: t("pluginsAdmin.withdraw"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (ok) run(() => revokePluginCodeApproval(plugin.id));
  };

  const openInstall = (plugin: AvailablePlugin) =>
    openModal(
      ({ close }) => (
        <AcknowledgeModal
          close={close}
          sheet={isPhone}
          title={t("pluginsAdmin.installTitle", {
            name: plugin.name,
            version: plugin.version,
          })}
          confirmLabel={t("pluginsAdmin.installConfirm")}
          notice={(state) => (
            <>
              <PluginFacts
                version={plugin.version}
                origin={null}
                capabilities={plugin.capabilities}
              />
              {plugin.hasCode && (
                <p className={styles.notice}>
                  <Icon icon="lucide:info" width={14} />
                  {t("pluginsAdmin.installCode")}
                </p>
              )}
              <UnsignedNotice {...state} />
            </>
          )}
          onConfirm={async () =>
            settle(
              await installPlugin(plugin.id, plugin.version, {
                acknowledged: true,
              }),
            )
          }
        />
      ),
      modalOptions(
        t("pluginsAdmin.installTitle", {
          name: plugin.name,
          version: plugin.version,
        }),
      ),
    );

  const openUpdate = (plugin: InstalledPlugin, version: string) =>
    openModal(
      ({ close }) => (
        <AcknowledgeModal
          close={close}
          sheet={isPhone}
          title={t("pluginsAdmin.updateTitle", { name: plugin.name, version })}
          confirmLabel={t("pluginsAdmin.updateConfirm")}
          notice={(state) => (
            <>
              <PluginFacts
                version={version}
                origin={null}
                capabilities={plugin.capabilities}
              />
              {plugin.approval.kind === "approved" && (
                <p className={styles.notice}>
                  <Icon icon="lucide:info" width={14} />
                  {t("pluginsAdmin.updateApprovalGone")}
                </p>
              )}
              <UnsignedNotice {...state} />
            </>
          )}
          onConfirm={async () =>
            settle(
              await updatePlugin(plugin.id, version, { acknowledged: true }),
            )
          }
        />
      ),
      modalOptions(
        t("pluginsAdmin.updateTitle", { name: plugin.name, version }),
      ),
    );

  /**
   * Goes back to the version before the last update. A plugin from a store asks for a plain
   * confirmation; one from no store asks for the same yes as installing or updating it does, and
   * the server asks for it too.
   */
  const openRollback = async (plugin: InstalledPlugin, version: string) => {
    const title = t("pluginsAdmin.rollbackTitle", {
      name: plugin.name,
      version,
    });
    if (!plugin.unsigned) {
      const ok = await confirm({
        title,
        description: t("pluginsAdmin.rollbackDesc", { version }),
        confirmLabel: t("pluginsAdmin.rollbackConfirm"),
        cancelLabel: t("actions.cancel"),
      });
      if (ok) run(() => rollbackPlugin(plugin.id));
      return;
    }
    openModal(
      ({ close }) => (
        <AcknowledgeModal
          close={close}
          sheet={isPhone}
          title={title}
          confirmLabel={t("pluginsAdmin.rollbackConfirm")}
          notice={(state) => (
            <>
              <p className={styles.notice}>
                <Icon icon="lucide:info" width={14} />
                {t("pluginsAdmin.rollbackDesc", { version })}
              </p>
              <UnsignedNotice {...state} />
            </>
          )}
          onConfirm={async () =>
            settle(await rollbackPlugin(plugin.id, { acknowledged: true }))
          }
        />
      ),
      modalOptions(title),
    );
  };

  const uninstall = async (plugin: InstalledPlugin) => {
    const ok = await confirm({
      title: t("pluginsAdmin.uninstallTitle", { name: plugin.name }),
      description: t("pluginsAdmin.uninstallDesc"),
      confirmLabel: t("pluginsAdmin.uninstall"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (ok) run(() => uninstallPlugin(plugin.id));
  };

  const switchPlugin = async (plugin: InstalledPlugin, on: boolean) => {
    if (on) {
      run(() => setPluginStatus(plugin.id, true));
      return;
    }
    const ok = await confirm({
      title: t("pluginsAdmin.switchOffTitle", { name: plugin.name }),
      description: t("pluginsAdmin.switchOffDesc"),
      confirmLabel: t("pluginsAdmin.switchOff"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (ok) run(() => setPluginStatus(plugin.id, false));
  };

  const scopeLabel = (scope: PluginRowScope) =>
    t(`pluginsAdmin.${scopeMessageKey(scope)}`);

  const installedColumns: SettingsColumn[] = [
    { id: "on", header: t("pluginsAdmin.colOn"), width: "70px" },
    { id: "actions", header: "", width: "minmax(0, 260px)" },
  ];

  const installedRows: SettingsRow[] = overview.installed.map((plugin) => {
    const tone = toneOf(plugin.state);
    // "Not approved, so it does not run" is said once: by the state, when that is what
    // keeps it from running, and by the approval line otherwise.
    const saidByState =
      plugin.state.kind === "blocked" &&
      (plugin.state.reason === "not-approved" ||
        plugin.state.reason === "approval-outdated");
    const approvalLine = saidByState ? null : text.approval(plugin.approval);
    // The platform's own settings, for a plugin that applies to the whole platform and declares some.
    const settingsForm: SettingsForm | null = plugin.settingValues
      ? { fields: plugin.settings, values: plugin.settingValues }
      : null;
    return {
      id: plugin.id,
      label: plugin.name,
      desc: (
        <span className={styles.info}>
          {plugin.description && (
            <span className={styles.description}>{plugin.description}</span>
          )}
          <span className={styles.meta}>
            <Badge size="sm" mono>
              {plugin.version}
            </Badge>
            <Badge size="sm" mono={false}>
              {scopeLabel(plugin.scope)}
            </Badge>
            <Badge size="sm" mono={false}>
              {plugin.hasCode
                ? t("pluginsAdmin.withCode")
                : t("pluginsAdmin.declarative")}
            </Badge>
            {plugin.unsigned ? (
              <span
                className={styles.unsigned}
                title={t("pluginsAdmin.unsignedHint")}
              >
                <Icon icon="lucide:triangle-alert" width={12} />
                {t("pluginsAdmin.unsigned")}
              </span>
            ) : (
              <Badge size="sm" mono={false}>
                {t("pluginsAdmin.sourceStore")}
              </Badge>
            )}
            {plugin.scope === "WORKSPACE" && (
              <span className={styles.metaText}>
                {t("pluginsAdmin.workspacesOn", { count: plugin.workspaces })}
              </span>
            )}
            {plugin.scope === "PROJECT" && (
              <span className={styles.metaText}>
                {t("pluginsAdmin.projectsOn", { count: plugin.projects })}
              </span>
            )}
          </span>
          <span className={styles.state} data-tone={tone}>
            <Icon icon={TONE_ICON[tone]} width={14} />
            {text.state(plugin.state, plugin.scope)}
          </span>
          {approvalLine && (
            <span className={styles.approval}>
              <Icon icon="lucide:shield" width={14} />
              {approvalLine}
            </span>
          )}
          {plugin.storeUpdate && (
            <span className={styles.approval}>
              <Icon icon="lucide:refresh-cw" width={14} />
              <Link
                href={`${adminPath("plugins/store")}?q=${encodeURIComponent(plugin.id)}`}
              >
                {t("pluginsAdmin.storeUpdate", { version: plugin.storeUpdate })}
              </Link>
            </span>
          )}
        </span>
      ),
      cells: {
        on: (
          <Switch
            id={`plugin-on-${plugin.id}`}
            label={t("pluginsAdmin.switchLabel")}
            labelHidden
            checked={plugin.platformOn}
            disabled={isPending}
            onChange={(checked) => void switchPlugin(plugin, checked)}
          />
        ),
        actions: (
          <span className={styles.rowActions}>
            {(plugin.approval.kind === "open" ||
              plugin.approval.kind === "outdated") && (
              <Button
                variant="primary"
                size="sm"
                icon={<Icon icon="lucide:shield-check" width={14} />}
                disabled={isPending}
                onClick={() => openApprove(plugin)}
              >
                {t("pluginsAdmin.approve")}
              </Button>
            )}
            {plugin.approval.kind === "approved" && (
              <Button
                variant="text"
                size="sm"
                icon={<Icon icon="lucide:shield-off" width={14} />}
                disabled={isPending}
                onClick={() => void withdraw(plugin)}
              >
                {t("pluginsAdmin.withdraw")}
              </Button>
            )}
            {settingsForm && (
              <Button
                variant="text"
                size="sm"
                icon={<Icon icon="lucide:sliders-horizontal" width={14} />}
                disabled={isPending}
                onClick={() =>
                  openSettings({
                    name: plugin.name,
                    form: settingsForm,
                    save: (values) =>
                      savePlatformPluginSettings(plugin.id, values),
                  })
                }
              >
                {t("pluginSettings.open")}
              </Button>
            )}
            {plugin.update && (
              <Button
                variant="text"
                size="sm"
                icon={<Icon icon="lucide:refresh-cw" width={14} />}
                disabled={isPending}
                onClick={() => openUpdate(plugin, plugin.update as string)}
              >
                {t("pluginsAdmin.update", { version: plugin.update })}
              </Button>
            )}
            {plugin.previousVersion && (
              <Button
                variant="text"
                size="sm"
                icon={<Icon icon="lucide:undo-2" width={14} />}
                disabled={isPending}
                onClick={() =>
                  void openRollback(plugin, plugin.previousVersion as string)
                }
              >
                {t("pluginsAdmin.rollback", {
                  version: plugin.previousVersion,
                })}
              </Button>
            )}
            <Button
              variant="text"
              size="sm"
              icon={<Icon icon="lucide:trash-2" width={14} />}
              aria-label={t("pluginsAdmin.uninstall")}
              title={t("pluginsAdmin.uninstall")}
              disabled={isPending}
              onClick={() => void uninstall(plugin)}
            />
          </span>
        ),
      },
    };
  });

  const availableRows: SettingsRow[] = overview.available.map((plugin) => ({
    id: plugin.id,
    label: plugin.name,
    desc: (
      <span className={styles.info}>
        {plugin.description && (
          <span className={styles.description}>{plugin.description}</span>
        )}
        <span className={styles.meta}>
          <Badge size="sm" mono>
            {plugin.version}
          </Badge>
          <Badge size="sm" mono={false}>
            {scopeLabel(plugin.scope)}
          </Badge>
          <Badge size="sm" mono={false}>
            {plugin.hasCode
              ? t("pluginsAdmin.withCode")
              : t("pluginsAdmin.declarative")}
          </Badge>
        </span>
      </span>
    ),
    control: (
      <Button
        variant="primary"
        size="sm"
        icon={<Icon icon="lucide:download" width={14} />}
        disabled={isPending || !overview.allowUnsigned}
        onClick={() => openInstall(plugin)}
      >
        {t("pluginsAdmin.install")}
      </Button>
    ),
  }));

  return (
    <>
      <PageHeader
        divider={false}
        title={t("pluginsAdmin.title")}
        actions={<PluginsTabs active="installed" />}
      />

      <SettingsBody>
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}
        {warning && (
          <output className={styles.notice}>
            <Icon icon="lucide:triangle-alert" width={14} />
            {warning}
          </output>
        )}
        {overview.problem && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            <span>
              <strong>{t("pluginsAdmin.problemTitle")}.</strong>{" "}
              {overview.problem}
            </span>
          </p>
        )}
        {!overview.dir && !overview.problem && (
          <output className={styles.notice}>
            <Icon icon="lucide:info" width={14} />
            {t("pluginsAdmin.noDir")}
          </output>
        )}

        {installedRows.length > 0 ? (
          <SettingsList
            title={t("pluginsAdmin.installedTitle")}
            rows={installedRows}
            columns={installedColumns}
          />
        ) : (
          <section>
            <h2 className={styles.sectionNote}>
              {t("pluginsAdmin.installedTitle")}
            </h2>
            <p className={styles.empty}>{t("pluginsAdmin.emptyInstalled")}</p>
          </section>
        )}

        {overview.dir && (
          <section>
            {availableRows.length > 0 ? (
              <SettingsList
                title={t("pluginsAdmin.availableTitle")}
                note={
                  !overview.allowUnsigned && (
                    <p className={styles.notice}>
                      <Icon icon="lucide:triangle-alert" width={14} />
                      <span>
                        {t("pluginsAdmin.installBlocked")}{" "}
                        <Link href={adminPath("plugin-stores")}>
                          {t("pluginsAdmin.installBlockedLink")}
                        </Link>
                      </span>
                    </p>
                  )
                }
                rows={availableRows}
              />
            ) : (
              <>
                <h2 className={styles.sectionNote}>
                  {t("pluginsAdmin.availableTitle")}
                </h2>
                <p className={styles.empty}>
                  {t("pluginsAdmin.emptyAvailable")}
                </p>
              </>
            )}
          </section>
        )}

        {(overview.unusable.length > 0 || overview.issues.length > 0) && (
          <section>
            <h2 className={styles.sectionNote}>
              {t("pluginsAdmin.unusableTitle")}
            </h2>
            <ul className={styles.issueList}>
              {overview.unusable.map((item) => (
                <li key={`${item.id}@${item.version}`}>
                  <code>
                    {item.id}@{item.version}
                  </code>
                  : {item.issues.join("; ")}
                </li>
              ))}
              {overview.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </section>
        )}

        {overview.dir && (
          <p className={styles.footnote}>
            {t.rich("pluginsAdmin.dirNote", {
              dir: overview.dir,
              code: (chunks) => <code>{chunks}</code>,
            })}
          </p>
        )}
      </SettingsBody>
    </>
  );
}
