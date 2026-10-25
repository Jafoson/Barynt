import type { ApiScope } from "@/lib/api/scopes";
import type { DocText } from "./docText";

// Reference data for the API documentation panel below the key manager
// (`ApiDocs.tsx`). Descriptions come in both languages (`DocText`, picked
// by the UI locale); the wire format — paths, field names, JSON, scopes,
// error codes — is the actual contract and stays as it's sent.
//
// Mirrors the real route handlers under `app/api/v1` field-for-field —
// keep this in sync by hand when a route's shape changes, there's no
// generator wiring the two together.

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ApiDocParam {
  name: string;
  type: string;
  required?: boolean;
  desc: DocText;
}

export interface ApiDocEndpoint {
  method: HttpMethod;
  path: string;
  scope: ApiScope;
  desc: DocText;
  pathParams?: ApiDocParam[];
  queryParams?: ApiDocParam[];
  bodyParams?: ApiDocParam[];
  /** Pretty-printed JSON, exactly as a caller would send it — present
   *  whenever `bodyParams` is, so the shape doesn't have to be assembled by
   *  hand from the parameter table. */
  requestExample?: string;
  /** Pretty-printed JSON, exactly as the route returns it. */
  response: string;
}

export type ApiDocGroupId =
  | "workspaces"
  | "projects"
  | "issues"
  | "options"
  | "comments"
  | "labels"
  | "members"
  | "views";

export interface ApiDocGroup {
  id: ApiDocGroupId;
  endpoints: ApiDocEndpoint[];
}

/** The resource's name in German, with its article — "die ID des
 *  Projekts". */
const RESOURCE_DE: Record<string, string> = {
  workspace: "des Workspace",
  project: "des Projekts",
  issue: "des Issues",
  comment: "des Kommentars",
  label: "des Labels",
  view: "der View",
  relation: "der Beziehung",
};

const idParam = (resource: string): ApiDocParam => ({
  name: "id",
  type: "string",
  required: true,
  desc: {
    en: `The ${resource}'s id.`,
    de: `Die ID ${RESOURCE_DE[resource] ?? resource}.`,
  },
});

