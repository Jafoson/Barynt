import { NextResponse } from "next/server";
import { listIssueTypesForUser } from "@/features/api-v1/options";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  insufficientScope,
  notFoundJson,
  rateLimited,
  unauthorized,
  withRateLimitHeaders,
} from "@/lib/api/respond";
import { hasScope, resolveApiUser } from "@/lib/api-auth";

/** A workspace's issue types in order. `id` is what `type` takes when writing an issue. */
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
  const issueTypes = await listIssueTypesForUser(auth.userId, id);
  if (!issueTypes) return withRateLimitHeaders(notFoundJson(), info);
  return withRateLimitHeaders(NextResponse.json({ data: issueTypes }), info);
}
