---
title: "Troubleshooting"
description: "Common questions and what to do about them: sign-in, access, email, files and the server itself."
sidebar:
  order: 11
---

Most problems have a short answer. Find yours by what you see.

## Signing in

### "No sign-in method is configured for this server."
Passkeys are switched off and there is neither a company login nor email. Switch at least one on, see [Sign-in and SSO](sso.md). If you turned passkeys off with `AUTH_PASSKEY_LOGIN_ENABLED=false`, remove that setting.

### The passkey button is missing, or "Passkey sign-in was cancelled or failed."
- Passkeys need a **secure address**: `https://…` or `localhost`. Plain `http://` over an IP address does not work.
- A passkey is tied to a **domain**. If the address of Barynt changed, register a new passkey.
- If the person cancelled the prompt on the device, try again.

### "Access denied. Ask an administrator for an invitation."
Either the server is **invite-only** (`AUTH_REGISTRATION_ENABLED=false`) and this address has no invitation, or the account has been **deactivated**. Check with the platform administrator, see [Platform administration](platform.md).

### A new colleague cannot accept their invitation
Invitations for new people are accepted through a sign-in link sent by email. If the server has no mail setup, it cannot work. Either set up [email](email.md), or send an **invite link** instead (_Workspace settings → Invitations_), which works with a passkey or a company login.

### "Another account already exists with the same email address"
Typically after switching identity providers. See "Changing identity providers" in [Sign-in and SSO](sso.md).

### The sign-in link does not arrive
Check that [email](email.md) is set up, look in the spam folder, and try the test mail in **Admin → Mail templates**.

## Access and permissions

### "I cannot see a project that my colleague sees."
The project is probably **private**, and you were not added. Ask a project admin to add you under the project's _Members_. See [Projects](../using-barynt/projects.md).

### "This page doesn't exist", but it should
Barynt shows the same page for "does not exist" and "you may not see it", on purpose, so that nobody can learn that something exists. Check with a workspace admin that you have access.

### I cannot edit or delete an issue
A **Contributor** can only edit and delete issues they created or that are assigned to them. For more, a project admin can change your role, or create a role for it, see [Roles and permissions](roles.md).

### The dashboard only shows my own numbers
Seeing the numbers of the whole project needs a permission that Contributors do not have by default. Use the **Mine / All** switch to see which you have, and ask a project admin if you need more. See [Dashboards](../using-barynt/dashboards.md).

### I cannot invite people, create a project or open settings
Your role does not include it. The tables in [Roles and permissions](roles.md) show who can.

## Email and notifications

### No emails arrive
- Is `SMTP_HOST` set? Without it Barynt sends no mail.
- Did the person switch email on for that event? Comments and status changes are **off** by default, see [My issues, inbox and notifications](../using-barynt/my-work.md).
- Nobody is notified about their own actions.
- Check the spam folder and `barynt logs app`.

## Files

### Attachments or pictures cannot be uploaded
- Is [object storage](storage.md) set up? Without it, attachments are switched off and avatars show initials.
- Is the upload domain (`files.<your-domain>`) reachable from the browser?
- Is the file small enough: 100 MB for attachments, 5 MB for pictures?

## The server

### I cannot reach Barynt after installing
Run `barynt doctor`. It checks Docker, memory, disk space, whether your domain points at the server, and the health of the app. Make sure ports 80 and 443 are open.

### How do I know it is healthy?
Open `/api/health` on your domain. It answers `{"status":"ok","version":"…"}` when the app and the database are fine. `/api/health/live` only says the app process is up, which is what a container health check wants. See [The barynt command](../getting-started/manage.md) for `barynt status`.

### After an update something looks wrong
Barynt updates the database layout itself when it starts. Look at `barynt logs app` for what it did. If you need to go back, `barynt restore` brings back the backup that `barynt upgrade` made first.

### I forgot to make a backup
`barynt backup` takes one now. Do it before every upgrade, and put a copy somewhere other than the server.

## Integrations

### The API answers 401, 403, 404 or 429
- **401:** key missing, wrong, revoked or expired.
- **403:** the key lacks the scope this call needs.
- **404:** the thing does not exist, or you may not see it.
- **429:** too many requests: 120 per minute per key. Wait the number of seconds in the `Retry-After` header.

More in [REST API](../integrations/api.md).

### An AI assistant cannot connect through MCP
Connector-based assistants such as Claude.ai call your server **from the provider's cloud**, so Barynt must be reachable from the internet over HTTPS. An address on your private network will not do. See [MCP server](../integrations/mcp.md).

### A webhook does not arrive
Check that the receiving address is reachable from the server, that the webhook is subscribed to the event, and look at the status Barynt shows for the last delivery in _Workspace settings → Webhooks_. Barynt tries **once**. There is no automatic retry. See [Webhooks](../integrations/webhooks.md).
