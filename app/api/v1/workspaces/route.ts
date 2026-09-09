import { NextResponse } from "next/server";
import { createWorkspaceForUser } from "@/features/api-v1/mutations";
import { listWorkspacesForUser } from "@/features/api-v1/queries";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  insufficientScope,
  notFoundJson,
  rateLimited,
  unauthorized,
  withRateLimitHeaders,
} from "@/lib/api/respond";
import { hasScope, resolveApiUser } from "@/lib/api-auth";

// Lies outside the auth middleware (`proxy.ts` excludes all of `/api`) —
// authenticates itself via a Bearer token instead of the cookie session
// (`lib/api-auth.ts`), same as every other route under `app/api/v1`.
export async function GET(req: Request) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "workspaces:read")) return insufficientScope();

  const data = await listWorkspacesForUser(auth.userId);
  return withRateLimitHeaders(NextResponse.json({ data }), info);
}

export async function POST(req: Request) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "workspaces:write")) return insufficientScope();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return withRateLimitHeaders(
      NextResponse.json({ error: { code: "invalid_body" } }, { status: 422 }),
      info,
    );
  }

  const result = await createWorkspaceForUser(auth.userId, body);
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
