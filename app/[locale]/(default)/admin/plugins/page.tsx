import { PluginsAdmin } from "@/features/plugins/components/PluginsAdmin/PluginsAdmin";
import { getPluginsOverview } from "@/features/plugins/queries";

export const dynamic = "force-dynamic";

/**
 * The plugins of the platform: what is installed and what became of it, what lies
 * in the plugin directory, and the actions on both. Needs `plugin.manage`.
 */
export default async function AdminPluginsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const overview = await getPluginsOverview(locale);
  return <PluginsAdmin overview={overview} />;
}
