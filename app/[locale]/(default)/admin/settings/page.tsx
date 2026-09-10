import { SystemSettingsView } from "@/features/system-settings/components/SystemSettingsView/SystemSettingsView";
import { getSystemSettingsData } from "@/features/system-settings/queries";

export const dynamic = "force-dynamic";

/** Whether workspace creation is allowed platform-wide, and the default
 *  workspace accounts fall back to when it isn't — see `lib/system-settings.ts`. */
export default async function AdminSettingsPage() {
  const data = await getSystemSettingsData();
  return <SystemSettingsView data={data} />;
}
