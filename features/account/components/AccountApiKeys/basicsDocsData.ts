import type { DocText } from "./docText";
import type { GuideRow } from "./GuideParts";

// The two other "Basics" guides of the API docs (BARY-172) — signing in
// and paging, in both languages (`DocText`). Numbers mirror
// `lib/api/rateLimit.ts` and `lib/api/cursor.ts`.

export const AUTH_DOC_INTRO: DocText[] = [
  {
    en: "Every request carries one of your API keys in the Authorization header, as a Bearer token. Keys start with bry_.",
    de: "Jede Anfrage trägt einen deiner API-Keys im Authorization-Header, als Bearer-Token. Keys beginnen mit bry_.",
  },
  {
    en: "Create keys above. The full key is shown once — copy it then. Later you only see its first characters. A key can expire, and you can revoke it at any time.",
    de: "Keys legst du oben an. Der vollständige Key wird nur einmal angezeigt — kopier ihn dann. Später siehst du nur noch die ersten Zeichen. Ein Key kann ablaufen, und du kannst ihn jederzeit widerrufen.",
  },
];

export const AUTH_DOC_EXAMPLE = `curl https://<your-barynt>/api/v1/workspaces \\
  -H "Authorization: Bearer bry_…"`;

export const AUTH_DOC_SCOPES: DocText[] = [
  {
    en: "Each endpoint names the scope it needs, e.g. issues:read. A key reaches only the endpoints its scopes allow.",
    de: "Jeder Endpunkt nennt den Scope, den er braucht, z. B. issues:read. Ein Key erreicht nur die Endpunkte, die seine Scopes erlauben.",
  },
  {
    en: "A scope never grants more than you have: the key acts as you, with your roles. What you can't see in the app, the key can't see either.",
    de: "Ein Scope gibt nie mehr, als du hast: Der Key handelt als du, mit deinen Rollen. Was du in der App nicht siehst, sieht auch der Key nicht.",
  },
  {
    en: "Missing scope: 403 with code insufficient_scope. Something you can't see: 404 — the API doesn't tell whether it exists.",
    de: "Fehlt der Scope: 403 mit Code insufficient_scope. Siehst du etwas nicht: 404 — die API verrät nicht, ob es existiert.",
  },
];

export const AUTH_DOC_RATE: GuideRow[] = [
  {
    name: "120 / min",
    desc: {
      en: "Requests per key. Every response says where you stand.",
      de: "Anfragen pro Key. Jede Antwort sagt, wo du stehst.",
    },
  },
  {
    name: "X-RateLimit-Limit",
    desc: { en: "The budget per minute.", de: "Das Budget pro Minute." },
  },
  {
    name: "X-RateLimit-Remaining",
    desc: { en: "What's left of it.", de: "Was davon übrig ist." },
  },
  {
    name: "X-RateLimit-Reset",
    desc: {
      en: "When it refills, in milliseconds since 1970.",
      de: "Wann es sich wieder auffüllt, in Millisekunden seit 1970.",
    },
  },
  {
    name: "429 rate_limited",
    desc: {
      en: "Budget used up. Retry-After says how many seconds to wait.",
      de: "Budget aufgebraucht. Retry-After sagt, wie viele Sekunden du warten musst.",
    },
  },
];

export const AUTH_DOC_MCP: DocText = {
  en: "The same keys work for the MCP server (Account → MCP), with the same scopes and the same budget.",
  de: "Dieselben Keys funktionieren auch für den MCP-Server (Konto → MCP), mit denselben Scopes und demselben Budget.",
};

export const PAGING_DOC_INTRO: DocText[] = [
  {
    en: "Lists that can grow long come in pages, newest first: a project's issues and a view's issues.",
    de: "Listen, die lang werden können, kommen seitenweise, neueste zuerst: die Issues eines Projekts und die Issues einer View.",
  },
  {
    en: "Ask for up to limit items (1–100, default 25). If there's more, the response has a nextCursor — send it back as cursor for the next page. nextCursor null means you've seen everything.",
    de: "Du bekommst bis zu limit Einträge (1–100, Standard 25). Gibt es mehr, enthält die Antwort einen nextCursor — schick ihn als cursor zurück, um die nächste Seite zu holen. Ist nextCursor null, hast du alles gesehen.",
  },
];

export const PAGING_DOC_EXAMPLE = `let cursor = null;
do {
  const url = new URL("https://<your-barynt>/api/v1/projects/proj_9f8e7d/issues");
  url.searchParams.set("limit", "100");
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await fetch(url, {
    headers: { Authorization: "Bearer bry_…" },
  });
  const { data, nextCursor } = await res.json();
  // … use data …
  cursor = nextCursor;
} while (cursor);`;

export const PAGING_DOC_PARAMS: GuideRow[] = [
  {
    name: "limit",
    type: "1–100",
    desc: {
      en: "Items per page. Default 25.",
      de: "Einträge pro Seite. Standard 25.",
    },
  },
  {
    name: "cursor",
    type: "string",
    desc: {
      en: "The previous page's nextCursor. Opaque — pass it on as it is.",
      de: "Der nextCursor der vorigen Seite. Undurchsichtig — gib ihn unverändert weiter.",
    },
  },
  {
    name: "nextCursor",
    type: "string | null",
    desc: {
      en: "In the response. null on the last page.",
      de: "In der Antwort. null auf der letzten Seite.",
    },
  },
];

export const PAGING_DOC_FIELDS: DocText[] = [
  {
    en: "On issue endpoints, fields trims each item to the keys you name — smaller responses, faster to read.",
    de: "An den Issue-Endpunkten kürzt fields jeden Eintrag auf die Felder, die du nennst — kleinere Antworten, schneller zu lesen.",
  },
  {
    en: "fields=id,ref,title,status returns just those four. id is always included.",
    de: "fields=id,ref,title,status liefert genau diese vier. id ist immer dabei.",
  },
];

export const PAGING_DOC_FIELDS_EXAMPLE = `GET /api/v1/projects/proj_9f8e7d/issues?fields=ref,title,statusCategory

{
  "data": [
    { "id": "i_4k2n1x", "ref": "WEB-42", "title": "Fix broken checkout flow", "statusCategory": "started" }
  ],
  "nextCursor": "aV80azJuMXg"
}`;
