import { currentUserId, hasPermission } from "@/lib/permissions";
import { subscribeProjectChange } from "@/lib/realtime/bus";

// Same auth shape as `app/api/issues/[id]/route.ts`: this path lies outside
// the middleware matcher (`proxy.ts` excludes `/api`), so the session and
// project-visibility checks happen here instead.
//
// Server-Sent Events, not a WebSocket: the only thing this connection ever
// sends is "something changed, go refetch" — one direction, server to
// client — and SSE is the smaller mechanism for that (plain HTTP, auto
// reconnect built into `EventSource`, no extra dependency).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return new Response(null, { status: 401 });

  const { id: projectId } = await params;
  if (!(await hasPermission("project.view", { projectId }))) {
    return new Response(null, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = subscribeProjectChange(projectId, (event) => {
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
