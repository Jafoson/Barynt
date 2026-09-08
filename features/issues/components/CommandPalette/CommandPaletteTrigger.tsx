import { getIssueComposerData } from "@/features/issues/editor-data";
import { CommandPaletteTriggerClient } from "./CommandPaletteTriggerClient";

// Server Component: resolves the same composer bundle `NewIssueButton`
// uses (`getIssueComposerData`, `cache()`-wrapped — free to call again
// within the same request), hands it to the client logic. Admin routes
// have no workspace, so there's nothing to search; without composer data
// elsewhere (no workspace, or nothing creatable — `getIssueComposerData`
// returns `null` either way), the palette stays silent rather than
// opening broken.
export async function CommandPaletteTrigger({
  isAdminRoute = false,
}: {
  isAdminRoute?: boolean;
}) {
  if (isAdminRoute) return null;

  const data = await getIssueComposerData();
  if (!data) return null;

  return <CommandPaletteTriggerClient data={data} />;
}
