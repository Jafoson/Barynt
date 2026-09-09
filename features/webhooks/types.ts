import type { WebhookEvent } from "@/lib/webhooks/events";

/** A workspace's webhook endpoint. Never carries the secret — that's only
 *  ever returned once, at creation (`createWebhook`). */
export interface WebhookRow {
  id: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  createdAt: Date;
  lastDeliveryAt: Date | null;
  lastDeliveryStatus: number | null;
  lastDeliveryError: string | null;
}

export interface WebhooksView {
  webhooks: WebhookRow[];
}