export const API_DOC_GROUPS: ApiDocGroup[] = [
  {
    id: "workspaces",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/workspaces",
        scope: "workspaces:read",
        desc: {
          en: "List the workspaces you belong to.",
          de: "Listet die Workspaces, in denen du Mitglied bist.",
        },
        response: `{
  "data": [
    {
      "id": "ws_1a2b3c",
      "name": "Acme Inc",
      "color": "#6e63e6",
      "avatarUrl": null
    }
  ]
}`,
      },
      {
        method: "POST",
        path: "/api/v1/workspaces",
        scope: "workspaces:write",
        desc: {
          en: "Create a workspace. You become its owner. Unlike creating one in the app, this does not also create a first project — create one explicitly via the projects endpoint below.",
          de: "Legt einen Workspace an, du wirst sein Owner. Anders als in der App entsteht dabei kein erstes Projekt — lege es ausdrücklich über den Projekt-Endpunkt unten an.",
        },
        bodyParams: [
          { name: "name", type: "string", required: true, desc: "" },
          {
            name: "slug",
            type: "string",
            required: true,
            desc: {
              en: "Lowercase letters, numbers, and hyphens. Appended with a number if already taken.",
              de: "Kleinbuchstaben, Ziffern und Bindestriche. Ist er vergeben, wird eine Zahl angehängt.",
            },
          },
          {
            name: "color",
            type: "string",
            desc: {
              en: 'A hex color. Default "#6e63e6".',
              de: 'Eine Hex-Farbe. Standard "#6e63e6".',
            },
          },
        ],
        requestExample: `{
  "name": "Acme Inc",
  "slug": "acme",
  "color": "#6e63e6"
}`,
        response: `// 201 Created
{
  "data": {
    "id": "acme",
    "name": "Acme Inc",
    "color": "#6e63e6",
    "avatarUrl": null
  }
}`,
      },
      {
        method: "PATCH",
        path: "/api/v1/workspaces/{id}",
        scope: "workspaces:write",
        desc: {
          en: "Update a workspace. Every field is optional — send only what changes.",
          de: "Ändert einen Workspace. Jedes Feld ist optional — schick nur, was sich ändert.",
        },
        pathParams: [idParam("workspace")],
        bodyParams: [
          { name: "name", type: "string", desc: "" },
          {
            name: "color",
            type: "string",
            desc: { en: "A hex color.", de: "Eine Hex-Farbe." },
          },
          {
            name: "desc",
            type: "string",
            desc: {
              en: "A one-sentence description.",
              de: "Eine Beschreibung in einem Satz.",
            },
          },
        ],
        requestExample: `{
  "name": "Acme Corp",
  "color": "#3b7bd5",
  "desc": "Product and marketing, together."
}`,
        response: `{
  "data": { "id": "acme" }
}`,
      },
      {
        method: "DELETE",
        path: "/api/v1/workspaces/{id}",
        scope: "workspaces:write",
        desc: {
          en: "Delete a workspace, along with every project and issue in it. This cannot be undone.",
          de: "Löscht einen Workspace samt allen Projekten und Issues darin. Das lässt sich nicht rückgängig machen.",
        },
        pathParams: [idParam("workspace")],
        response: `{
  "data": { "id": "acme" }
}`,
      },
    ],
  },
  {
    id: "projects",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/workspaces/{id}/projects",
        scope: "projects:read",
        desc: {
          en: "List the projects in a workspace that you can see.",
          de: "Listet die Projekte eines Workspace, die du sehen kannst.",
        },
        pathParams: [idParam("workspace")],
        response: `{
  "data": [
    {
      "id": "proj_9f8e7d",
      "name": "Website Relaunch",
      "slug": "website-relaunch",
      "prefix": "WEB",
      "color": "#3b7bd5"
    }
  ]
}`,
      },
      {
        method: "POST",
        path: "/api/v1/workspaces/{id}/projects",
        scope: "projects:write",
        desc: {
          en: "Create a project in a workspace.",
          de: "Legt ein Projekt in einem Workspace an.",
        },
        pathParams: [idParam("workspace")],
        bodyParams: [
          { name: "name", type: "string", required: true, desc: "" },
          {
            name: "desc",
            type: "string",
            desc: {
              en: "A one-sentence description.",
              de: "Eine Beschreibung in einem Satz.",
            },
          },
          {
            name: "prefix",
            type: "string",
            desc: {
              en: 'Up to 4 letters, used in issue refs (e.g. "WEB"). Derived from the name if omitted, appended with a number if already taken.',
              de: 'Bis zu 4 Buchstaben, Teil der Issue-Kennung (z. B. "WEB"). Fehlt es, wird es aus dem Namen gebildet; ist es vergeben, wird eine Zahl angehängt.',
            },
          },
          {
            name: "color",
            type: "string",
            required: true,
            desc: { en: "A hex color.", de: "Eine Hex-Farbe." },
          },
          {
            name: "visibility",
            type: '"public" | "private"',
            desc: {
              en: 'A public project enrolls every workspace member. Default "public".',
              de: 'Ein öffentliches Projekt nimmt jedes Workspace-Mitglied auf. Standard "public".',
            },
          },
        ],
        requestExample: `{
  "name": "Website Relaunch",
  "desc": "Marketing site rebuild for Q2.",
  "prefix": "WEB",
  "color": "#3b7bd5",
  "visibility": "public"
}`,
        response: `// 201 Created
{
  "data": {
    "id": "proj_9f8e7d",
    "name": "Website Relaunch",
    "slug": "website-relaunch",
    "prefix": "WEB",
    "color": "#3b7bd5"
  }
}`,
      },
      {
        method: "PATCH",
        path: "/api/v1/projects/{id}",
        scope: "projects:write",
        desc: {
          en: "Update a project. Every field is optional — send only what changes.",
          de: "Ändert ein Projekt. Jedes Feld ist optional — schick nur, was sich ändert.",
        },
        pathParams: [idParam("project")],
        bodyParams: [
          { name: "name", type: "string", desc: "" },
          { name: "desc", type: "string", desc: "" },
          {
            name: "prefix",
            type: "string",
            desc: { en: "Up to 4 letters.", de: "Bis zu 4 Buchstaben." },
          },
          {
            name: "color",
            type: "string",
            desc: { en: "A hex color.", de: "Eine Hex-Farbe." },
          },
          { name: "visibility", type: '"public" | "private"', desc: "" },
        ],
        requestExample: `{
  "name": "Website Relaunch 2.0",
  "desc": "Now with a checkout redesign.",
  "prefix": "WEB2",
  "color": "#3b7bd5",
  "visibility": "private"
}`,
        response: `{
  "data": { "id": "proj_9f8e7d" }
}`,
      },
      {
        method: "DELETE",
        path: "/api/v1/projects/{id}",
        scope: "projects:write",
        desc: {
          en: "Delete a project, along with every issue in it. This cannot be undone.",
          de: "Löscht ein Projekt samt allen Issues darin. Das lässt sich nicht rückgängig machen.",
        },
        pathParams: [idParam("project")],
        response: `{
  "data": { "id": "proj_9f8e7d" }
}`,
      },
    ],
  },
  {
    id: "issues",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/projects/{id}/issues",
        scope: "issues:read",
        desc: {
          en: "List issues in a project, newest first, cursor-paginated.",
          de: "Listet die Issues eines Projekts, neueste zuerst, seitenweise mit Cursor.",
        },
        pathParams: [idParam("project")],
        queryParams: [
          {
            name: "status",
            type: "string",
            desc: {
              en: "Filter by status key.",
              de: "Nach Status-Key filtern.",
            },
          },
          {
            name: "assignee",
            type: "string",
            desc: {
              en: "Filter by assignee user id.",
              de: "Nach der User-ID des Zuständigen filtern.",
            },
          },
          {
            name: "q",
            type: "string",
            desc: {
              en: "Case-insensitive substring match against title and description.",
              de: "Teilstring-Suche in Titel und Beschreibung, ohne Groß-/Kleinschreibung.",
            },
          },
          {
            name: "filter",
            type: "string (JSON)",
            desc: {
              en: 'A filter tree as JSON, URL-encoded — e.g. {"op":"and","rules":[{"field":"priority","is":"gte","value":3}]}. "@me" means you. How it works: Basics → Filter, above. 422 invalid_filter if it isn\'t a valid tree.',
              de: 'Ein Filterbaum als JSON, URL-kodiert — z. B. {"op":"and","rules":[{"field":"priority","is":"gte","value":3}]}. "@me" bist du. Wie das geht: Grundlagen → Filter, oben. 422 invalid_filter, wenn es kein gültiger Baum ist.',
            },
          },
          {
            name: "fields",
            type: "string",
            desc: {
              en: 'Comma-separated allowlist, e.g. "id,title,status" — trims the response to just those keys ("id" always included).',
              de: 'Kommagetrennte Liste, z. B. "id,title,status" — die Antwort enthält nur diese Felder ("id" ist immer dabei).',
            },
          },
          {
            name: "cursor",
            type: "string",
            desc: {
              en: "From the previous page's `nextCursor`.",
              de: "Der `nextCursor` der vorigen Seite.",
            },
          },
          {
            name: "limit",
            type: "integer",
            desc: {
              en: "Page size, 1–100. Default 25.",
              de: "Seitengröße 1–100. Standard 25.",
            },
          },
        ],
        response: `{
  "data": [
    {
      "id": "i_4k2n1x",
      "ref": "WEB-42",
      "title": "Fix broken checkout flow",
      "status": "in_progress",
      "statusCategory": "started",
      "priority": 2,
      "type": "bug",
      "labels": [
        { "id": "l_9f2a1b", "name": "frontend" }
      ],
      "assignee": { "id": "u_7h3j2k", "name": "Priya Shah" },
      "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
      "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
      "description": "Checkout fails on Safari when …",
      "created": "2026-03-01T09:12:00.000Z",
      "updated": "2026-03-04T15:40:00.000Z",
      "closedAt": null,
      "dueDate": "2026-03-10T00:00:00.000Z",
      "storyPoints": 5,
      "estimateHours": 8,
      "estimateUnit": "days",
      "parent": null,
      "children": [],
      "relations": []
    }
  ],
  "nextCursor": "eyJpZCI6ImlfNGsybjF4In0"
}`,
      },
      {
        method: "POST",
        path: "/api/v1/projects/{id}/issues",
        scope: "issues:write",
        desc: {
          en: "Create an issue. The reporter is always the token's owner, never a body field.",
          de: "Legt ein Issue an. Ersteller ist immer der Besitzer des Tokens, nie ein Feld im Body.",
        },
        pathParams: [idParam("project")],
        bodyParams: [
          { name: "title", type: "string", required: true, desc: "" },
          {
            name: "description",
            type: "string",
            desc: {
              en: "Markdown, converted server-side. `@handle` mentions a workspace member (notifies them, except on comment edits); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label|https://...]` (or bare `[https://...]`) becomes a link chip. All resolve server-side; unresolved ones are left as plain text.",
              de: "Markdown, wird auf dem Server umgewandelt. `@handle` erwähnt ein Workspace-Mitglied (benachrichtigt es, außer beim Bearbeiten von Kommentaren); `#PREFIX-123` verlinkt ein anderes Issue; `//2026-08-14` (oder `//14.8.2026`) wird zum Datums-Chip; `[label|https://...]` (oder nur `[https://...]`) wird zum Link-Chip. Alles wird auf dem Server aufgelöst, was sich nicht auflösen lässt, bleibt Text.",
            },
          },
          {
            name: "status",
            type: "string",
            desc: {
              en: 'A status key of the project. Default "backlog".',
              de: 'Ein Status-Key des Projekts. Standard "backlog".',
            },
          },
          {
            name: "priority",
            type: "integer",
            desc: { en: "0–4. Default 0.", de: "0–4. Standard 0." },
          },
          {
            name: "assignee",
            type: "string | null",
            desc: { en: "A user id, or null.", de: "Eine User-ID oder null." },
          },
          {
            name: "labels",
            type: "string[]",
            desc: { en: "Label ids.", de: "Label-IDs." },
          },
          {
            name: "type",
            type: "string",
            desc: {
              en: 'An issue type key. Default "feature".',
              de: 'Ein Issue-Typ-Key. Standard "feature".',
            },
          },
          {
            name: "parentId",
            type: "string | null",
            desc: {
              en: "Makes the new issue a sub-issue of this one right away.",
              de: "Macht das neue Issue gleich zum Sub-Issue dieses Issues.",
            },
          },
          {
            name: "dueDate",
            type: "string | null",
            desc: {
              en: 'ISO 8601 date, e.g. "2026-09-20".',
              de: 'ISO-8601-Datum, z. B. "2026-09-20".',
            },
          },
          {
            name: "storyPoints",
            type: "integer | null",
            desc: {
              en: "Typically a Fibonacci value (1/2/3/5/8/13), not enforced.",
              de: "Meist ein Fibonacci-Wert (1/2/3/5/8/13), wird aber nicht erzwungen.",
            },
          },
          {
            name: "estimateHours",
            type: "number | null",
            desc: {
              en: "Normalized to hours, e.g. 2.5.",
              de: "In Stunden, z. B. 2.5.",
            },
          },
          {
            name: "estimateUnit",
            type: '"hours" | "days" | "weeks" | "months" | "years" | null',
            desc: {
              en: 'Which unit estimateHours was entered in. Default "hours" — a display hint only, doesn\'t change what estimateHours means.',
              de: 'In welcher Einheit estimateHours eingegeben wurde. Standard "hours" — nur ein Anzeige-Hinweis, die Bedeutung von estimateHours ändert sich nicht.',
            },
          },
        ],
        requestExample: `{
  "title": "Fix broken checkout flow",
  "description": "Checkout fails on Safari when the discount code field is empty.",
  "status": "todo",
  "priority": 2,
  "assignee": "u_7h3j2k",
  "labels": ["l_9f2a1b"],
  "type": "bug"
}`,
        response: `// 201 Created
{
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "title": "Fix broken checkout flow",
    "status": "backlog",
    "priority": 2,
    "type": "feature",
    "labels": [
      { "id": "l_9f2a1b", "name": "frontend" }
    ],
    "assignee": null,
    "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "description": "Checkout fails on Safari when …",
    "created": "2026-03-04T15:40:00.000Z",
    "updated": "2026-03-04T15:40:00.000Z",
    "closedAt": null,
    "dueDate": null,
    "storyPoints": null,
    "estimateHours": null,
    "estimateUnit": null,
    "parent": null,
    "children": [],
    "relations": []
  }
}`,
      },
      {
        method: "GET",
        path: "/api/v1/issues/{id}",
        scope: "issues:read",
        desc: {
          en: 'Get a single issue by internal id or "PREFIX-123" ref (e.g. "WEB-42") — tried as an id first, so a ref is only resolved once a matching id lookup misses.',
          de: 'Holt ein einzelnes Issue über die interne ID oder die Kennung "PREFIX-123" (z. B. "WEB-42") — zuerst wird es als ID versucht, als Kennung nur, wenn keine ID passt.',
        },
        pathParams: [idParam("issue")],
        queryParams: [
          {
            name: "fields",
            type: "string",
            desc: {
              en: 'Comma-separated allowlist, e.g. "id,title,status" — trims the response to just those keys ("id" always included).',
              de: 'Kommagetrennte Liste, z. B. "id,title,status" — die Antwort enthält nur diese Felder ("id" ist immer dabei).',
            },
          },
        ],
        response: `{
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "title": "Fix broken checkout flow",
    "status": "in_progress",
    "priority": 2,
    "type": "bug",
    "labels": [
      { "id": "l_9f2a1b", "name": "frontend" }
    ],
    "assignee": { "id": "u_7h3j2k", "name": "Priya Shah" },
    "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "description": "Checkout fails on Safari when …",
    "created": "2026-03-01T09:12:00.000Z",
    "updated": "2026-03-04T15:40:00.000Z",
    "closedAt": null,
    "dueDate": "2026-03-10T00:00:00.000Z",
    "storyPoints": 5,
    "estimateHours": 8,
    "estimateUnit": "days",
    "parent": null,
    "children": [
      { "id": "i_2b7c4d", "ref": "WEB-51", "title": "Safari-only regression", "status": "todo" }
    ],
    "relations": [
      {
        "id": "ir_8n3k2m",
        "type": "BLOCKS",
        "direction": "incoming",
        "issue": { "id": "i_9x1y2z", "ref": "WEB-40", "title": "Ship the discount banner", "status": "in_progress" }
      }
    ]
  }
}`,
      },
      {
        method: "PATCH",
        path: "/api/v1/issues/{id}",
        scope: "issues:write",
        desc: {
          en: "Update an issue. Every field is optional — send only what changes. Re-assigning also requires the `issue.assign` permission on your own role.",
          de: "Ändert ein Issue. Jedes Feld ist optional — schick nur, was sich ändert. Neu zuweisen braucht zusätzlich das Recht `issue.assign` in deiner Rolle.",
        },
        pathParams: [idParam("issue")],
        bodyParams: [
          { name: "title", type: "string", desc: "" },
          {
            name: "description",
            type: "string",
            desc: {
              en: "Markdown, converted server-side. `@handle` mentions a workspace member (notifies them, except on comment edits); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label|https://...]` (or bare `[https://...]`) becomes a link chip. All resolve server-side; unresolved ones are left as plain text.",
              de: "Markdown, wird auf dem Server umgewandelt. `@handle` erwähnt ein Workspace-Mitglied (benachrichtigt es, außer beim Bearbeiten von Kommentaren); `#PREFIX-123` verlinkt ein anderes Issue; `//2026-08-14` (oder `//14.8.2026`) wird zum Datums-Chip; `[label|https://...]` (oder nur `[https://...]`) wird zum Link-Chip. Alles wird auf dem Server aufgelöst, was sich nicht auflösen lässt, bleibt Text.",
            },
          },
          {
            name: "status",
            type: "string",
            desc: {
              en: "A status key of the project.",
              de: "Ein Status-Key des Projekts.",
            },
          },
          {
            name: "priority",
            type: "integer",
            desc: { en: "0–4.", de: "0–4." },
          },
          {
            name: "assignee",
            type: "string | null",
            desc: {
              en: "A user id, or null to unassign.",
              de: "Eine User-ID, oder null, um die Zuweisung zu entfernen.",
            },
          },
          {
            name: "labels",
            type: "string[]",
            desc: { en: "Label ids.", de: "Label-IDs." },
          },
          {
            name: "type",
            type: "string",
            desc: { en: "An issue type key.", de: "Ein Issue-Typ-Key." },
          },
          {
            name: "parentId",
            type: "string | null",
            desc: {
              en: "Sets the issue's parent (sub-issue of); null clears it. Rejected (422) if it would create a cycle.",
              de: "Setzt das übergeordnete Issue (Sub-Issue von); null entfernt es. Abgelehnt (422), wenn dadurch ein Kreis entstünde.",
            },
          },
          {
            name: "dueDate",
            type: "string | null",
            desc: {
              en: 'ISO 8601 date, e.g. "2026-09-20"; null clears it.',
              de: 'ISO-8601-Datum, z. B. "2026-09-20"; null entfernt es.',
            },
          },
          {
            name: "storyPoints",
            type: "integer | null",
            desc: {
              en: "Typically a Fibonacci value (1/2/3/5/8/13), not enforced.",
              de: "Meist ein Fibonacci-Wert (1/2/3/5/8/13), wird aber nicht erzwungen.",
            },
          },
          {
            name: "estimateHours",
            type: "number | null",
            desc: {
              en: "Normalized to hours, e.g. 2.5. null clears it (and estimateUnit with it).",
              de: "In Stunden, z. B. 2.5. null entfernt die Schätzung (und estimateUnit mit).",
            },
          },
          {
            name: "estimateUnit",
            type: '"hours" | "days" | "weeks" | "months" | "years" | null',
            desc: {
              en: 'Relabels estimateHours\'s display unit, independent of whether estimateHours itself changes in the same request. Omitted alongside a new estimateHours defaults to "hours".',
              de: 'Ändert nur die Anzeige-Einheit von estimateHours, unabhängig davon, ob sich estimateHours in derselben Anfrage ändert. Fehlt es bei einem neuen estimateHours, gilt "hours".',
            },
          },
        ],
        requestExample: `{
  "title": "Fix broken checkout flow",
  "description": "Checkout fails on Safari when the discount code field is empty.",
  "status": "in_progress",
  "statusCategory": "started",
  "priority": 2,
  "assignee": "u_7h3j2k",
  "labels": ["l_9f2a1b"],
  "type": "bug"
}`,
        response: `{
  "data": { "id": "i_4k2n1x" }
}`,
      },
      {
        method: "POST",
        path: "/api/v1/issues/{id}/relations",
        scope: "issues:write",
        desc: {
          en: "Link two issues with a typed edge: BLOCKS, RELATES_TO, or DUPLICATES. The edge is added from {id}'s point of view — for BLOCKS/DUPLICATES that means {id} blocks/duplicates `relatedId`. RELATES_TO has no real direction; adding it either way produces the same edge.",
          de: "Verbindet zwei Issues mit einer Beziehung: BLOCKS, RELATES_TO oder DUPLICATES. Sie gilt aus Sicht von {id} — bei BLOCKS/DUPLICATES blockiert bzw. dupliziert {id} also `relatedId`. RELATES_TO hat keine Richtung, beide Wege ergeben dieselbe Beziehung.",
        },
        pathParams: [idParam("issue")],
        bodyParams: [
          {
            name: "relatedId",
            type: "string",
            required: true,
            desc: {
              en: "The other issue's id.",
              de: "Die ID des anderen Issues.",
            },
          },
          {
            name: "type",
            type: '"BLOCKS" | "RELATES_TO" | "DUPLICATES"',
            required: true,
            desc: "",
          },
        ],
        requestExample: `{
  "relatedId": "i_9x1y2z",
  "type": "BLOCKS"
}`,
        response: `// 201 Created
{
  "data": { "id": "ir_8n3k2m" }
}`,
      },
      {
        method: "DELETE",
        path: "/api/v1/relations/{id}",
        scope: "issues:write",
        desc: {
          en: "Remove a relation edge (its own id, from an issue's `relations`) — removable from either issue it connects.",
          de: "Entfernt eine Beziehung (über ihre eigene ID aus `relations` eines Issues) — von beiden verbundenen Issues aus möglich.",
        },
        pathParams: [idParam("relation")],
        response: `{
  "data": { "id": "ir_8n3k2m" }
}`,
      },
    ],
  },
  {
    id: "options",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/workspaces/{id}/statuses",
        scope: "workspaces:read",
        desc: {
          en: "List a workspace's statuses in board order, each with its category — backlog, unstarted, started, completed or canceled. Categories are the same in every workspace; status ids and names are not.",
          de: "Listet die Status eines Workspace in Board-Reihenfolge, jeweils mit Kategorie — backlog, unstarted, started, completed oder canceled. Die Kategorien sind in jedem Workspace gleich, Status-IDs und -Namen nicht.",
        },
        pathParams: [idParam("workspace")],
        response: `{
  "data": [
    {
      "id": "todo",
      "name": "Todo",
      "short": "Todo",
      "color": "#b8bcc4",
      "category": "unstarted",
      "isColumn": true,
      "position": 1
    },
    {
      "id": "in_progress",
      "name": "In Progress",
      "short": "Doing",
      "color": "#e0992b",
      "category": "started",
      "isColumn": true,
      "position": 2
    }
  ]
}`,
      },
      {
        method: "GET",
        path: "/api/v1/workspaces/{id}/priorities",
        scope: "workspaces:read",
        desc: {
          en: "List a workspace's priorities in order. The `id` is the number `priority` takes when you create or update an issue.",
          de: "Listet die Prioritäten eines Workspace in Reihenfolge. Die `id` ist die Zahl, die `priority` beim Anlegen oder Ändern eines Issues erwartet.",
        },
        pathParams: [idParam("workspace")],
        response: `{
  "data": [
    { "id": 0, "key": "none", "name": "No priority", "color": "#b8bcc4", "position": 0 },
    { "id": 3, "key": "high", "name": "High", "color": "#e0992b", "position": 3 }
  ]
}`,
      },
      {
        method: "GET",
        path: "/api/v1/workspaces/{id}/issue-types",
        scope: "workspaces:read",
        desc: {
          en: "List a workspace's issue types in order. The `id` is what `type` takes when you create or update an issue.",
          de: "Listet die Issue-Typen eines Workspace in Reihenfolge. Die `id` ist das, was `type` beim Anlegen oder Ändern eines Issues erwartet.",
        },
        pathParams: [idParam("workspace")],
        response: `{
  "data": [
    { "id": "feature", "name": "Feature", "color": "#4a9d6f", "position": 1 },
    { "id": "bug", "name": "Bug", "color": "#d1495b", "position": 2 }
  ]
}`,
      },
    ],
  },
  {
    id: "comments",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/issues/{id}/comments",
        scope: "comments:read",
        desc: {
          en: "List the comments on an issue, oldest first.",
          de: "Listet die Kommentare eines Issues, älteste zuerst.",
        },
        pathParams: [idParam("issue")],
        response: `{
  "data": [
    {
      "id": "c_5m9p3q",
      "issueId": "i_4k2n1x",
      "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
      "parentId": null,
      "body": "Confirmed on Safari 17.",
      "created": "2026-03-02T10:05:00.000Z",
      "updated": null
    }
  ]
}`,
      },
      {
        method: "POST",
        path: "/api/v1/issues/{id}/comments",
        scope: "comments:write",
        desc: {
          en: "Create a comment on an issue. The author is always the token's owner, never a body field.",
          de: "Legt einen Kommentar an. Autor ist immer der Besitzer des Tokens, nie ein Feld im Body.",
        },
        pathParams: [idParam("issue")],
        bodyParams: [
          {
            name: "body",
            type: "string",
            required: true,
            desc: {
              en: "Markdown, converted server-side. `@handle` mentions a workspace member (notifies them, except on comment edits); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label|https://...]` (or bare `[https://...]`) becomes a link chip. All resolve server-side; unresolved ones are left as plain text.",
              de: "Markdown, wird auf dem Server umgewandelt. `@handle` erwähnt ein Workspace-Mitglied (benachrichtigt es, außer beim Bearbeiten von Kommentaren); `#PREFIX-123` verlinkt ein anderes Issue; `//2026-08-14` (oder `//14.8.2026`) wird zum Datums-Chip; `[label|https://...]` (oder nur `[https://...]`) wird zum Link-Chip. Alles wird auf dem Server aufgelöst, was sich nicht auflösen lässt, bleibt Text.",
            },
          },
          {
            name: "parentId",
            type: "string",
            desc: {
              en: "A comment id to reply to. Omit for a top-level comment.",
              de: "Die ID des Kommentars, auf den du antwortest. Weglassen für einen Kommentar auf oberster Ebene.",
            },
          },
        ],
        requestExample: `{
  "body": "Confirmed on Safari 17.",
  "parentId": "c_1a2b3c"
}`,
        response: `// 201 Created
{
  "data": {
    "id": "c_5m9p3q",
    "issueId": "i_4k2n1x",
    "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "parentId": null,
    "body": "Confirmed on Safari 17.",
    "created": "2026-03-04T15:40:00.000Z",
    "updated": null
  }
}`,
      },
      {
        method: "PATCH",
        path: "/api/v1/comments/{id}",
        scope: "comments:write",
        desc: {
          en: "Update a comment. You can always edit your own; editing someone else's additionally requires the comment.update.any permission on your role.",
          de: "Ändert einen Kommentar. Deine eigenen kannst du immer bearbeiten; fremde nur mit dem Recht comment.update.any in deiner Rolle.",
        },
        pathParams: [idParam("comment")],
        bodyParams: [
          {
            name: "body",
            type: "string",
            required: true,
            desc: {
              en: "Markdown, converted server-side. `@handle` mentions a workspace member (notifies them, except on comment edits); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label|https://...]` (or bare `[https://...]`) becomes a link chip. All resolve server-side; unresolved ones are left as plain text.",
              de: "Markdown, wird auf dem Server umgewandelt. `@handle` erwähnt ein Workspace-Mitglied (benachrichtigt es, außer beim Bearbeiten von Kommentaren); `#PREFIX-123` verlinkt ein anderes Issue; `//2026-08-14` (oder `//14.8.2026`) wird zum Datums-Chip; `[label|https://...]` (oder nur `[https://...]`) wird zum Link-Chip. Alles wird auf dem Server aufgelöst, was sich nicht auflösen lässt, bleibt Text.",
            },
          },
        ],
        requestExample: `{
  "body": "Confirmed on Safari 17 and 18."
}`,
        response: `{
  "data": { "id": "c_5m9p3q" }
}`,
      },
      {
        method: "DELETE",
        path: "/api/v1/comments/{id}",
        scope: "comments:write",
        desc: {
          en: "Delete a comment and its replies. You can always delete your own; deleting someone else's additionally requires the comment.delete.any permission on your role.",
          de: "Löscht einen Kommentar samt Antworten. Deine eigenen kannst du immer löschen; fremde nur mit dem Recht comment.delete.any in deiner Rolle.",
        },
        pathParams: [idParam("comment")],
        response: `{
  "data": { "id": "c_5m9p3q" }
}`,
      },
    ],
  },
  {
    id: "labels",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/workspaces/{id}/labels",
        scope: "labels:read",
        desc: {
          en: "List every label visible in a workspace — workspace-wide labels plus those of every project you can see.",
          de: "Listet alle Labels, die in einem Workspace sichtbar sind — workspaceweite und die aller Projekte, die du sehen kannst.",
        },
        pathParams: [idParam("workspace")],
        response: `{
  "data": [
    {
      "id": "l_9f2a1b",
      "name": "frontend",
      "slug": "frontend",
      "color": "#3b7bd5",
      "projectId": null
    }
  ]
}`,
      },
      {
        method: "POST",
        path: "/api/v1/workspaces/{id}/labels",
        scope: "labels:write",
        desc: {
          en: "Create a label. Omit projectId for a workspace-wide label that applies everywhere.",
          de: "Legt ein Label an. Ohne projectId gilt es im ganzen Workspace.",
        },
        pathParams: [idParam("workspace")],
        bodyParams: [
          { name: "name", type: "string", required: true, desc: "" },
          {
            name: "color",
            type: "string",
            required: true,
            desc: { en: "A hex color.", de: "Eine Hex-Farbe." },
          },
          {
            name: "projectId",
            type: "string",
            desc: {
              en: "Scope the label to a single project instead of the whole workspace.",
              de: "Beschränkt das Label auf ein Projekt statt auf den ganzen Workspace.",
            },
          },
        ],
        requestExample: `{
  "name": "frontend",
  "color": "#3b7bd5",
  "projectId": "proj_9f8e7d"
}`,
        response: `// 201 Created
{
  "data": {
    "id": "l_9f2a1b",
    "name": "frontend",
    "slug": "frontend",
    "color": "#3b7bd5",
    "projectId": null
  }
}`,
      },
      {
        method: "PATCH",
        path: "/api/v1/labels/{id}",
        scope: "labels:write",
        desc: {
          en: "Update a label's name and/or color. Every field is optional — send only what changes.",
          de: "Ändert Name und/oder Farbe eines Labels. Jedes Feld ist optional — schick nur, was sich ändert.",
        },
        pathParams: [idParam("label")],
        bodyParams: [
          { name: "name", type: "string", desc: "" },
          {
            name: "color",
            type: "string",
            desc: { en: "A hex color.", de: "Eine Hex-Farbe." },
          },
        ],
        requestExample: `{
  "name": "frontend",
  "color": "#e0992b"
}`,
        response: `{
  "data": { "id": "l_9f2a1b" }
}`,
      },
      {
        method: "DELETE",
        path: "/api/v1/labels/{id}",
        scope: "labels:write",
        desc: {
          en: "Delete a label and remove it from every issue it's attached to.",
          de: "Löscht ein Label und entfernt es von allen Issues, an denen es hängt.",
        },
        pathParams: [idParam("label")],
        response: `{
  "data": { "id": "l_9f2a1b" }
}`,
      },
    ],
  },
  {
    id: "members",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/workspaces/{id}/members",
        scope: "members:read",
        desc: {
          en: "List every member of a workspace.",
          de: "Listet alle Mitglieder eines Workspace.",
        },
        pathParams: [idParam("workspace")],
        response: `{
  "data": [
    {
      "id": "u_7h3j2k",
      "name": "Priya Shah",
      "email": "priya@example.com",
      "handle": "priya",
      "role": "admin"
    }
  ]
}`,
      },
      {
        method: "GET",
        path: "/api/v1/projects/{id}/members",
        scope: "members:read",
        desc: {
          en: "List every member of a project — the project's own membership rows. A workspace owner/admin who can reach into a private project without being listed there explicitly won't appear here.",
          de: "Listet alle Mitglieder eines Projekts — die eigenen Mitgliedschaften des Projekts. Workspace-Owner/-Admins, die ein privates Projekt sehen, ohne dort eingetragen zu sein, erscheinen hier nicht.",
        },
        pathParams: [idParam("project")],
        response: `{
  "data": [
    {
      "id": "u_7h3j2k",
      "name": "Priya Shah",
      "email": "priya@example.com",
      "handle": "priya",
      "role": "contributor"
    }
  ]
}`,
      },
    ],
  },
  {
    id: "views",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/projects/{id}/views",
        scope: "views:read",
        desc: {
          en: "List a project's saved views you can see — shared ones and your own private ones, in tab order.",
          de: "Listet die gespeicherten Views eines Projekts, die du siehst — geteilte und deine eigenen privaten, in Tab-Reihenfolge.",
        },
        pathParams: [idParam("project")],
        response: `{
  "data": [
    {
      "id": "v_3c9d1e",
      "name": "Urgent bugs",
      "slug": "urgent-bugs",
      "systemKey": null,
      "workspaceId": "ws_1a2b3c",
      "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
      "owner": { "id": "u_7h3j2k", "name": "Priya Shah", "handle": "priya" },
      "visibility": "PROJECT",
      "layout": "list",
      "icon": null,
      "color": "#e05252",
      "filter": {
        "op": "and",
        "rules": [
          { "field": "type", "is": "any", "value": ["bug"] },
          { "field": "priority", "is": "gte", "value": 3 },
          { "field": "assignee", "is": "any", "value": ["@me"] }
        ]
      },
      "groupBy": "status",
      "subGroupBy": null,
      "sortBy": "priority",
      "sortDir": "desc",
      "createdAt": "2026-10-01T09:00:00.000Z",
      "updatedAt": "2026-10-12T14:20:00.000Z",
      "canEdit": true
    }
  ]
}`,
      },
      {
        method: "GET",
        path: "/api/v1/workspaces/{id}/views",
        scope: "views:read",
        desc: {
          en: 'List a workspace\'s cross-project views you can see, including the built-in "My issues" and "Created by me" (systemKey set; they can\'t be changed).',
          de: 'Listet die projektübergreifenden Views eines Workspace, die du siehst, samt den eingebauten "My issues" und "Created by me" (mit systemKey; sie lassen sich nicht ändern).',
        },
        pathParams: [idParam("workspace")],
        response: `{
  "data": [
    {
      "id": "v_8a1b2c",
      "name": "My issues",
      "slug": "my-issues",
      "systemKey": "my-issues",
      "project": null,
      "owner": null,
      "visibility": "WORKSPACE",
      "layout": "list",
      "filter": { "op": "and", "rules": [] },
      "canEdit": false
    }
  ]
}`,
      },
      {
        method: "GET",
        path: "/api/v1/views/{id}",
        scope: "views:read",
        desc: {
          en: 'Fetch one view: its filter tree, layout, grouping and sort. "@me" in the filter stays as written — it means whoever asks.',
          de: 'Holt eine View: Filterbaum, Layout, Gruppierung und Sortierung. "@me" bleibt im Filter so stehen — es meint, wer fragt.',
        },
        pathParams: [idParam("view")],
        response: `{
  "data": {
    "id": "v_3c9d1e",
    "name": "Urgent bugs",
    "slug": "urgent-bugs",
    "systemKey": null,
    "workspaceId": "ws_1a2b3c",
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "owner": { "id": "u_7h3j2k", "name": "Priya Shah", "handle": "priya" },
    "visibility": "PROJECT",
    "layout": "list",
    "icon": null,
    "color": "#e05252",
    "filter": {
      "op": "and",
      "rules": [
        { "field": "type", "is": "any", "value": ["bug"] },
        { "field": "priority", "is": "gte", "value": 3 },
        { "field": "assignee", "is": "any", "value": ["@me"] }
      ]
    },
    "groupBy": "status",
    "subGroupBy": null,
    "sortBy": "priority",
    "sortDir": "desc",
    "createdAt": "2026-10-01T09:00:00.000Z",
    "updatedAt": "2026-10-12T14:20:00.000Z",
    "canEdit": true
  }
}`,
      },
      {
        method: "GET",
        path: "/api/v1/views/{id}/issues",
        scope: "views:read",
        desc: {
          en: "The issues a view shows, as you'd see them in the app: its filter with your @me, its project (or your visible projects for a cross-project view), and a built-in view's fixed condition. Newest first, cursor-paginated. Needs issues:read as well.",
          de: "Die Issues einer View, so wie du sie in der App siehst: ihr Filter mit deinem @me, ihr Projekt (bei einer projektübergreifenden View deine sichtbaren Projekte) und die feste Bedingung einer eingebauten View. Neueste zuerst, seitenweise mit Cursor. Braucht zusätzlich issues:read.",
        },
        pathParams: [idParam("view")],
        queryParams: [
          {
            name: "fields",
            type: "string",
            desc: {
              en: "Comma-separated allowlist of fields to return.",
              de: "Kommagetrennte Liste der Felder, die zurückkommen sollen.",
            },
          },
          {
            name: "cursor",
            type: "string",
            desc: {
              en: "From the previous page's `nextCursor`.",
              de: "Der `nextCursor` der vorigen Seite.",
            },
          },
          {
            name: "limit",
            type: "integer",
            desc: {
              en: "Page size, 1–100. Default 25.",
              de: "Seitengröße 1–100. Standard 25.",
            },
          },
        ],
        response: `{
  "data": [
    { "id": "i_4k2n1x", "ref": "WEB-42", "title": "Fix broken checkout flow", "status": "in_progress", "statusCategory": "started" }
  ],
  "nextCursor": null
}`,
      },
      {
        method: "POST",
        path: "/api/v1/projects/{id}/views",
        scope: "views:write",
        desc: {
          en: "Save a view in a project. Private unless visibility says otherwise.",
          de: "Speichert eine View in einem Projekt. Privat, wenn visibility nichts anderes sagt.",
        },
        pathParams: [idParam("project")],
        bodyParams: [
          {
            name: "name",
            type: "string",
            required: true,
            desc: { en: "Up to 80 characters.", de: "Bis zu 80 Zeichen." },
          },
          {
            name: "layout",
            type: '"board" | "list" | "dashboard"',
            required: true,
            desc: "",
          },
          {
            name: "visibility",
            type: '"PRIVATE" | "PROJECT" | "WORKSPACE"',
            desc: {
              en: "Default PRIVATE (only you). PROJECT for a project view, WORKSPACE for a cross-project view — sharing needs the view.share permission.",
              de: "Standard PRIVATE (nur du). PROJECT für eine Projekt-View, WORKSPACE für eine projektübergreifende — Teilen braucht das Recht view.share.",
            },
          },
          {
            name: "filter",
            type: "object",
            desc: {
              en: "A filter tree — see Basics → Filter, above.",
              de: "Ein Filterbaum — siehe Grundlagen → Filter, oben.",
            },
          },
          {
            name: "groupBy",
            type: "string | null",
            desc: {
              en: "status, priority, assignee, type, label, project …",
              de: "status, priority, assignee, type, label, project …",
            },
          },
          {
            name: "sortBy",
            type: "string",
            desc: {
              en: "manual, priority, created, updated, dueDate …",
              de: "manual, priority, created, updated, dueDate …",
            },
          },
          { name: "sortDir", type: '"asc" | "desc"', desc: "" },
          { name: "icon", type: "string | null", desc: "" },
          {
            name: "color",
            type: "string | null",
            desc: { en: "A hex color.", de: "Eine Hex-Farbe." },
          },
        ],
        requestExample: `{
  "name": "Urgent bugs",
  "layout": "list",
  "visibility": "PROJECT",
  "filter": {
    "op": "and",
    "rules": [{ "field": "priority", "is": "gte", "value": 3 }]
  },
  "sortBy": "priority",
  "sortDir": "desc"
}`,
        response: `// 201 Created
{
  "data": { "id": "v_3c9d1e", "name": "Urgent bugs", "…": "…" }
}`,
      },
      {
        method: "POST",
        path: "/api/v1/workspaces/{id}/views",
        scope: "views:write",
        desc: {
          en: "Save a cross-project view in a workspace. Same body as for a project; visibility is PRIVATE or WORKSPACE.",
          de: "Speichert eine projektübergreifende View in einem Workspace. Gleicher Body wie bei einem Projekt; visibility ist PRIVATE oder WORKSPACE.",
        },
        pathParams: [idParam("workspace")],
        bodyParams: [
          {
            name: "name",
            type: "string",
            required: true,
            desc: { en: "Up to 80 characters.", de: "Bis zu 80 Zeichen." },
          },
          {
            name: "layout",
            type: '"board" | "list" | "dashboard"',
            required: true,
            desc: "",
          },
          {
            name: "visibility",
            type: '"PRIVATE" | "PROJECT" | "WORKSPACE"',
            desc: {
              en: "Default PRIVATE (only you). PROJECT for a project view, WORKSPACE for a cross-project view — sharing needs the view.share permission.",
              de: "Standard PRIVATE (nur du). PROJECT für eine Projekt-View, WORKSPACE für eine projektübergreifende — Teilen braucht das Recht view.share.",
            },
          },
          {
            name: "filter",
            type: "object",
            desc: {
              en: "A filter tree — see Basics → Filter, above.",
              de: "Ein Filterbaum — siehe Grundlagen → Filter, oben.",
            },
          },
          {
            name: "groupBy",
            type: "string | null",
            desc: {
              en: "status, priority, assignee, type, label, project …",
              de: "status, priority, assignee, type, label, project …",
            },
          },
          {
            name: "sortBy",
            type: "string",
            desc: {
              en: "manual, priority, created, updated, dueDate …",
              de: "manual, priority, created, updated, dueDate …",
            },
          },
          { name: "sortDir", type: '"asc" | "desc"', desc: "" },
          { name: "icon", type: "string | null", desc: "" },
          {
            name: "color",
            type: "string | null",
            desc: { en: "A hex color.", de: "Eine Hex-Farbe." },
          },
        ],
        requestExample: `{
  "name": "Urgent bugs",
  "layout": "list",
  "visibility": "WORKSPACE",
  "filter": {
    "op": "and",
    "rules": [{ "field": "priority", "is": "gte", "value": 3 }]
  },
  "sortBy": "priority",
  "sortDir": "desc"
}`,
        response: `// 201 Created
{
  "data": { "id": "v_5e7f8a", "name": "Urgent bugs", "…": "…" }
}`,
      },
      {
        method: "PATCH",
        path: "/api/v1/views/{id}",
        scope: "views:write",
        desc: {
          en: "Change a view — only the fields you send. Private views: their owner. Shared views: their creator while they hold view.share, or anyone with view.manage; otherwise 403. Only the creator can make a shared view private again.",
          de: "Ändert eine View — nur die Felder, die du schickst. Private Views: ihr Besitzer. Geteilte Views: ihr Ersteller, solange er view.share hat, oder jeder mit view.manage; sonst 403. Nur der Ersteller kann eine geteilte View wieder privat machen.",
        },
        pathParams: [idParam("view")],
        bodyParams: [
          { name: "name", type: "string", desc: "" },
          {
            name: "visibility",
            type: '"PRIVATE" | "PROJECT" | "WORKSPACE"',
            desc: "",
          },
          {
            name: "filter",
            type: "object",
            desc: {
              en: "Replaces the whole tree.",
              de: "Ersetzt den ganzen Baum.",
            },
          },
          { name: "layout", type: "string", desc: "" },
          { name: "groupBy", type: "string | null", desc: "" },
          { name: "sortBy", type: "string", desc: "" },
          { name: "sortDir", type: '"asc" | "desc"', desc: "" },
        ],
        requestExample: `{
  "name": "Urgent bugs (P1+)",
  "filter": {
    "op": "and",
    "rules": [{ "field": "priority", "is": "gte", "value": 4 }]
  }
}`,
        response: `{
  "data": { "id": "v_3c9d1e", "name": "Urgent bugs (P1+)", "…": "…" }
}`,
      },
      {
        method: "DELETE",
        path: "/api/v1/views/{id}",
        scope: "views:write",
        desc: {
          en: "Delete a view — same rights as changing it. Built-in views can't be deleted.",
          de: "Löscht eine View — mit denselben Rechten wie beim Ändern. Eingebaute Views lassen sich nicht löschen.",
        },
        pathParams: [idParam("view")],
        response: `{
  "data": { "id": "v_3c9d1e" }
}`,
      },
    ],
  },
];

