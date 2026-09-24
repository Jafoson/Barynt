import { PluginStores } from "@/features/plugin-stores/components/PluginStores/PluginStores";
import {
  getPluginStores,
  getPluginStoreVisibility,
  getUnsignedPluginsAllowed,
} from "@/features/plugin-stores/queries";

export const dynamic = "force-dynamic";

/**
 * Which plugin stores are on and whether plugins from no store are allowed: the
 * main store and any the admin connected. Needs `plugin.manage`.
 */
export default async function AdminPluginStoresPage() {
  const [stores, allowUnsigned, visibility] = await Promise.all([
    getPluginStores(),
    getUnsignedPluginsAllowed(),
    getPluginStoreVisibility(),
  ]);
  return (
    <PluginStores
      stores={stores}
      allowUnsigned={allowUnsigned}
      visibility={visibility}
    />
  );
}
