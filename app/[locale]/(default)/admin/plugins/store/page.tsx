import { PluginStore } from "@/features/plugins/components/PluginStore/PluginStore";
import { getStoreCatalogView } from "@/features/plugins/storeQueries";
import { refreshStoresForPage } from "@/features/plugins/storeRefresh";

export const dynamic = "force-dynamic";

/** Longest search the address can start with: what the search box takes. */
const MAX_QUERY = 100;

/**
 * The plugin store for the platform admin: what the stores that are on list, to find and
 * add plugins. Needs `plugin.manage`. Opening it fetches a store that was never fetched, and
 * one whose state is old after the page is sent (`refreshStoresForPage`). `?q=` starts the
 * search (the plugins page points at an update this way); it is text in a search box, nothing
 * else.
 */
export default async function AdminPluginStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const [{ locale }, { q }] = await Promise.all([params, searchParams]);
  await refreshStoresForPage();
  const view = await getStoreCatalogView(locale);
  return (
    <PluginStore
      view={view}
      initial={{ query: typeof q === "string" ? q.slice(0, MAX_QUERY) : "" }}
    />
  );
}
