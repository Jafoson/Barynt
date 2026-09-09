import "server-only";
import type {
  CallToolResult,
  ServerContext,
} from "@modelcontextprotocol/server";
import type { MutationResult } from "@/features/api-v1/mutations";
import { checkRateLimit } from "@/lib/api/rateLimit";
import type { ApiScope } from "@/lib/api/scopes";
import type { ApiAuthResult } from "@/lib/api-auth";

/**
 * Every tool callback's first move — the MCP analogue of the four-line
 * preamble (`resolveApiUser` → `checkRateLimit` → `hasScope`) repeated at
 * the top of every `app/api/v1` route handler. Collapsed into one call
 * here because an MCP tool has no separate "route" to hang that boilerplate
 * on — this function IS the routing layer for the tool surface.
 *
 * Returns the resolved `{ userId, keyId }` on success, or a ready-to-return
 * `CallToolResult` (`isError: true`) the caller should return as-is.
 */
export async function authorize(
  ctx: ServerContext,
  scope: ApiScope,
): Promise<
  { ok: true; auth: ApiAuthResult } | { ok: false; result: CallToolResult }
> {
  const info = ctx.http?.authInfo;
  const userId = info?.extra?.userId;
  const keyId = info?.extra?.keyId;
  if (!info || typeof userId !== "string" || typeof keyId !== "string") {
    return {
      ok: false,
      result: errorResult("unauthorized", "Missing or invalid API token."),
    };
  }

  const { ok, info: limit } = await checkRateLimit(keyId);
  if (!ok) {
    const retryAfter = Math.max(
      Math.ceil((limit.resetAt - Date.now()) / 1000),
      0,
    );
    return {
      ok: false,
      result: errorResult(
        "rate_limited",
        `Rate limit exceeded (${limit.limit} requests/min). Retry in ${retryAfter}s.`,
      ),
    };
  }

  if (!info.scopes.includes(scope)) {
    return {
      ok: false,
      result: errorResult(
        "insufficient_scope",
        `This API key is missing the "${scope}" scope.`,
      ),
    };
  }

  return {
    ok: true,
    auth: { userId, keyId, scopes: info.scopes as ApiScope[] },
  };
}

export function errorResult(code: string, message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `${code}: ${message}` }],
  };
}

export const notFoundResult = (): CallToolResult =>
  errorResult(
    "not_found",
    "Resource not found, or you don't have access to it.",
  );

export const invalidBodyResult = (): CallToolResult =>
  errorResult("invalid_input", "The provided input was invalid.");

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Maps a `features/api-v1/mutations.ts` `MutationResult` onto a
 *  `CallToolResult`, same 404/422 split every route handler already makes. */
export function mutationResult<T>(result: MutationResult<T>): CallToolResult {
  if (!result.ok) {
    return result.status === 404 ? notFoundResult() : invalidBodyResult();
  }
  return jsonResult(result.data);
}
