import { NextResponse } from "next/server";
import type { RateLimitInfo } from "@/lib/api/rateLimit";

/** No or invalid/revoked/expired token — the caller already knows what it
 *  sent, there's nothing to leak by naming the reason. */
export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: { code: "unauthorized" } },
    { status: 401 },
  );
}

/** The token doesn't carry the scope this route requires. */
export function insufficientScope(): NextResponse {
  return NextResponse.json(
    { error: { code: "insufficient_scope" } },
    { status: 403 },
  );
}

/** Workspace creation is off platform-wide (`lib/system-settings.ts`) — not
 *  a scope problem, so it gets its own code instead of `insufficient_scope`. */
export function workspaceCreationDisabled(): NextResponse {
  return NextResponse.json(
    { error: { code: "workspace_creation_disabled" } },
    { status: 403 },
  );
}

/** A resource doesn't exist, or `can()` said no — same response either way,
 *  so a missing permission doesn't reveal that the resource exists (mirrors
 *  `app/api/issues/[id]/route.ts`). */
export function notFoundJson(): NextResponse {
  return NextResponse.json(null, { status: 404 });
}

/** Every response — success or error — carries the caller's current budget,
 *  same convention as Jira/Linear's `X-RateLimit-*` headers. */
export function withRateLimitHeaders(
  res: NextResponse,
  info: RateLimitInfo,
): NextResponse {
  res.headers.set("X-RateLimit-Limit", String(info.limit));
  res.headers.set("X-RateLimit-Remaining", String(info.remaining));
  res.headers.set("X-RateLimit-Reset", String(info.resetAt));
  return res;
}

/** The key's per-minute budget (`lib/api/rateLimit.ts`) is used up. */
export function rateLimited(info: RateLimitInfo): NextResponse {
  const res = NextResponse.json(
    { error: { code: "rate_limited" } },
    { status: 429 },
  );
  res.headers.set(
    "Retry-After",
    String(Math.max(Math.ceil((info.resetAt - Date.now()) / 1000), 0)),
  );
  return withRateLimitHeaders(res, info);
}

/** The caller sees the resource but may not change it — a shared view
 *  someone else made, without `view.manage` (BARY-172). */
export function forbiddenJson(): NextResponse {
  return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
}

/** A `MutationResult` as a response: 404 not visible, 403 not allowed,
 *  422 bad input (with the specific code and message where the mutation
 *  gives one), else the data. */
export function mutationJson<T>(
  result:
    | { ok: true; data: T }
    | {
        ok: false;
        status: 403 | 404 | 422;
        error?: { code: string; message: string };
      },
  info: RateLimitInfo,
  status = 200,
): NextResponse {
  if (result.ok) {
    return withRateLimitHeaders(
      NextResponse.json({ data: result.data }, { status }),
      info,
    );
  }
  return withRateLimitHeaders(
    result.status === 404
      ? notFoundJson()
      : result.status === 403
        ? forbiddenJson()
        : NextResponse.json(
            { error: result.error ?? { code: "invalid_body" } },
            { status: 422 },
          ),
    info,
  );
}
