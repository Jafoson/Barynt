import { notFound, redirect } from "next/navigation";
import { ensureSystemViews } from "@/features/views/system";
import { canEnterWorkspace, currentUserId } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** "My issues" as a list was its own page before V8 — it leads to the system view. */
export default async function MyListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; workspace: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { locale, workspace } = await params;
  const query = new URLSearchParams(await searchParams);
  const userId = await currentUserId();
  if (!userId || !(await canEnterWorkspace(userId, workspace))) notFound();
  const slugs = await ensureSystemViews(workspace);
  // An open issue panel or a search comes along; the view page fills in its
  // own state.
  redirect(
    `/${locale}/${workspace}/view/${slugs["my-issues"]}${query.size ? `?${query}` : ""}`,
  );
}
