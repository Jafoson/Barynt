import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import type { WebhookEvent } from "@/lib/webhooks/events";

/**
 * Fires a webhook event at every enabled webhook of a workspace that's
 * subscribed to it. Fire-and-forget from the caller's point of view — call
 * this without `await`, same as the `lastUsedAt` touch in
 * `lib/api-auth.ts`. Never throws.
 *
 * Single delivery attempt, no retry: that would need a durable queue,
 * which this app doesn't have. The outcome (status or error) lands on the
 * webhook row (`lastDeliveryAt/-Status/-Error`) for the settings UI to
 * show — a conscious simplification, not an oversight.
 */
export function fireWebhookEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: unknown,
): void {
  deliverWebhookEvent(workspaceId, event, data).catch(() => {});
}

/** The awaited version of `fireWebhookEvent` — same thing, but returns the
 *  promise instead of swallowing it. Real call sites want the fire-and-
 *  forget wrapper above; this one exists so tests can await completion. */
export async function deliverWebhookEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: unknown,
): Promise<void> {
  const hooks = await db.webhook.findMany({
    where: { workspaceId, enabled: true, events: { has: event } },
    select: { id: true, url: true, secret: true },
  });
  if (hooks.length === 0) return;

  const payload = JSON.stringify({ event, timestamp: Date.now(), data });

  await Promise.all(hooks.map((hook) => deliverOne(hook, payload)));
}

/** Hex, no `sha256=` prefix — same convention as Linear's `Linear-Signature`
 *  header, over `<timestamp>.<body>` rather than the body alone, so a
 *  captured signature can't be replayed against a different payload sent
 *  at a different time. */
export function signPayload(
  secret: string,
  timestamp: string,
  payload: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
}

async function deliverOne(
  hook: { id: string; url: string; secret: string },
  payload: string,
): Promise<void> {
  const timestamp = Date.now().toString();
  const signature = signPayload(hook.secret, timestamp, payload);

  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-barynt-signature": signature,
        "x-barynt-timestamp": timestamp,
      },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });
    await db.webhook.update({
      where: { id: hook.id },
      data: {
        lastDeliveryAt: new Date(),
        lastDeliveryStatus: res.status,
        lastDeliveryError: null,
      },
    });
  } catch (err) {
    await db.webhook
      .update({
        where: { id: hook.id },
        data: {
          lastDeliveryAt: new Date(),
          lastDeliveryStatus: null,
          lastDeliveryError:
            err instanceof Error ? err.message : "Unknown error",
        },
      })
      .catch(() => {});
  }
}
