import { getTranslations } from "next-intl/server";
import { ADMIN_NAV, adminPath, navEntryAllowed } from "@/lib/nav";
import { getAccess, PLATFORM } from "@/lib/permissions";
import TabList, { type TabGroup } from "../components/TabList";

/**
 * The sections of platform administration.
 *
 * Filtered by what the platform role grants: the roles at this level are
 * scoped differently, and Support, for instance, doesn't manage accounts.
 * The filter is a courtesy, not a safeguard — the queries behind it check
 * for themselves (`features/admin/queries.ts`).
 */
async function NavGroupAdmin() {
  const t = await getTranslations("nav");
  const access = await getAccess(PLATFORM);

  const tabs: TabGroup[] = ADMIN_NAV.filter((entry) =>
    navEntryAllowed(access.has, entry),
  ).map((entry) => {
    const href = adminPath(entry.section);
    return {
      href,
      icon: entry.icon,
      label: t(entry.labelKey),
      // The plugins have a second page under theirs, the store.
      ...(entry.section === "plugins" ? { activeHref: `${href}/*` } : {}),
    };
  });

  return <TabList tabs={tabs} />;
}

export default NavGroupAdmin;
