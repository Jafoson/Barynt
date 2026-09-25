import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { LinkButton } from "@/components/ui/atoms/LinkButton/LinkButton";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import {
  SettingsBody,
  SettingsList,
  type SettingsRow,
} from "@/components/ui/layout/SettingsList/SettingsList";
import type { SettingsArea } from "@/features/plugins/settingsArea";
import { pluginSettingsPath, workspaceSettingsPath } from "@/lib/nav";
import styles from "./pluginSettingsOverview.module.scss";

interface Props {
  workspaceId: string;
  area: SettingsArea;
}

/**
 * The start page of the plugins' settings: the plugins this workspace has switched on, each with
 * a way into its settings, or the note that it has none; and the plugins that are set per project,
 * with the projects they are on in. Nothing is edited here, and it needs no state, so it is a plain
 * server component. Where nothing is switched on it says so and, for someone who may switch plugins
 * on in the workspace, points to where that is done.
 */
export function PluginSettingsOverview({ workspaceId, area }: Props) {
  const t = useTranslations();

  const settingsLink = (pluginId: string) => (
    <LinkButton
      href={pluginSettingsPath(workspaceId, pluginId)}
      variant="text"
      size="sm"
      icon={<Icon icon="lucide:sliders-horizontal" width={14} />}
    >
      {t("pluginSettings.open")}
    </LinkButton>
  );
  const none = (
    <span className={styles.none}>{t("pluginSettings.noSettings")}</span>
  );

  const workspaceRows: SettingsRow[] = area.plugins.map((plugin) => ({
    id: plugin.id,
    label: plugin.name,
    desc: (
      <span className={styles.info}>
        {plugin.description && <span>{plugin.description}</span>}
        <span className={styles.meta}>
          <Badge size="sm" mono>
            {plugin.version}
          </Badge>
        </span>
      </span>
    ),
    control: plugin.settings ? settingsLink(plugin.id) : none,
  }));

  const projectRows: SettingsRow[] = area.projectPlugins.map((plugin) => ({
    id: plugin.id,
    label: plugin.name,
    desc: (
      <span className={styles.info}>
        {plugin.description && <span>{plugin.description}</span>}
        <span className={styles.meta}>
          <Badge size="sm" mono>
            {plugin.version}
          </Badge>
          <span className={styles.where}>
            {t("pluginSettings.inProjects", {
              projects: plugin.projects
                .map((project) => project.name)
                .join(", "),
            })}
          </span>
        </span>
      </span>
    ),
    control: plugin.projects.some((project) => project.settings)
      ? settingsLink(plugin.id)
      : none,
  }));

  const nothing = workspaceRows.length === 0 && projectRows.length === 0;

  return (
    <>
      <PageHeader divider={false} title={t("pluginSettings.overviewTitle")} />
      <SettingsBody>
        {workspaceRows.length > 0 && (
          <SettingsList
            title={t("pluginSettings.listTitle")}
            note={
              <p className={styles.intro}>
                {t("pluginSettings.overviewIntro")}
              </p>
            }
            rows={workspaceRows}
          />
        )}
        {projectRows.length > 0 && (
          <SettingsList
            title={t("pluginSettings.projectListTitle")}
            note={
              <p className={styles.intro}>
                {t("pluginSettings.projectListIntro")}
              </p>
            }
            rows={projectRows}
          />
        )}
        {nothing && (
          <section className={styles.empty}>
            <p>
              {t(
                area.ownWorkspace
                  ? "pluginSettings.empty"
                  : "pluginSettings.emptyProjects",
              )}
            </p>
            {area.ownWorkspace && (
              <LinkButton
                href={workspaceSettingsPath(workspaceId, "plugins")}
                variant="outline"
                size="sm"
              >
                {t("pluginSettings.emptyLink")}
              </LinkButton>
            )}
          </section>
        )}
      </SettingsBody>
    </>
  );
}