export interface ApiDocError {
  status: number;
  code: string | null;
}

export const API_DOC_ERRORS: ApiDocError[] = [
  { status: 401, code: "unauthorized" },
  { status: 403, code: "insufficient_scope / forbidden" },
  { status: 404, code: null },
  { status: 422, code: "invalid_body / invalid_filter" },
  { status: 429, code: "rate_limited" },
];

// ─── Webhooks ────────────────────────────────────────────────────────────────
//
// Not a REST endpoint you call — an outbound push (`lib/webhooks/deliver.ts`)
// registered under Settings → Webhooks (`webhook.manage`). Documented
// separately from `API_DOC_GROUPS` because there's nothing to request/
// respond to: what matters here is the signature and the payload shape.

export interface ApiDocWebhookEvent {
  event: string;
  desc: DocText;
  /** Pretty-printed JSON, exactly as delivered in the request body. */
  payload: string;
}

export const API_DOC_WEBHOOK_EVENTS: ApiDocWebhookEvent[] = [
  {
    event: "issue.created",
    desc: {
      en: "An issue was created, via the app or this API.",
      de: "Ein Issue wurde angelegt, in der App oder über diese API.",
    },
    payload: `{
  "event": "issue.created",
  "timestamp": 1772870400000,
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "title": "Fix broken checkout flow",
    "status": "backlog",
    "priority": 2,
    "type": "feature",
    "labels": [
      { "id": "l_9f2a1b", "name": "frontend" }
    ],
    "assignee": null,
    "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "description": "Checkout fails on Safari when …",
    "created": "2026-03-04T15:40:00.000Z",
    "updated": "2026-03-04T15:40:00.000Z",
    "closedAt": null
  }
}`,
  },
  {
    event: "issue.updated",
    desc: {
      en: "An issue changed — the full current issue, not a diff of just what changed.",
      de: "Ein Issue hat sich geändert — das vollständige aktuelle Issue, kein Diff der Änderungen.",
    },
    payload: `{
  "event": "issue.updated",
  "timestamp": 1772870400000,
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "title": "Fix broken checkout flow",
    "status": "done",
    "priority": 2,
    "type": "bug",
    "labels": [
      { "id": "l_9f2a1b", "name": "frontend" }
    ],
    "assignee": { "id": "u_7h3j2k", "name": "Priya Shah" },
    "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "description": "Checkout fails on Safari when …",
    "created": "2026-03-01T09:12:00.000Z",
    "updated": "2026-03-05T11:02:00.000Z",
    "closedAt": "2026-03-05T11:02:00.000Z"
  }
}`,
  },
  {
    event: "issue.deleted",
    desc: {
      en: "An issue was deleted — a minimal snapshot, not the full shape, since the issue no longer exists to look up.",
      de: "Ein Issue wurde gelöscht — eine knappe Momentaufnahme statt des vollen Objekts, weil das Issue nicht mehr existiert.",
    },
    payload: `{
  "event": "issue.deleted",
  "timestamp": 1772870400000,
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "projectId": "proj_9f8e7d",
    "title": "Fix broken checkout flow"
  }
}`,
  },
  {
    event: "comment.created",
    desc: {
      en: "A comment was added to an issue, via the app or this API.",
      de: "Ein Kommentar wurde zu einem Issue hinzugefügt, in der App oder über diese API.",
    },
    payload: `{
  "event": "comment.created",
  "timestamp": 1772870400000,
  "data": {
    "id": "c_5m9p3q",
    "issueId": "i_4k2n1x",
    "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "parentId": null,
    "body": "Confirmed on Safari 17.",
    "created": "2026-03-02T10:05:00.000Z",
    "updated": null
  }
}`,
  },
  {
    event: "view.created",
    desc: {
      en: "A shared view (project or workspace) was saved. Private views never send events.",
      de: "Eine geteilte View (Projekt oder Workspace) wurde gespeichert. Private Views senden nie Events.",
    },
    payload: `{
  "event": "view.created",
  "timestamp": 1772870400000,
  "data": {
    "id": "v_3c9d1e",
    "name": "Urgent bugs",
    "slug": "urgent-bugs",
    "workspaceId": "ws_1a2b3c",
    "projectId": "proj_9f8e7d",
    "ownerId": "u_7h3j2k",
    "visibility": "PROJECT",
    "layout": "list",
    "filter": {
      "op": "and",
      "rules": [{ "field": "priority", "is": "gte", "value": 3 }]
    },
    "groupBy": "status",
    "sortBy": "priority",
    "sortDir": "desc",
    "updatedAt": "2026-10-12T14:20:00.000Z"
  }
}`,
  },
  {
    event: "view.updated",
    desc: {
      en: "A shared view changed — the full stored view. Also sent when a shared view goes private; visibility then says PRIVATE.",
      de: "Eine geteilte View hat sich geändert — die vollständige gespeicherte View. Kommt auch, wenn eine geteilte View privat wird; visibility ist dann PRIVATE.",
    },
    payload: `{
  "event": "view.updated",
  "timestamp": 1772870400000,
  "data": {
    "id": "v_3c9d1e",
    "name": "Urgent bugs (P1+)",
    "slug": "urgent-bugs",
    "workspaceId": "ws_1a2b3c",
    "projectId": "proj_9f8e7d",
    "ownerId": "u_7h3j2k",
    "visibility": "PROJECT",
    "layout": "list",
    "filter": {
      "op": "and",
      "rules": [{ "field": "priority", "is": "gte", "value": 3 }]
    },
    "groupBy": "status",
    "sortBy": "priority",
    "sortDir": "desc",
    "updatedAt": "2026-10-12T14:20:00.000Z"
  }
}`,
  },
  {
    event: "view.deleted",
    desc: {
      en: "A shared view was deleted — a minimal snapshot.",
      de: "Eine geteilte View wurde gelöscht — eine knappe Momentaufnahme.",
    },
    payload: `{
  "event": "view.deleted",
  "timestamp": 1772870400000,
  "data": {
    "id": "v_3c9d1e",
    "name": "Urgent bugs",
    "workspaceId": "ws_1a2b3c",
    "projectId": "proj_9f8e7d"
  }
}`,
  },
];

export const API_DOC_WEBHOOK_SIGNATURE = {
  headers: [
    {
      name: "X-Barynt-Signature",
      desc: {
        en: 'Hex-encoded HMAC-SHA256, no prefix (unlike GitHub\'s "sha256=").',
        de: 'Hex-kodiertes HMAC-SHA256 ohne Präfix (anders als GitHubs "sha256=").',
      },
    },
    {
      name: "X-Barynt-Timestamp",
      desc: {
        en: "Unix milliseconds — include it in the signed string to reject replayed deliveries.",
        de: "Unix-Millisekunden — nimm sie in den signierten String auf, um wiederholte Zustellungen abzuweisen.",
      },
    },
  ],
  formula: `signature = hex(HMAC_SHA256(secret, timestamp + "." + rawRequestBody))`,
  verify: `// Node.js
import { createHmac, timingSafeEqual } from "node:crypto";

function isValid(secret, timestamp, rawBody, signature) {
  const expected = createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}`,
};
