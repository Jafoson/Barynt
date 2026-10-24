import { NextResponse } from "next/server";
import {
  deleteViewForApi,
  getViewForUser,
  updateViewForApi,
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

/** One saved view (BARY-172). */
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
  const view = await getViewForUser(auth.userId, id);
  if (!view) return withRateLimitHeaders(notFoundJson(), info);
  return withRateLimitHeaders(NextResponse.json({ data: view }), info);
}

export async function PATCH(
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
  return mutationJson(await updateViewForApi(auth.userId, id, body), info);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "views:write")) return insufficientScope();

  const { id } = await params;
  return mutationJson(await deleteViewForApi(auth.userId, id), info);
}
