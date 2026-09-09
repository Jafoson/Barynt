import { NextResponse } from "next/server";
import { updateIssueForUser } from "@/features/api-v1/mutations";
import { getIssueForUser } from "@/features/api-v1/queries";
import { pickFields } from "@/lib/api/fields";
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

  if (!hasScope(auth, "issues:read")) return insufficientScope();

  const { id } = await params;
  const issue = await getIssueForUser(auth.userId, id);
  if (!issue) return notFoundJson();

  const fields = new URL(req.url).searchParams.get("fields");
  return withRateLimitHeaders(
    NextResponse.json({ data: pickFields(issue, fields) }),
    info,
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "issues:write")) return insufficientScope();

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return withRateLimitHeaders(
      NextResponse.json({ error: { code: "invalid_body" } }, { status: 422 }),
      info,
    );
  }

  const result = await updateIssueForUser(auth.userId, id, body);
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

  return withRateLimitHeaders(NextResponse.json({ data: result.data }), info);
}
