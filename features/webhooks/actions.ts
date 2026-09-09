"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { isWebhookEvent, type WebhookEvent } from "@/lib/webhooks/events";

// `createWebhook` is wired to a form and returns `{error}` for validation
// (bad URL, no events) — same convention as `inviteWorkspaceMember`.
// `setWebhookEnabled`/`deleteWebhook` are row actions and throw on failure,
// same convention as `setMemberRole`/`removeMember`
// (`features/workspaces/actions.ts`) — `requirePermission` throwing
// `PermissionError` is exactly that failure mode, nothing further to add.

export async function createWebhook(
  workspaceId: string,
  input: { url: string; events: WebhookEvent[] },
): Promise<{ ok: true; secret: string; id: string } | { error: string }> {
  const userId = await requirePermission("webhook.manage", { workspaceId });

  const url = input.url.trim();
  if (!url) return { error: "URL is required." };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { error: "The URL must start with http:// or https://." };
    }
  } catch {
    return { error: "Enter a valid URL." };
  }

  const events = [...new Set(input.events)].filter(isWebhookEvent);
  if (events.length === 0) return { error: "Select at least one event." };

  // 32 bytes from the OS's random number generator, same as API keys
  // (`lib/api-auth.ts`) and invitation tokens (`lib/invitations.ts`) — but
  // this one stays in the clear (`prisma/schema.prisma`'s comment on
  // `Webhook.secret` explains why: it has to be read back to sign every
  // delivery, not just compared against).
  const secret = randomBytes(32).toString("base64url");

  const webhook = await db.webhook.create({
    data: { workspaceId, url, secret, events, createdById: userId },
    select: { id: true },
  });

  revalidatePath("/", "layout");
  return { ok: true, secret, id: webhook.id };
}

export async function setWebhookEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  const webhook = await db.webhook.findUnique({
    where: { id },
    select: { workspaceId: true },
  });
  if (!webhook) return;
  await requirePermission("webhook.manage", {
    workspaceId: webhook.workspaceId,
  });

  await db.webhook.update({ where: { id }, data: { enabled } });
  revalidatePath("/", "layout");
}

export async function deleteWebhook(id: string): Promise<void> {
  const webhook = await db.webhook.findUnique({
    where: { id },
    select: { workspaceId: true },
  });
  if (!webhook) return;
  await requirePermission("webhook.manage", {
    workspaceId: webhook.workspaceId,
  });

  await db.webhook.delete({ where: { id } });
  revalidatePath("/", "layout");
}
