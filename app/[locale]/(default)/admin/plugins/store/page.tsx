import { PluginStore } from "@/features/plugins/components/PluginStore/PluginStore";
import { getStoreCatalogView } from "@/features/plugins/storeQueries";

export const dynamic = "force-dynamic";

/**
 * The plugin store for the platform admin: what the stores that are on list, to find and
 * add plugins. Needs `plugin.manage`.
 */
export default async function AdminPluginStorePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const view = await getStoreCatalogView(locale);
  return <PluginStore view={view} />;
}
