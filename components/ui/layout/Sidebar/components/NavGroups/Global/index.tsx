import { getTranslations } from "next-intl/server";
import { getCurrentWorkspace } from "@/features/workspaces/queries";
import { GLOBAL_NAV, workspacePath } from "@/lib/nav";
import TabList, { type TabGroup } from "../components/TabList";

/** The workspace's directories: all projects, all views (BARY-178). */
async function NavGroupGlobal() {
  const t = await getTranslations("nav");
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const tabs: TabGroup[] = GLOBAL_NAV.map((entry) => ({
    href: workspacePath(workspace.id, entry.section),
    icon: entry.icon,
    label: t(entry.labelKey),
  }));

  return <TabList tabs={tabs} />;
}

export default NavGroupGlobal;
