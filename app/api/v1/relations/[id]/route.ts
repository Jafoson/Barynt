import { NextResponse } from "next/server";
import { removeIssueRelationForUser } from "@/features/api-v1/mutations";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  insufficientScope,
  notFoundJson,
  rateLimited,
  unauthorized,
  withRateLimitHeaders,
} from "@/lib/api/respond";
import { hasScope, resolveApiUser } from "@/lib/api-auth";

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
  const result = await removeIssueRelationForUser(auth.userId, id);
  if (!result.ok) return withRateLimitHeaders(notFoundJson(), info);

  return withRateLimitHeaders(NextResponse.json({ data: result.data }), info);
}
