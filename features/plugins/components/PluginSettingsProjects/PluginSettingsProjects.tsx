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
import type { SettingsAreaProjectPlugin } from "@/features/plugins/settingsArea";
import { pluginSettingsPath } from "@/lib/nav";
import styles from "./pluginSettingsProjects.module.scss";

interface Props {
  workspaceId: string;
  plugin: SettingsAreaProjectPlugin;
}

/**
 * The page of a plugin that is set per project: what the plugin is, and the projects it is on in
 * that this person may set up, each with a way into its settings there. Nothing is edited here, so
 * it is a plain server component.
 */
export function PluginSettingsProjects({ workspaceId, plugin }: Props) {
  const t = useTranslations();

  const rows: SettingsRow[] = plugin.projects.map((project) => ({
    id: project.slug,
    label: project.name,
    control: (
      <LinkButton
        href={pluginSettingsPath(workspaceId, plugin.id, project.slug)}
        variant="text"
        size="sm"
        icon={<Icon icon="lucide:sliders-horizontal" width={14} />}
      >
        {t("pluginSettings.open")}
      </LinkButton>
    ),
  }));

  return (
    <>
      <PageHeader divider={false} title={plugin.name} />
      <SettingsBody>
        <div className={styles.intro}>
          {plugin.description && (
            <p className={styles.description}>{plugin.description}</p>
          )}
          <p className={styles.meta}>
            <Badge size="sm" mono>
              {plugin.version}
            </Badge>
            <span>{t("pluginSettings.chooseProject")}</span>
          </p>
        </div>
        <SettingsList title={t("pluginSettings.projectsTitle")} rows={rows} />
      </SettingsBody>
    </>
  );
}
