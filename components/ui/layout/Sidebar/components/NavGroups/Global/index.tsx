import { getTranslations } from "next-intl/server";
import { systemViewSlug } from "@/features/views/system";
import { viewPath } from "@/features/views/url";
import { getCurrentWorkspace } from "@/features/workspaces/queries";
import { GLOBAL_NAV, workspacePath } from "@/lib/nav";
import TabList, { type TabGroup } from "../components/TabList";

async function NavGroupGlobal() {
  const t = await getTranslations("nav");
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  // "My tasks" is a system view since V8 — straight there once it exists
  // (`/my` redirects there and creates it otherwise).
  const mySlug = await systemViewSlug(workspace.id, "my-issues");

  const tabs: TabGroup[] = GLOBAL_NAV.map((entry) => {
    if (entry.section === "my" && mySlug) {
      const href = viewPath(workspace.id, null, mySlug);
      return {
        href,
        activeHref: `${href}/*`,
        icon: entry.icon,
        label: t(entry.labelKey),
      };
    }
    const href = workspacePath(workspace.id, entry.section);
    return {
      href,
      icon: entry.icon,
      label: t(entry.labelKey),
      ...(entry.section === "my" ? { activeHref: `${href}/*` } : {}),
    };
  });

  return <TabList tabs={tabs} />;
}

export default NavGroupGlobal;
