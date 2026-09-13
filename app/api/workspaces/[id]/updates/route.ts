import { currentUserCanEnterWorkspace, currentUserId } from "@/lib/permissions";
import { subscribeProjectChange } from "@/lib/realtime/bus";

// Explicit, not inferred: a streaming response with no fixed body shouldn't
// be a candidate for static optimization in the first place, but this route
// exists specifically to defeat proxy/CDN buffering (see the padding
// comment below) — leaving its own dynamic-ness to inference would be an
// odd thing to get wrong here of all places.
export const dynamic = "force-dynamic";

// Same auth shape as `app/api/issues/[id]/route.ts`: this path lies outside
// the middleware matcher (`proxy.ts` excludes `/api`), so the session and
// workspace-visibility checks happen here instead.
//
// Server-Sent Events, not a WebSocket: the only thing this connection ever
// sends is "something changed, go refetch" — one direction, server to
// client — and SSE is the smaller mechanism for that (plain HTTP, auto
// reconnect built into `EventSource`, no extra dependency).
//
// Scoped to the workspace, not a single project — see the comment on
// `channel()` in lib/realtime/bus.ts for why: the cross-project "My issues"
// board has no single project to subscribe to.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return new Response(null, { status: 401 });

  const { id: workspaceId } = await params;
  if (!(await currentUserCanEnterWorkspace(workspaceId))) {
    return new Response(null, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Padding, not a bug: some intermediaries between browser and origin
      // (this deployment's production path goes through a Cloudflare
      // Tunnel, not the Caddy this repo documents) hold back the first
      // chunk of a response until enough bytes have accumulated to make
      // buffering worthwhile, which for a quiet SSE stream can mean never.
      // A 2KB comment line as the very first thing sent pushes past that
      // threshold immediately — a widely documented fix for SSE behind such
      // proxies/CDNs. `EventSource` ignores comment lines (a leading `:`).
      controller.enqueue(encoder.encode(`:${" ".repeat(2048)}\n\n`));

      const unsubscribe = subscribeProjectChange(workspaceId, (event) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      });

      // Comment lines (`:`) are valid SSE and ignored by `EventSource` —
      // this exists purely so idle proxies (Caddy) and browsers don't treat
      // a quiet connection as dead and close it.
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 25_000);

      const close = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed from the other end — nothing left to do.
        }
      };
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disables Nginx-style response buffering some reverse proxies apply
      // by default — without it, events could sit unflushed for a while.
      "X-Accel-Buffering": "no",
    },
  });
}
