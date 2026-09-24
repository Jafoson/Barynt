import { PluginStores } from "@/features/plugin-stores/components/PluginStores/PluginStores";
import {
  getPluginStores,
  getUnsignedPluginsAllowed,
} from "@/features/plugin-stores/queries";

export const dynamic = "force-dynamic";

/**
 * Which plugin stores are on and whether plugins from no store are allowed: the
 * main store and any the admin connected. Needs `plugin.manage`.
 */
export default async function AdminPluginStoresPage() {
  const [stores, allowUnsigned] = await Promise.all([
    getPluginStores(),
    getUnsignedPluginsAllowed(),
  ]);
  return <PluginStores stores={stores} allowUnsigned={allowUnsigned} />;
}
