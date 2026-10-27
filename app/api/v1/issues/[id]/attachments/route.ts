import { NextResponse } from "next/server";
import { createAttachmentForUser } from "@/features/api-v1/mutations";
import { listAttachmentsForUser } from "@/features/api-v1/queries";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  insufficientScope,
  mutationJson,
  notFoundJson,
  rateLimited,
  unauthorized,
  withRateLimitHeaders,
} from "@/lib/api/respond";
import { hasScope, resolveApiUser } from "@/lib/api-auth";

// Attachments belong to the issue — read with `issues:read`, written with
// `issues:write`, the same split the app makes (editing an issue covers its
// attachments, no permission of their own).

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "issues:read")) return insufficientScope();

  const { id } = await params;
  const attachments = await listAttachmentsForUser(auth.userId, id);
  if (!attachments) return withRateLimitHeaders(notFoundJson(), info);

  return withRateLimitHeaders(NextResponse.json({ data: attachments }), info);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "issues:write")) return insufficientScope();

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return withRateLimitHeaders(
      NextResponse.json({ error: { code: "invalid_body" } }, { status: 422 }),
      info,
    );
  }

  return mutationJson(
    await createAttachmentForUser(auth.userId, id, body),
    info,
    201,
  );
}
