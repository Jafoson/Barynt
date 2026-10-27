import { NextResponse } from "next/server";
import { deleteAttachmentForUser } from "@/features/api-v1/mutations";
import { getAttachmentForUser } from "@/features/api-v1/queries";
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

/** One attachment, with a freshly signed `url` — for when the one from an
 *  earlier response has expired. */
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
  const found = await getAttachmentForUser(auth.userId, id);
  if (!found) return withRateLimitHeaders(notFoundJson(), info);

  return withRateLimitHeaders(
    NextResponse.json({ data: found.attachment }),
    info,
  );
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "issues:write")) return insufficientScope();

  const { id } = await params;
  return mutationJson(await deleteAttachmentForUser(auth.userId, id), info);
}
