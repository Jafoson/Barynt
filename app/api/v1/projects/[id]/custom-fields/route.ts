import { NextResponse } from "next/server";
import { listProjectCustomFieldsForUser } from "@/features/api-v1/queries";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  insufficientScope,
  notFoundJson,
  rateLimited,
  unauthorized,
  withRateLimitHeaders,
} from "@/lib/api/respond";
import { hasScope, resolveApiUser } from "@/lib/api-auth";

/** The custom fields that apply to one project: the workspace's and its own. */
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
  const data = await listProjectCustomFieldsForUser(auth.userId, id);
  if (!data) return withRateLimitHeaders(notFoundJson(), info);

  return withRateLimitHeaders(NextResponse.json({ data }), info);
}
