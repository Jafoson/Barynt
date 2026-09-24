import { PluginStore } from "@/features/plugins/components/PluginStore/PluginStore";
import { getStoreCatalogView } from "@/features/plugins/storeQueries";
import { refreshStoresForPage } from "@/features/plugins/storeRefresh";

export const dynamic = "force-dynamic";

/**
 * The plugin store for the platform admin: what the stores that are on list, to find and
 * add plugins. Needs `plugin.manage`. Opening it fetches a store that was never fetched, and
 * one whose state is old after the page is sent (`refreshStoresForPage`).
 */
export default async function AdminPluginStorePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await refreshStoresForPage();
  const view = await getStoreCatalogView(locale);
  return <PluginStore view={view} />;
}
