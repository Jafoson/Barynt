import { NextResponse } from "next/server";
import { listStatusesForUser } from "@/features/api-v1/views";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  insufficientScope,
  notFoundJson,
  rateLimited,
  unauthorized,
  withRateLimitHeaders,
} from "@/lib/api/respond";
import { hasScope, resolveApiUser } from "@/lib/api-auth";

/** A workspace's statuses with their categories, in board order
 *  (BARY-172). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "workspaces:read")) return insufficientScope();

  const { id } = await params;
  const statuses = await listStatusesForUser(auth.userId, id);
  if (!statuses) return withRateLimitHeaders(notFoundJson(), info);
  return withRateLimitHeaders(NextResponse.json({ data: statuses }), info);
}
