---
title: "Filter"
description: "Die Filtersprache der API: wie du sagst, welche Issues du willst, mit Regeln, Gruppen, Feldern, Vergleichen und fertigen Rezepten."
sidebar:
  order: 10
---

<!-- Aus den Referenzdaten der API erzeugt. Nicht von Hand ändern. (scripts/docs-api/generate.ts) -->

Ein Filter ist eine Liste von Regeln. Ein Issue passt, wenn jede Regel passt — das bedeutet "op": "and" ganz oben.

Jede Regel nennt ein Feld, wie verglichen wird (is) und einen Wert. Das Beispiel heißt: mir zugewiesen und Priorität hoch oder dringend.

Du brauchst „entweder … oder …“? Pack die Regeln in eine Gruppe mit "op": "or". Gruppen stehen überall, wo eine Regel stehen kann, und können weitere Gruppen enthalten.

## Der kleinste nützliche Filter

```json
{
  "op": "and",
  "rules": [
    { "field": "assignee", "is": "any", "value": ["@me"] },
    { "field": "priority", "is": "gte", "value": 3 }
  ]
}
```

## Entweder … oder …

Bugs, die dringend oder überfällig sind: Die Regeln oben gelten alle (UND), die in der Gruppe reicht eine (ODER).

```json
{
  "op": "and",
  "rules": [
    { "field": "type", "is": "any", "value": ["bug"] },
    {
      "op": "or",
      "rules": [
        { "field": "priority", "is": "gte", "value": 4 },
        { "field": "dueDate", "is": "within", "value": "overdue" }
      ]
    }
  ]
}
```

## Eine Regel

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `field` | `string` | Worauf geschaut wird — siehe Felder unten. |
| `is` | `string` | Wie verglichen wird — siehe Vergleiche unten. Jedes Feld erlaubt nur bestimmte. |
| `value` | `list \| number \| string` | Hängt von "is" ab: eine Liste bei any/none/all, eine Zahl bei gte/lte, ein Datum bei before/after, ein Zeitraum-Name bei within, Text bei contains — und gar kein Wert bei empty/notEmpty. |

## Felder

Welche Vergleiche ein Feld kennt, steht beim Feld. Werte sind IDs, sofern nichts anderes dabeisteht.

| Feld | Was es ist | Vergleiche | Werte |
| --- | --- | --- | --- |
| `status` | Der Status des Issues. | `any`, `none` | Status-IDs aus GET /api/v1/workspaces/{id}/statuses (list_statuses). |
| `statusCategory` | Die Phase des Status — in jedem Workspace gleich, egal wie die Status heißen. | `any`, `none` | "backlog", "unstarted", "started", "completed", "canceled". |
| `priority` | Die Priorität. | `any`, `none`, `gte`, `lte` | 0 keine, 1 niedrig, 2 mittel, 3 hoch, 4 dringend. |
| `type` | Der Issue-Typ. | `any`, `none` | Typ-IDs, wie Issues sie in "type" zeigen, z. B. "bug", "feature", "task". |
| `assignee` | Wem es zugewiesen ist. | `any`, `none`, `empty`, `notEmpty` | User-IDs aus GET /api/v1/workspaces/{id}/members, "@me", oder "_none" für nicht zugewiesen. (kennt `_none`) |
| `reporter` | Wer es angelegt hat. | `any`, `none` | User-IDs oder "@me". |
| `label` | Seine Labels. any = hat eines davon, all = hat alle, none = hat keines davon. | `any`, `none`, `all`, `empty`, `notEmpty` | Label-IDs aus GET /api/v1/workspaces/{id}/labels, oder "_none" für kein Label. (kennt `_none`) |
| `project` | Sein Projekt — nützlich in projektübergreifenden Views und Abfragen über den Workspace. | `any`, `none` | Projekt-IDs aus GET /api/v1/workspaces/{id}/projects. |
| `storyPoints` | Story Points. | `any`, `none`, `gte`, `lte`, `empty`, `notEmpty` | Zahlen; "_none" in einer Liste für Issues ohne Punkte. (kennt `_none`) |
| `estimate` | Die Zeitschätzung, immer in Stunden. | `gte`, `lte`, `empty`, `notEmpty` | Eine Stundenzahl, z. B. 2.5. |
| `dueDate` | Das Fälligkeitsdatum. | `before`, `after`, `within`, `empty`, `notEmpty` | Ein Tag "YYYY-MM-DD" oder "today"; bei within ein Zeitraum-Name (siehe Besondere Werte). |
| `created` | Wann es angelegt wurde. | `before`, `after`, `within` | Ein Tag "YYYY-MM-DD" oder "today"; bei within ein Zeitraum-Name. |
| `updated` | Wann es zuletzt geändert wurde. | `before`, `after`, `within` | Ein Tag "YYYY-MM-DD" oder "today"; bei within ein Zeitraum-Name. |
| `parent` | Sein übergeordnetes Issue. empty = nur Issues ganz oben, notEmpty = nur Sub-Issues. | `any`, `empty`, `notEmpty` | Issue-IDs (die interne ID, nicht "WEB-42"). |
| `text` | Eine Suche in Titel und Beschreibung; eine Nummer oder "WEB-42" findet auch genau dieses Issue. | `contains` | Beliebiger Text. |

