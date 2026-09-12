"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { openInvitation } from "@/lib/invitations";
import { enrollInWorkspaceProjects } from "@/lib/project-membership";
import { getSession } from "@/lib/session";

type AuthResult = { redirectTo: string } | { error: string };

/**
 * Sends the magic sign-in link. Also works for a pre-created, invited
 * account (`pending: true`, no passkey yet) — unlike passkey/OAuth,
 * next-auth's mail provider has no `AccountNotLinked` block for an address
 * that already exists: clicking the link *is* the proof that it belongs to
 * the person. `redirect: false` returns the result instead of throwing —
 * `sendVerificationRequest` (`auth.ts`) has already handed the mail off to
 * `sendMail()` by this point.
 *
 * `auth.ts`'s `signIn` callback runs here too, not just on the eventual
 * click-through (@auth/core calls it before `sendVerificationRequest`,
 * specifically so a blocked attempt never sends mail at all) — so an
 * unknown address with AUTH_REGISTRATION_ENABLED=false throws `AccessDenied`
 * right here. That must not turn into a *different* response than a real
 * address gets: telling the caller "no account for that address" is exactly
 * the account-enumeration leak invite-only mode is supposed to close, not
 * just at the login form but for this trickle-down case too. Reported to
 * the caller the same way either way — `{ ok: true }` — and only a genuine,
 * unrelated failure (SMTP down, provider misconfigured) still surfaces as
 * an error.
 */
export async function sendMagicLink(
  email: string,
  callbackUrl?: string,
): Promise<{ ok: true } | { error: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { error: "Please enter your email address." };

  try {
    await signIn("nodemailer", {
      email: trimmed,
      redirect: false,
      redirectTo: callbackUrl || "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "AccessDenied") return { ok: true };
      return { error: "Could not send the magic link. Please try again." };
    }
    throw error;
  }

  return { ok: true };
}

/**
 * Finalizes an invitation after the person has signed in (magic link — for a
 * pre-created account the only way, see `sendMagicLink`; afterward they can
 * set up a passkey in their own settings, like anyone else).
 *
 * This action only sets what a session alone doesn't establish:
 *
 *   1. `pending = false` — only this activates the workspace role's
 *      permissions,
 *   2. enrollment in the public projects: new ones may have appeared
 *      between the invitation and its acceptance.
 *
 * A project guest has no workspace membership. Neither applies to them —
 * their access hangs entirely off the project row that already exists.
 *
 * Requires a session matching the invitation — otherwise some other, logged-in
 * person could accept an invitation that isn't theirs at all.
 */
export async function acceptInvitation(token: string): Promise<AuthResult> {
  const session = await getSession();
  if (!session)
    return { error: "You must be signed in to accept this invitation." };

  const invitation = await openInvitation(db, token, new Date());
  if (!invitation) {
    // `openInvitation` excludes an already-accepted invitation — that's not
    // necessarily an error here: if the same (logged-in) person calls this
    // action a second time for their own invitation that was just accepted
    // (double invocation via React's dev strict mode on server components, a
    // repeated page load, the back button), the enrollment is long since
    // done — same success, no second write.
    const already = await db.invitation.findUnique({
      where: { token },
      select: {
        userId: true,
        workspaceId: true,
        acceptedAt: true,
        workspace: { select: { suspended: true } },
      },
    });
    if (
      already?.acceptedAt &&
      already.userId === session.userId &&
      !already.workspace.suspended
    ) {
      return { redirectTo: `/${already.workspaceId}` };
    }
    // Unknown, expired, already used by someone else, or workspace
    // suspended — one message for every case, so this endpoint isn't an
    // oracle for valid tokens.
    return { error: "This invitation is no longer valid. Ask for a new one." };
  }
  if (session.userId !== invitation.userId) {
    return {
      error:
        "You're signed in with a different account. Sign out first, then open the invitation link again.",
    };
  }

  let joined = false;

  await db.$transaction(async (tx) => {
    const membership = await tx.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: invitation.workspaceId,
          userId: invitation.userId,
        },
      },
      select: { pending: true },
    });

    if (membership?.pending) {
      await tx.workspaceMember.update({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId: invitation.userId,
          },
        },
        data: { pending: false },
      });
      await enrollInWorkspaceProjects(tx, {
        workspaceId: invitation.workspaceId,
        userId: invitation.userId,
      });
      joined = true;
    }

    await tx.invitation.update({
      where: { token: invitation.token },
      data: { acceptedAt: new Date() },
    });
  });

  if (joined) {
    // Only now does the membership actually exist — the person accepts
    // their own invitation, so they're actor and target at once. Outside
    // the transaction: a stuck audit write shouldn't block the acceptance.
    await recordAudit({
      action: "member.added",
      actorId: invitation.userId,
      target: {
        type: "user",
        id: invitation.userId,
        label: `${invitation.firstName} ${invitation.lastName}`.trim(),
      },
      workspaceId: invitation.workspaceId,
    });
  }

  return { redirectTo: `/${invitation.workspaceId}` };
}

export async function logout(): Promise<void> {
  await signOut({ redirect: true, redirectTo: "/login" });
}

/** OAuth login (GitHub/Google). Redirects straight to the provider. */
export async function signInWithOAuth(provider: string): Promise<void> {
  await signIn(provider, { redirectTo: "/" });
}
