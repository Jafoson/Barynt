import { redirect } from "next/navigation";
import { workspacePath } from "@/lib/nav";

/**
 * The workspace root. Its overview is the dashboard now (BARY-169) — the
 * "about" widget carries what the old profile page showed.
 */
export default async function WorkspaceRootPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  redirect(`/${locale}${workspacePath(workspace, "dashboard")}`);
}
