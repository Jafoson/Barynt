---
title: "Email"
description: "Connect a mail server so Barynt can send invitations and notifications. Without one, everything still works inside the app."
sidebar:
  order: 7
---

Barynt can send email: invitations, notifications about what happens on your issues, and a note when someone is removed. All of it needs one thing: a **mail server** (SMTP) that Barynt may send through. This page is for whoever runs the server.

## Do you need it?

Email is optional, but it changes three things:

| | Without a mail server | With a mail server |
| --- | --- | --- |
| **Notifications** | Only in the inbox inside the app. | Also by email, if people turn that on. |
| **Invitations of new people** | Barynt shows an invitation **link** to copy and send yourself. The new person **cannot accept it** on their own, because accepting needs a sign-in link by email. Use an [invite link](members.md) instead. | The new person gets the email and joins with one click. |
| **Magic-link sign-in** | Not available. People use passkeys or company login. | Available, also as a way back in if a passkey is lost. |

Nothing breaks without email. Barynt simply does not send any, and says so wherever it matters.

## Setting it up

You need the details of a mail server: its address, port, a user name and password, and the sender address. Any normal provider works: your company's mail server, or a service such as Postmark, Mailgun, SES, Brevo or Gmail with an app password.

The quickest way is the installer's command, which asks for each value:

```bash
barynt config
```

Or set the values directly:

```bash
barynt config SMTP_HOST=smtp.example.com SMTP_PORT=587 \
  SMTP_USER=barynt@example.com SMTP_PASS=… \
  SMTP_FROM="Barynt <barynt@example.com>"
```

| Setting | Meaning |
| --- | --- |
| `SMTP_HOST` | The mail server. Setting it is what switches email on. |
| `SMTP_PORT` | Usually `587` (STARTTLS) or `465` (SSL). |
| `SMTP_SECURE` | `true` for port 465, otherwise `false`. `barynt config` sets this for you. |
| `SMTP_USER`, `SMTP_PASS` | The login. |
| `SMTP_FROM` | The sender people see. Use an address your server may send from, or mail may be rejected. |
| `MAIL_COMPANY_NAME`, `MAIL_COMPANY_ADDRESS` | Shown in the footer of every email. Many providers expect a real postal address in commercial mail. Without it, the line is left out. |

For **Docker Compose**, put them in `.env`. If your mail server runs on the same machine as Barynt, `localhost` means the container itself, so use `COMPOSE_SMTP_HOST` as described in `example.env`.

> [!TIP]
> Check that it works from inside Barynt: open **Admin → Mail templates**, choose a template, enter your address and click **Send test mail**.

## What Barynt sends

| Email | When |
| --- | --- |
| **Invitation** | You invite a new person to a workspace or project. |
| **Notifications** | Issue assigned, mention, new comment, reply, status changed, added to a workspace or project, role changed, issue shared. Each one only if the person switched it on, see [My issues, inbox and notifications](../using-barynt/my-work.md). |
| **Removed from a workspace or project** | You remove someone. |
| **Shared issue** | Someone shares an issue by email. |

## Changing the wording

Platform administrators can adjust the **subject**, the **heading** and the **intro text** of every email under **Admin → Mail templates**. A live preview with sample data shows the result. Leave a field empty to use the default, or use **Reset to default**. Placeholders such as `{{workspaceName}}` or `{{inviterName}}` are filled in when the mail is sent. The list of available placeholders is shown next to the editor.

Some templates in the list are prepared for features that are not switched on yet, such as a weekly summary. Editing them is harmless.

## If mail does not arrive

- Check that `SMTP_HOST`, port and login are right, and that the sender address is allowed on your mail server.
- Look at the logs: `barynt logs app`.
- Look in the spam folder. Mail from a new server that is not set up for **SPF and DKIM** often lands there.
- Try the test button described above.
