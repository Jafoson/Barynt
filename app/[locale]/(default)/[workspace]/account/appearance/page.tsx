import { AccountAppearance } from "@/features/account/components/AccountAppearance/AccountAppearance";
import { getMyPreferences } from "@/features/account/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/** Theme, language, date and time. */
export default async function AccountAppearancePage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  setCurrentWorkspaceId(workspace);

  const preferences = await getMyPreferences();

  return (
    <AccountAppearance
      theme={preferences.theme}
      dateTime={{
        dateFormat: preferences.dateFormat,
        weekStart: preferences.weekStart,
        timeZone: preferences.timeZone,
      }}
      timeZones={Intl.supportedValuesOf("timeZone")}
    />
  );
}
