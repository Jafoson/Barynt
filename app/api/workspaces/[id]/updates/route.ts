import { NextResponse } from "next/server";
import { currentUserCanEnterWorkspace, currentUserId } from "@/lib/permissions";
import { getLastChange } from "@/lib/realtime/store";

// Same auth shape as `app/api/issues/[id]/route.ts`: this path lies outside
// the middleware matcher (`proxy.ts` excludes `/api`), so the session and
// workspace-visibility checks happen here instead.
//
// Polled every few seconds by `useProjectUpdates`, not streamed — see the
// comment on `revalidate()` in `features/issues/actions.ts` for why this
// isn't Server-Sent Events. A plain, short-lived GET has nothing for a
// reverse proxy, CDN, or tunnel in between to buffer.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return new Response(null, { status: 401 });

  const { id: workspaceId } = await params;
  if (!(await currentUserCanEnterWorkspace(workspaceId))) {
    return new Response(null, { status: 404 });
  }

  const change = getLastChange(workspaceId);
  return NextResponse.json(change, {
    headers: { "Cache-Control": "no-store" },
  });
}
