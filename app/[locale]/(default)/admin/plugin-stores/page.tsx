import { PluginStores } from "@/features/plugin-stores/components/PluginStores/PluginStores";
import { getPluginStores } from "@/features/plugin-stores/queries";

export const dynamic = "force-dynamic";

/** Which plugin stores are on: the main store and any the admin connected. Needs `plugin.manage`. */
export default async function AdminPluginStoresPage() {
  const stores = await getPluginStores();
  return <PluginStores stores={stores} />;
}
