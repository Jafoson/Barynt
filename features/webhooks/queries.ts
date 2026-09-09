import "server-only";
import { cache } from "react";
import type { WebhooksView } from "@/features/webhooks/types";
import { db } from "@/lib/db";
import { accessFor, currentUserId } from "@/lib/permissions";
import type { WebhookEvent } from "@/lib/webhooks/events";

/** A workspace's webhooks — `null` means the caller can't manage them
 *  (mirrors `getPendingWorkspaceInvitationsView`'s shape: entry to the
 *  workspace isn't enough, `webhook.manage` specifically is required). */
export const getWorkspaceWebhooks = cache(
  async (workspaceId: string): Promise<WebhooksView | null> => {
    const actorId = await currentUserId();
    const access = await accessFor(actorId, { workspaceId });
    if (!access.has("webhook.manage")) return null;

    const rows = await db.webhook.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        events: true,
        enabled: true,
        createdAt: true,
        lastDeliveryAt: true,
        lastDeliveryStatus: true,
        lastDeliveryError: true,
      },
    });

    return {
      webhooks: rows.map((row) => ({
        ...row,
        events: row.events as WebhookEvent[],
      })),
    };
  },
);
