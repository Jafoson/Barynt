import { NextResponse } from "next/server";
import { createLabelForUser } from "@/features/api-v1/mutations";
import { listLabelsForUser } from "@/features/api-v1/queries";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  insufficientScope,
  notFoundJson,
  rateLimited,
  unauthorized,
  withRateLimitHeaders,
} from "@/lib/api/respond";
import { hasScope, resolveApiUser } from "@/lib/api-auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "labels:read")) return insufficientScope();

  const { id } = await params;
  const data = await listLabelsForUser(auth.userId, id);
  if (!data) return withRateLimitHeaders(notFoundJson(), info);

  return withRateLimitHeaders(NextResponse.json({ data }), info);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "labels:write")) return insufficientScope();

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return withRateLimitHeaders(
      NextResponse.json({ error: { code: "invalid_body" } }, { status: 422 }),
      info,
    );
  }

  const result = await createLabelForUser(auth.userId, id, body);
  if (!result.ok) {
    const res =
      result.status === 404
        ? notFoundJson()
        : NextResponse.json(
            { error: { code: "invalid_body" } },
            { status: 422 },
          );
    return withRateLimitHeaders(res, info);
  }

  return withRateLimitHeaders(
    NextResponse.json({ data: result.data }, { status: 201 }),
    info,
  );
}
