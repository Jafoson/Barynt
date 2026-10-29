---
title: "Filters"
description: "The filter language of the API: how to say which issues you want, with rules, groups, fields, comparisons and ready-made recipes."
sidebar:
  order: 10
---

<!-- Generated from the API's reference data. Do not edit by hand. (scripts/docs-api/generate.ts) -->

A filter is a list of rules. An issue matches when every rule matches — that's what "op": "and" at the top means.

Each rule names a field, how to compare (is), and a value. The example reads: assigned to me, and priority high or urgent.

Need "either … or …"? Put the rules in a group with "op": "or". Groups go anywhere a rule can, and can hold further groups.

## The smallest useful filter

```json
{
  "op": "and",
  "rules": [
    { "field": "assignee", "is": "any", "value": ["@me"] },
    { "field": "priority", "is": "gte", "value": 3 }
  ]
}
```

## Either … or …

Bugs that are urgent or overdue: the top-level rules are AND-ed, the group's rules are OR-ed.

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

## A rule

| Name | Type | Description |
| --- | --- | --- |
| `field` | `string` | What to look at — see Fields below. |
| `is` | `string` | How to compare — see Comparisons below. Each field allows only some. |
| `value` | `list \| number \| string` | Depends on "is": a list for any/none/all, a number for gte/lte, a date for before/after, a range name for within, text for contains — and no value at all for empty/notEmpty. |

## Fields

Which comparisons a field takes is listed per field. Values are ids unless noted.

| Field | What it is | Comparisons | Values |
| --- | --- | --- | --- |
| `status` | The issue's status. | `any`, `none` | Status ids from GET /api/v1/workspaces/{id}/statuses (list_statuses). |
| `statusCategory` | The status's phase — the same in every workspace, whatever the statuses are called. | `any`, `none` | "backlog", "unstarted", "started", "completed", "canceled". |
| `priority` | The priority. | `any`, `none`, `gte`, `lte` | 0 none, 1 low, 2 medium, 3 high, 4 urgent. |
| `type` | The issue type. | `any`, `none` | Type ids as issues show them in "type", e.g. "bug", "feature", "task". |
| `assignee` | Who it's assigned to. | `any`, `none`, `empty`, `notEmpty` | User ids from GET /api/v1/workspaces/{id}/members, "@me", or "_none" for unassigned. (takes `_none`) |
| `reporter` | Who created it. | `any`, `none` | User ids, or "@me". |
| `label` | Its labels. any = has one of them, all = has every one, none = has none of them. | `any`, `none`, `all`, `empty`, `notEmpty` | Label ids from GET /api/v1/workspaces/{id}/labels, or "_none" for no label. (takes `_none`) |
| `project` | Its project — useful in cross-project views and workspace-wide queries. | `any`, `none` | Project ids from GET /api/v1/workspaces/{id}/projects. |
| `storyPoints` | Story points. | `any`, `none`, `gte`, `lte`, `empty`, `notEmpty` | Numbers; "_none" in a list for issues without points. (takes `_none`) |
| `estimate` | The time estimate, always in hours. | `gte`, `lte`, `empty`, `notEmpty` | A number of hours, e.g. 2.5. |
| `dueDate` | The due date. | `before`, `after`, `within`, `empty`, `notEmpty` | A day "YYYY-MM-DD" or "today"; for within, a range name (see Special values). |
| `created` | When it was created. | `before`, `after`, `within` | A day "YYYY-MM-DD" or "today"; for within, a range name. |
| `updated` | When it last changed. | `before`, `after`, `within` | A day "YYYY-MM-DD" or "today"; for within, a range name. |
| `parent` | Its parent issue. empty = top-level issues only, notEmpty = sub-issues only. | `any`, `empty`, `notEmpty` | Issue ids (the internal id, not "WEB-42"). |
| `text` | A search in title and description; a number or "WEB-42" also finds that issue. | `contains` | Any text. |

## Comparisons (`is`)

| Comparison | Means | Value |
| --- | --- | --- |
| `any` | is one of | `["a", "b"]` |
| `none` | is none of (issues without a value still match) | `["a", "b"]` |
| `all` | has all of (labels only) | `["a", "b"]` |
| `empty` | is not set | — |
| `notEmpty` | is set | — |
| `gte` | is at least | `3` |
| `lte` | is at most | `3` |
| `before` | is before that day (the day itself doesn't count) | `"2026-10-31" \| "today"` |
| `after` | is after that day (the day itself doesn't count) | `"2026-10-31" \| "today"` |
| `within` | falls in a named range | `"next_7_days"` |
| `contains` | matches the text | `"checkout"` |

## Special values

| Value | Description |
| --- | --- |
| `"@me"` | Whoever is asking — the owner of the API key or OAuth token. A shared view with @me shows each person their own issues. |
| `"_none"` | "Not set", as one entry in an any/none list: ["@me", "_none"] = assigned to me or to nobody. For assignee, label, storyPoints. |
| `"today"` | For before/after: the start of today, when the request runs. |
| `"overdue"` | For within: before today. |
| `"today"` | For within: today. |
| `"next_7_days"` | For within: today and the 6 days after. |
| `"last_7_days"` | For within: today and the 6 days before. |
| `"last_30_days"` | For within: today and the 29 days before. |

## Recipes

### My open issues

```json
{
  "op": "and",
  "rules": [
    { "field": "assignee", "is": "any", "value": ["@me"] },
    { "field": "statusCategory", "is": "none", "value": ["completed", "canceled"] }
  ]
}
```

### Due this week, not done

```json
{
  "op": "and",
  "rules": [
    { "field": "dueDate", "is": "within", "value": "next_7_days" },
    { "field": "statusCategory", "is": "any", "value": ["unstarted", "started"] }
  ]
}
```

### Unassigned or mine, high priority and up

```json
{
  "op": "and",
  "rules": [
    { "field": "assignee", "is": "any", "value": ["@me", "_none"] },
    { "field": "priority", "is": "gte", "value": 3 }
  ]
}
```

### In progress, unchanged since a given day

```json
{
  "op": "and",
  "rules": [
    { "field": "statusCategory", "is": "any", "value": ["started"] },
    { "field": "updated", "is": "before", "value": "2026-09-21" }
  ]
}
```

### Top-level issues without an estimate

```json
{
  "op": "and",
  "rules": [
    { "field": "parent", "is": "empty" },
    { "field": "estimate", "is": "empty" }
  ]
}
```

## Where a filter goes

- `GET /api/v1/projects/{id}/issues?filter=…`: As JSON, URL-encoded (encodeURIComponent(JSON.stringify(filter))). Combines with status, assignee and q.
- `POST /api/v1/projects/{id}/views, PATCH /api/v1/views/{id}`: As "filter" in the JSON body. Saved with the view; GET /api/v1/views/{id}/issues applies it.
- `MCP list_issues, create_view, update_view`: As the "filter" argument — a plain object, not a string.

## What usually goes wrong

- The top level is always "op": "and". For OR, use a group inside it.
- Values are ids, not names: a label is "l_9f2a1b", not "frontend"; a status is "in_progress", not "In Progress".
- any, none and all take a list, even for one value: ["bug"], not "bug".
- An operator a field doesn't allow, or a value of the wrong kind, is rejected with 422 invalid_filter (MCP: invalid_input).
- A rule whose ids no longer exist (a deleted label) drops out instead of matching nothing — the rest of the filter still applies.
- Lists hold up to 50 rules each; groups can nest as deep as needed.
