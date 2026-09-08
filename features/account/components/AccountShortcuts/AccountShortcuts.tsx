import { getTranslations } from "next-intl/server";
import { Shortcut } from "@/components/ui/atoms/Shortcut/Shortcut";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import {
  SettingsBody,
  SettingsList,
} from "@/components/ui/layout/SettingsList/SettingsList";
import { shortcutGroups } from "./shortcutGroups";

/**
 * Reference list of the app's keyboard shortcuts. The groups themselves
 * live in `shortcutGroups` — shared with the "?" help modal, so the two
 * can't drift apart.
 *
 * No data of its own, so this stays a Server Component — `Shortcut` (the
 * only piece that needs the browser, to tell ⌘ from Strg) is a client
 * component further down, which is enough.
 */
export async function AccountShortcuts() {
  const t = await getTranslations();
  const groups = shortcutGroups(t);

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.shortcuts")}
        description={t("account.shortcutsDesc")}
      />

      <SettingsBody>
        {groups.map((group) => (
          <SettingsList
            key={group.title}
            title={group.title}
            rows={group.rows.map((row) => ({
              id: row.id,
              label: row.label,
              desc: row.desc,
              control: <Shortcut keys={row.keys} />,
            }))}
          />
        ))}
      </SettingsBody>
    </>
  );
}
