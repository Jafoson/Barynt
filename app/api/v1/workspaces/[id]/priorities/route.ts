import { NextResponse } from "next/server";
import { listPrioritiesForUser } from "@/features/api-v1/options";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  insufficientScope,
  notFoundJson,
  rateLimited,
  unauthorized,
  withRateLimitHeaders,
} from "@/lib/api/respond";
import { hasScope, resolveApiUser } from "@/lib/api-auth";

/** A workspace's priorities in order. `id` is what `priority` takes when writing an issue. */
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
  const priorities = await listPrioritiesForUser(auth.userId, id);
  if (!priorities) return withRateLimitHeaders(notFoundJson(), info);
  return withRateLimitHeaders(NextResponse.json({ data: priorities }), info);
}
