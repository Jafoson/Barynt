"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import {
  SettingsBody,
  type SettingsColumn,
  SettingsList,
  type SettingsRow,
} from "@/components/ui/layout/SettingsList/SettingsList";
import type { PluginActionResult } from "@/features/plugins/types";
import type {
  WorkspacePlugin,
  WorkspacePluginsView,
} from "@/features/plugins/workspacePlugins";
import styles from "../PluginsAdmin/pluginsAdmin.module.scss";
import { type Tone, useRuntimeText } from "../PluginsAdmin/runtimeText";

interface Props {
  /** Whose plugins these are: a workspace's or a project's. It decides the words and nothing else. */
  level: "workspace" | "project";
  view: WorkspacePluginsView;
  /** Switch a plugin on or off there: the actions of that level, with its id already in them. */
  enable: (pluginId: string) => Promise<PluginActionResult>;
  disable: (pluginId: string) => Promise<PluginActionResult>;
  /** The Installed and Store tabs, where the level has a store. */
  tabs?: ReactNode;
}

const TONE_ICON = {
  ok: "lucide:circle-check",
  idle: "lucide:circle-dashed",
  problem: "lucide:circle-alert",
} as const;

/**
 * The plugins a workspace or a project can use: the ones the platform installed that apply at
 * that level, a switch for each, and what keeps a plugin from running here (the platform
 * switched it off, its code is not approved, it cannot load). The level only switches on and
 * off; what is installed is the platform's. Switching on has to end with the plugin running: the
 * server checks and says why not, so a switch never shows "on" for a plugin that is not running.
 * A workspace's page and a project's are this one page, with the words of their level.
 */
export function LevelPlugins({ level, view, enable, disable, tabs }: Props) {
  const t = useTranslations();
  // The words of this level: `workspacePlugins.*` or `projectPlugins.*`, the same keys in both.
  const words = level === "workspace" ? "workspacePlugins" : "projectPlugins";
  const say = (name: string, params?: Record<string, string>): string =>
    t(`${words}.${name}` as "workspacePlugins.title", params);
  const router = useRouter();
  const confirm = useConfirm();
  const text = useRuntimeText();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const run = (action: () => Promise<PluginActionResult>): void =>
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError("");
      setWarning(
        result.warning
          ? t("pluginsAdmin.warning", { message: result.warning })
          : "",
      );
      router.refresh();
    });

  const switchPlugin = async (plugin: WorkspacePlugin, on: boolean) => {
    if (on) {
      run(() => enable(plugin.id));
      return;
    }
    const ok = await confirm({
      title: say("switchOffTitle", { name: plugin.name }),
      description: say("switchOffDesc"),
      confirmLabel: say("switchOff"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (ok) run(() => disable(plugin.id));
  };

  /** The one line about where a plugin stands in this workspace, and how it reads. */
  const standing = (plugin: WorkspacePlugin): { tone: Tone; line: string } => {
    if (
      plugin.on &&
      plugin.blocker === null &&
      plugin.state.kind === "running"
    ) {
      return { tone: "ok", line: say("running") };
    }
    if (
      plugin.blocker === "cannot-run" ||
      (plugin.on && plugin.blocker === null)
    ) {
      return {
        tone: "problem",
        line: say("cannotRun", {
          reason: text.state(
            plugin.state,
            level === "project" ? "PROJECT" : "WORKSPACE",
          ),
        }),
      };
    }
    if (plugin.blocker) {
      return {
        tone:
          plugin.on || plugin.blocker === "platform-off" ? "problem" : "idle",
        line: say(`blocker.${plugin.blocker}`),
      };
    }
    return { tone: "idle", line: say("off") };
  };

  const columns: SettingsColumn[] = [
    { id: "on", header: t("pluginsAdmin.colOn"), width: "70px" },
  ];

  const rows: SettingsRow[] = view.plugins.map((plugin) => {
    const { tone, line } = standing(plugin);
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
              {plugin.hasCode
                ? t("pluginsAdmin.withCode")
                : t("pluginsAdmin.declarative")}
            </Badge>
            {plugin.fromStore ? (
              <Badge size="sm" mono={false}>
                {t("pluginsAdmin.sourceStore")}
              </Badge>
            ) : (
              <span
                className={styles.unsigned}
                title={t("pluginsAdmin.unsignedHint")}
              >
                <Icon icon="lucide:triangle-alert" width={12} />
                {t("pluginsAdmin.unsigned")}
              </span>
            )}
          </span>
          <span className={styles.state} data-tone={tone}>
            <Icon icon={TONE_ICON[tone]} width={14} />
            {line}
          </span>
        </span>
      ),
      cells: {
        on: (
          <Switch
            id={`${level}-plugin-${plugin.id}`}
            label={say("switchLabel", { name: plugin.name })}
            labelHidden
            checked={plugin.on}
            // Switched on, it can always be switched off; off, only where it can run.
            disabled={isPending || (!plugin.on && plugin.blocker !== null)}
            onChange={(checked) => void switchPlugin(plugin, checked)}
          />
        ),
      },
    };
  });

  return (
    <>
      <PageHeader divider={false} title={say("title")} actions={tabs} />

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
        {!view.available && (
          <output className={styles.notice}>
            <Icon icon="lucide:info" width={14} />
            {say("unavailable")}
          </output>
        )}

        {rows.length > 0 ? (
          <SettingsList
            title={say("listTitle")}
            note={<p className={styles.sectionNote}>{say("intro")}</p>}
            rows={rows}
            columns={columns}
          />
        ) : (
          view.available && (
            <section>
              <h2 className={styles.sectionNote}>{say("listTitle")}</h2>
              <p className={styles.empty}>{say("empty")}</p>
            </section>
          )
        )}

        {view.platform.length > 0 && (
          <section>
            <h2 className={styles.sectionNote}>{say("platformTitle")}</h2>
            <ul className={styles.issueList}>
              {view.platform.map((plugin) => (
                <li key={plugin.id}>
                  <strong>{plugin.name}</strong>
                  {plugin.description ? `: ${plugin.description}` : ""}
                </li>
              ))}
            </ul>
            <p className={styles.footnote}>{say("platformNote")}</p>
          </section>
        )}
      </SettingsBody>
    </>
  );
}
