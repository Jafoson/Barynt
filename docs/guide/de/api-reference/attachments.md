---
title: "Anhänge"
description: "REST-API: Anhänge eines Issues auflisten, hinzufügen (Datei oder Link), lesen und entfernen."
sidebar:
  order: 6
---

<!-- Aus den Referenzdaten der API erzeugt. Nicht von Hand ändern. (scripts/docs-api/generate.ts) -->

Dateien und Links an einem Issue. Jeder Aufruf braucht den genannten Scope und einen Key (oder ein Token) von jemandem, der das in der App darf. Siehe [Anmeldung und Grundlagen](../integrations/api.md).

## `GET /api/v1/issues/{id}/attachments`

Scope: `issues:read`

Listet die Anhänge eines Issues (Dateien und Links), älteste zuerst. `url` ist die Adresse zum Ansehen: bei einem Link er selbst, bei einer Datei eine signierte Download-URL, die ohne Token bis `urlExpiresAt` (eine Stunde) funktioniert — danach neu abrufen.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Issues. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/issues/$ISSUE_ID/attachments" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```jsonc
{
  "data": [
    {
      "id": "att_3f9c1d",
      "issueId": "i_4k2n1x",
      "kind": "file",
      "name": "safari-checkout.png",
      "url": "https://files.example.com/issues/attachments/i_4k2n1x/…?X-Amz-Signature=…",
      "urlExpiresAt": "2026-03-04T16:40:00.000Z",
      "mimeType": "image/png",
      "size": 184213,
      "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
      "created": "2026-03-02T10:07:00.000Z"
    },
    {
      "id": "att_8k2m4n",
      "issueId": "i_4k2n1x",
      "kind": "link",
      "name": "github.com",
      "url": "https://github.com/acme/web/pull/812",
      "urlExpiresAt": null,
      "mimeType": null,
      "size": null,
      "author": { "id": "u_7h3j2k", "name": "Priya Shah" },
      "created": "2026-03-03T08:30:00.000Z"
    }
  ]
}
```

## `POST /api/v1/issues/{id}/attachments`

Scope: `issues:write`

Hängt einen Link oder eine Datei an — genau eins von `url`, `content` oder `key`. Eine Datei bis 10 MB kann direkt als Base64 kommen; eine größere (bis 100 MB) wird zuerst über POST /api/v1/issues/{id}/attachments/uploads hochgeladen und dann hier mit ihrem `key` angelegt. Braucht das Recht, das Issue zu bearbeiten. Fehler nennen den Grund: invalid_source, invalid_url, invalid_name, invalid_content, too_large, upload_rejected.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Issues. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `url` | `string` |  | Ein Link-Anhang: eine http(s)-Adresse. |
| `content` | `string` |  | Eine Datei direkt: ihre Bytes als Base64 oder eine data:-URL (die auch `mimeType` setzt). Bis 10 MB. |
| `key` | `string` |  | Eine vorher hochgeladene Datei — der `key` vom Upload-Endpunkt, nach dem PUT. |
| `name` | `string` |  | Der Dateiname, z. B. screenshot.png — bei einer Datei Pflicht. Bei einem Link standardmäßig der Host. |
| `mimeType` | `string` |  | z. B. image/png. Wird sonst aus dem Dateinamen abgeleitet. |

**Beispiel**

```bash
curl -X POST "$BARYNT_URL/api/v1/issues/$ISSUE_ID/attachments" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "safari-checkout.png", "content": "iVBORw0KGgoAAAANSUhEUgAA…" }'
```

**Anfrage**

```json
{
  "name": "safari-checkout.png",
  "content": "iVBORw0KGgoAAAANSUhEUgAA…"
}
```

**Antwort**

```jsonc
// 201 Created
{
  "data": {
    "id": "att_3f9c1d",
    "issueId": "i_4k2n1x",
    "kind": "file",
    "name": "safari-checkout.png",
    "url": "https://files.example.com/issues/attachments/i_4k2n1x/…?X-Amz-Signature=…",
    "urlExpiresAt": "2026-03-04T16:40:00.000Z",
    "mimeType": "image/png",
    "size": 184213,
    "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "created": "2026-03-04T15:40:00.000Z"
  }
}
```

## `POST /api/v1/issues/{id}/attachments/uploads`

Scope: `issues:write`

Erster Schritt für eine große Datei (bis 100 MB): liefert eine `uploadUrl`, an die du die Bytes direkt per PUT schickst, mit den angegebenen `headers`, innerhalb von 2 Minuten. Danach legst du den Anhang mit POST /api/v1/issues/{id}/attachments und dem zurückgegebenen `key` an.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Issues. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `fileName` | `string` | ja | Der Dateiname. |
| `contentLength` | `number` | ja | Größe in Bytes. |
| `contentType` | `string` |  | MIME-Typ. Wird sonst aus dem Dateinamen abgeleitet. |

**Beispiel**

```bash
curl -X POST "$BARYNT_URL/api/v1/issues/$ISSUE_ID/attachments/uploads" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "fileName": "screen-recording.mp4", "contentLength": 48213004 }'
```

**Anfrage**

```json
{
  "fileName": "screen-recording.mp4",
  "contentLength": 48213004
}
```

**Antwort**

```jsonc
// 201 Created
{
  "data": {
    "key": "attachments/i_4k2n1x/6f1c…e2.mp4",
    "uploadUrl": "https://files.example.com/issues/attachments/i_4k2n1x/6f1c…e2.mp4?X-Amz-Signature=…",
    "method": "PUT",
    "headers": { "Content-Type": "video/mp4" },
    "expiresAt": "2026-03-04T15:42:00.000Z"
  }
}
```

## `GET /api/v1/attachments/{id}`

Scope: `issues:read`

Holt einen Anhang mit frisch signierter `url` — wenn eine frühere abgelaufen ist.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Anhangs. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/attachments/$ATTACHMENT_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```jsonc
{
  "data": {
    "id": "att_3f9c1d",
    "issueId": "i_4k2n1x",
    "kind": "file",
    "name": "safari-checkout.png",
    "url": "https://files.example.com/issues/attachments/i_4k2n1x/…?X-Amz-Signature=…",
    "urlExpiresAt": "2026-03-04T16:40:00.000Z",
    "mimeType": "image/png",
    "size": 184213,
    "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "created": "2026-03-02T10:07:00.000Z"
  }
}
```

## `DELETE /api/v1/attachments/{id}`

Scope: `issues:write`

Entfernt einen Anhang; eine Datei wird auch aus dem Speicher gelöscht. Braucht das Recht, das Issue zu bearbeiten.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Anhangs. |

**Beispiel**

```bash
curl -X DELETE "$BARYNT_URL/api/v1/attachments/$ATTACHMENT_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": { "id": "att_3f9c1d" }
}
```