## Vergleiche (`is`)

| Vergleich | Bedeutung | Wert |
| --- | --- | --- |
| `any` | ist eines davon | `["a", "b"]` |
| `none` | ist keines davon (Issues ohne Wert passen trotzdem) | `["a", "b"]` |
| `all` | hat alle davon (nur Labels) | `["a", "b"]` |
| `empty` | ist nicht gesetzt | — |
| `notEmpty` | ist gesetzt | — |
| `gte` | ist mindestens | `3` |
| `lte` | ist höchstens | `3` |
| `before` | liegt vor diesem Tag (der Tag selbst zählt nicht) | `"2026-10-31" \| "today"` |
| `after` | liegt nach diesem Tag (der Tag selbst zählt nicht) | `"2026-10-31" \| "today"` |
| `within` | liegt in einem benannten Zeitraum | `"next_7_days"` |
| `contains` | passt zum Text | `"checkout"` |

## Besondere Werte

| Wert | Beschreibung |
| --- | --- |
| `"@me"` | Wer gerade fragt — der Besitzer des API-Keys oder OAuth-Tokens. Eine geteilte View mit @me zeigt jeder Person ihre eigenen Issues. |
| `"_none"` | „Nicht gesetzt“, als Eintrag in einer any/none-Liste: ["@me", "_none"] = mir oder niemandem zugewiesen. Für assignee, label, storyPoints. |
| `"today"` | Bei before/after: der Beginn des heutigen Tages, wenn die Anfrage läuft. |
| `"overdue"` | Bei within: vor heute. |
| `"today"` | Bei within: heute. |
| `"next_7_days"` | Bei within: heute und die 6 Tage danach. |
| `"last_7_days"` | Bei within: heute und die 6 Tage davor. |
| `"last_30_days"` | Bei within: heute und die 29 Tage davor. |

## Rezepte

### Meine offenen Issues

```json
{
  "op": "and",
  "rules": [
    { "field": "assignee", "is": "any", "value": ["@me"] },
    { "field": "statusCategory", "is": "none", "value": ["completed", "canceled"] }
  ]
}
```

### Diese Woche fällig, nicht erledigt

```json
{
  "op": "and",
  "rules": [
    { "field": "dueDate", "is": "within", "value": "next_7_days" },
    { "field": "statusCategory", "is": "any", "value": ["unstarted", "started"] }
  ]
}
```

### Nicht zugewiesen oder meine, ab Priorität hoch

```json
{
  "op": "and",
  "rules": [
    { "field": "assignee", "is": "any", "value": ["@me", "_none"] },
    { "field": "priority", "is": "gte", "value": 3 }
  ]
}
```

### In Arbeit, seit einem bestimmten Tag unverändert

```json
{
  "op": "and",
  "rules": [
    { "field": "statusCategory", "is": "any", "value": ["started"] },
    { "field": "updated", "is": "before", "value": "2026-09-21" }
  ]
}
```

### Issues ganz oben ohne Schätzung

```json
{
  "op": "and",
  "rules": [
    { "field": "parent", "is": "empty" },
    { "field": "estimate", "is": "empty" }
  ]
}
```

## Wo ein Filter hingehört

- `GET /api/v1/projects/{id}/issues?filter=…`: Als JSON, URL-kodiert (encodeURIComponent(JSON.stringify(filter))). Lässt sich mit status, assignee und q kombinieren.
- `POST /api/v1/projects/{id}/views, PATCH /api/v1/views/{id}`: Als "filter" im JSON-Body. Wird mit der View gespeichert; GET /api/v1/views/{id}/issues wendet ihn an.
- `MCP list_issues, create_view, update_view`: Als Argument "filter" — ein normales Objekt, kein String.

## Was meistens schiefgeht

- Ganz oben steht immer "op": "and". Für ODER nimm eine Gruppe darin.
- Werte sind IDs, keine Namen: ein Label ist "l_9f2a1b", nicht "frontend"; ein Status ist "in_progress", nicht "In Progress".
- any, none und all nehmen eine Liste, auch bei einem einzigen Wert: ["bug"], nicht "bug".
- Ein Vergleich, den ein Feld nicht erlaubt, oder ein Wert der falschen Art wird mit 422 invalid_filter abgelehnt (MCP: invalid_input).
- Eine Regel, deren IDs es nicht mehr gibt (ein gelöschtes Label), fällt weg, statt nichts zu finden — der Rest des Filters gilt weiter.
- Jede Liste fasst bis zu 50 Regeln; Gruppen lassen sich beliebig tief verschachteln.
