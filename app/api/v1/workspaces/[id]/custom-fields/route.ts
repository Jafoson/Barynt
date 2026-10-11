import { NextResponse } from "next/server";
import { listCustomFieldsForUser } from "@/features/api-v1/queries";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  insufficientScope,
  notFoundJson,
  rateLimited,
  unauthorized,
  withRateLimitHeaders,
} from "@/lib/api/respond";
import { hasScope, resolveApiUser } from "@/lib/api-auth";

/** The workspace's custom fields: workspace-wide ones and those of projects the caller can see. */
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
  const data = await listCustomFieldsForUser(auth.userId, id);
  if (!data) return withRateLimitHeaders(notFoundJson(), info);

  return withRateLimitHeaders(NextResponse.json({ data }), info);
}
