---
title: "Object storage"
description: "Where avatars and attachments are kept: bundled with the installer, or any S3-compatible storage you already have."
sidebar:
  order: 8
---

Pictures and attachments are not stored in the database. They go into **object storage**, a kind of file server with an S3 interface. This page is for whoever runs the server.

## What it is used for

| Use | Limit |
| --- | --- |
| **Avatars** of people, workspaces and projects | 5 MB, PNG, JPEG, WebP or GIF |
| **Attachments** and images, videos and files inside issues | 100 MB per file, any type |

## What you get without it

Storage is optional. Without it, Barynt keeps working: avatars are replaced by initials on a color, and the attachment area on issues is switched off. The two uses are independent. You can have avatars without attachments, or the other way round, by configuring only one bucket.

## With the installer

Nothing to do. The installer starts **RustFS**, a small S3-compatible storage, next to Barynt and wires it up. It also asks for a second domain, `files.<your-domain>` by default, which points at the same server. Browsers upload and download directly through it, so it has to be reachable from the internet in the same way as the main domain.

Everything is included when you run `barynt backup`, see [The barynt command](../getting-started/manage.md).

## Using your own storage

Any S3-compatible storage works: AWS S3, MinIO, Cloudflare R2, Backblaze B2, Wasabi, DigitalOcean Spaces and others. Create **two private buckets** (for example `avatars` and `issues`) and a key with read and write access, then tell Barynt:

```bash
barynt config S3_ENDPOINT=https://s3.eu-central-1.amazonaws.com \
  S3_REGION=eu-central-1 \
  S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… \
  S3_BUCKET_AVATARS=acme-barynt-avatars S3_BUCKET_ISSUES=acme-barynt-issues
```

| Setting | Meaning |
| --- | --- |
| `S3_ENDPOINT` | Where the storage is. Leaving it empty switches both uses off. |
| `S3_REGION` | The region. `us-east-1` is fine for most non-AWS providers. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | The key. |
| `S3_BUCKET_AVATARS`, `S3_BUCKET_ISSUES` | The two buckets. |

A few notes:

- **Buckets must be private.** Barynt hands out short-lived signed links for viewing and uploading, so nobody can open a file without being allowed to see its issue.
- Addresses are always path-style (`endpoint/bucket/key`), which every provider above supports.
- For **Docker Compose** and the **Helm chart**, the settings have their own names for "the address the app uses" and "the address the browser uses". See `example.env` and the chart's values.

## Backups

Files in storage are **not** in the database. A complete backup needs both. With the bundled RustFS, `barynt backup` takes care of it. With your own storage, back up the buckets with your provider's tools, and the database with `barynt backup` or `pg_dump`.

## If uploads fail

- Is the upload address reachable from the user's browser? With the installer, check that DNS for `files.<your-domain>` points at the server.
- Are the buckets created and the key allowed to read and write them?
- Is the file under 100 MB (5 MB for pictures)?
- `barynt doctor` and `barynt logs app` show what is wrong on the server side.
