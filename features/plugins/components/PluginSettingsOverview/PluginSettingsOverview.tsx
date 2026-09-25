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
 * a way into its settings, or the note that it has none. Nothing is edited here, and it needs no
 * state, so it is a plain server component. Where nothing is switched on it says so and points to
 * where plugins are switched on.
 */
export function PluginSettingsOverview({ workspaceId, area }: Props) {
  const t = useTranslations();

  const rows: SettingsRow[] = area.plugins.map((plugin) => ({
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
    control: plugin.settings ? (
      <LinkButton
        href={pluginSettingsPath(workspaceId, plugin.id)}
        variant="text"
        size="sm"
        icon={<Icon icon="lucide:sliders-horizontal" width={14} />}
      >
        {t("pluginSettings.open")}
      </LinkButton>
    ) : (
      <span className={styles.none}>{t("pluginSettings.noSettings")}</span>
    ),
  }));

  return (
    <>
      <PageHeader divider={false} title={t("pluginSettings.overviewTitle")} />
      <SettingsBody>
        {rows.length > 0 ? (
          <SettingsList
            title={t("pluginSettings.listTitle")}
            note={
              <p className={styles.intro}>
                {t("pluginSettings.overviewIntro")}
              </p>
            }
            rows={rows}
          />
        ) : (
          <section className={styles.empty}>
            <p>{t("pluginSettings.empty")}</p>
            <LinkButton
              href={workspaceSettingsPath(workspaceId, "plugins")}
              variant="outline"
              size="sm"
            >
              {t("pluginSettings.emptyLink")}
            </LinkButton>
          </section>
        )}
      </SettingsBody>
    </>
  );
}
