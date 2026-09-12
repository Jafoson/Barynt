import { Icon } from "@iconify/react";
import { getTranslations } from "next-intl/server";
import { ConsentScreen } from "@/features/oauth/components/ConsentScreen/ConsentScreen";
import { API_SCOPES, type ApiScope } from "@/lib/api/scopes";
import { db } from "@/lib/db";
import {
  resolveRequestedScopes,
  validateAuthorizeRequest,
} from "@/lib/oauth/authorize";
import { findOAuthClient } from "@/lib/oauth/clients";
import { getSession } from "@/lib/session";
import styles from "./page.module.scss";

// This is the one page in the whole OAuth flow a human ever sees — every
// other endpoint (`/.well-known/*`, `/api/oauth/*`) is machine-to-machine.
// Lives in the `(auth)` route group so it's reachable pre-session and
// `proxy.ts`'s auth gate sends an unauthenticated visitor to `/login` first
// (with the full query string preserved — see `proxy.ts`), landing right
// back here to actually see the consent screen once signed in.
export const dynamic = "force-dynamic";

function InvalidRequestCard({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.icon}>
          <Icon icon="lucide:shield-x" width={26} />
        </span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.text}>{text}</p>
      </div>
    </div>
  );
}

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getTranslations();
  const sp = await searchParams;

  const req = {
    clientId: sp.client_id ?? "",
    redirectUri: sp.redirect_uri ?? "",
    codeChallenge: sp.code_challenge ?? "",
    codeChallengeMethod: sp.code_challenge_method ?? "",
    resource: sp.resource,
    scope: sp.scope,
    state: sp.state,
  };

  const validation = await validateAuthorizeRequest(req);
  if (!validation.ok) {
    return (
      <InvalidRequestCard
        title={t("oauth.invalidTitle")}
        text={t("oauth.invalidText")}
      />
    );
  }

  // `proxy.ts` already redirects to `/login` (with this exact query string
  // preserved) when there's no session — this check is the belt-and-braces
  // fallback, not the primary gate.
  const session = await getSession();
  if (!session) {
    return (
      <InvalidRequestCard
        title={t("oauth.invalidTitle")}
        text={t("oauth.invalidText")}
      />
    );
  }

  const [client, user] = await Promise.all([
    findOAuthClient(req.clientId),
    db.user.findUnique({
      where: { id: session.userId },
      select: { firstName: true, lastName: true, email: true, handle: true },
    }),
  ]);
  // `validateAuthorizeRequest` already confirmed the client exists — `!client`
  // here would mean it was deleted in the instant between the two calls.
  if (!client || !user) {
    return (
      <InvalidRequestCard
        title={t("oauth.invalidTitle")}
        text={t("oauth.invalidText")}
      />
    );
  }

  const userLabel =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email ||
    `@${user.handle}`;

  // Literal keys — see the same note in `AccountApiKeys.tsx`, next-intl's
  // `t()` can't resolve a key built from a variable.
  const scopeDesc: Record<ApiScope, string> = {
    "issues:read": t("apiKeys.descIssuesRead"),
    "issues:write": t("apiKeys.descIssuesWrite"),
    "comments:read": t("apiKeys.descCommentsRead"),
    "comments:write": t("apiKeys.descCommentsWrite"),
    "labels:read": t("apiKeys.descLabelsRead"),
    "labels:write": t("apiKeys.descLabelsWrite"),
    "projects:read": t("apiKeys.descProjectsRead"),
    "projects:write": t("apiKeys.descProjectsWrite"),
    "workspaces:read": t("apiKeys.descWorkspacesRead"),
    "workspaces:write": t("apiKeys.descWorkspacesWrite"),
    "members:read": t("apiKeys.descMembersRead"),
  };
  const grantedScopes = resolveRequestedScopes(req.scope);
  const scopeDescriptions = API_SCOPES.filter((s) =>
    grantedScopes.includes(s),
  ).map((s) => scopeDesc[s]);

  return (
    <ConsentScreen
      title={t("oauth.title")}
      signedInAsLabel={t("oauth.signedInAs", { name: userLabel })}
      wantsAccessLabel={t("oauth.wantsAccess", { client: client.name })}
      scopesIntroLabel={t("oauth.scopesIntro")}
      allowLabel={t("oauth.allow")}
      denyLabel={t("oauth.deny")}
      scopeDescriptions={scopeDescriptions}
      hiddenFields={{
        client_id: req.clientId,
        redirect_uri: req.redirectUri,
        code_challenge: req.codeChallenge,
        code_challenge_method: req.codeChallengeMethod,
        resource: req.resource,
        scope: req.scope,
        state: req.state,
      }}
    />
  );
}
