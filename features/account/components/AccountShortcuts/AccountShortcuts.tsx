import { getTranslations } from "next-intl/server";
import { getMyPreferences } from "@/features/account/queries";
import { ShortcutsEditor } from "./ShortcutsEditor";
import { shortcutGroups } from "./shortcutGroups";

/**
 * Reference list of the app's keyboard shortcuts, with the keys changeable
 * in place. The groups themselves live in `shortcutGroups` — shared with the
 * "?" help modal, so the two can't drift apart.
 *
 * The page only gathers the data; editing is `ShortcutsEditor`, a client
 * component (it listens for key presses).
 */
export async function AccountShortcuts() {
  const [t, preferences] = await Promise.all([
    getTranslations(),
    getMyPreferences(),
  ]);

  return (
    <ShortcutsEditor
      groups={shortcutGroups(t)}
      overrides={preferences.shortcutOverrides}
      confirmDestructive={preferences.confirmDestructive}
    />
  );
}
