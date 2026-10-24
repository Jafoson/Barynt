import { NextResponse } from "next/server";
import {
  createViewForApi,
  listProjectViewsForUser,
} from "@/features/api-v1/views";
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

/** The saved views here the caller sees (BARY-172). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "views:read")) return insufficientScope();

  const { id } = await params;
  const views = await listProjectViewsForUser(auth.userId, id);
  if (!views) return withRateLimitHeaders(notFoundJson(), info);
  return withRateLimitHeaders(NextResponse.json({ data: views }), info);
}

/** A new view here — private unless `visibility` says otherwise. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "views:write")) return insufficientScope();

  const { id } = await params;
  const body = await req.json().catch(() => null);
  return mutationJson(
    await createViewForApi(auth.userId, { projectId: id }, body),
    info,
    201,
  );
}
