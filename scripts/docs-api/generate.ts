// Writes the API reference pages of docs/guide/ (English and German) from the
// same data the in-app reference uses, so the website and the app can't
// disagree:
//
//   bun run docs:api          # rewrite docs/guide/{en,de}/api-reference/
//   bun run docs:api:check    # fail if they are out of date (also a unit test)
//
// Sources: features/account/components/AccountApiKeys/*DocsData.ts (REST,
// filters, webhooks), AccountMcp/mcpDocsData.ts (MCP tools, descriptions) and
// the real input schemas of the MCP tools (lib/mcp/tools.ts).
//
// The hand-written guides (integrations/api.md, mcp.md, webhooks.md) explain
// the ideas; these pages are the complete lookup. Don't edit the generated
// files, change the data and run the script.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  API_DOC_GROUPS,
  API_DOC_WEBHOOK_EVENTS,
  type ApiDocEndpoint,
  type ApiDocGroupId,
  type ApiDocParam,
} from "../../features/account/components/AccountApiKeys/apiDocsData";
import type { DocText } from "../../features/account/components/AccountApiKeys/docText";
import {
  FILTER_DOC_FIELDS,
  FILTER_DOC_FIRST_EXAMPLE,
  FILTER_DOC_GROUP_EXAMPLE,
  FILTER_DOC_GROUP_TEXT,
  FILTER_DOC_INTRO,
  FILTER_DOC_OPS,
  FILTER_DOC_PITFALLS,
  FILTER_DOC_RECIPES,
  FILTER_DOC_RULE_KEYS,
  FILTER_DOC_SPECIAL,
  FILTER_DOC_USAGE,
} from "../../features/account/components/AccountApiKeys/filterDocsData";
import { MCP_TOOL_GROUPS } from "../../features/account/components/AccountMcp/mcpDocsData";

export type Lang = "en" | "de";
export type Generated = { path: string; text: string };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs/guide");

/** The in-app texts point at neighbouring panels ("Basics → Filter, above");
 *  here that is a link. */
const doc = (text: DocText, lang: Lang) =>
  (typeof text === "string" ? text : text[lang])
    .replace(
      '{"op":"and","rules":[{"field":"priority","is":"gte","value":3}]}',
      '`{"op":"and","rules":[{"field":"priority","is":"gte","value":3}]}`',
    )
    .replace("Basics → Filter, above", "[Filters](filters.md)")
    .replace("Grundlagen → Filter, oben", "[Filter](filters.md)");
/** One line for a table cell. */
const cell = (text: string) =>
  text
    .replace(/\s*\n\s*/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
const fence = (code: string, lang = "json") => `\`\`\`${lang}\n${code}\n\`\`\``;

const TEXT = {
  en: {
    scope: "Scope",
    path: "Path parameters",
    query: "Query parameters",
    body: "Body",
    name: "Name",
    type: "Type",
    required: "Required",
    description: "Description",
    yes: "yes",
    request: "Request",
    response: "Response",
    example: "Example",
    generated: "Generated from the API's reference data. Do not edit by hand.",
    note: "Every call needs the scope shown and a key (or token) that belongs to someone who may do this in the app. See [Authentication and basics](../integrations/api.md).",
  },
  de: {
    scope: "Scope",
    path: "Pfad-Parameter",
    query: "Query-Parameter",
    body: "Body",
    name: "Name",
    type: "Typ",
    required: "Pflicht",
    description: "Beschreibung",
    yes: "ja",
    request: "Anfrage",
    response: "Antwort",
    example: "Beispiel",
    generated: "Aus den Referenzdaten der API erzeugt. Nicht von Hand ändern.",
    note: "Jeder Aufruf braucht den genannten Scope und einen Key (oder ein Token) von jemandem, der das in der App darf. Siehe [Anmeldung und Grundlagen](../integrations/api.md).",
  },
} as const;

interface Page {
  file: string;
  order: number;
  title: DocText;
  description: DocText;
  intro: DocText;
}

const REST_PAGES: Record<ApiDocGroupId, Page> = {
  workspaces: {
    file: "workspaces",
    order: 1,
    title: { en: "Workspaces", de: "Workspaces" },
    description: {
      en: "REST API: list, create, change and delete workspaces.",
      de: "REST-API: Workspaces auflisten, anlegen, ändern und löschen.",
    },
    intro: {
      en: "A workspace is the top level: it holds projects, members, labels and statuses.",
      de: "Ein Workspace ist die oberste Ebene: Er enthält Projekte, Mitglieder, Labels und Status.",
    },
  },
  projects: {
    file: "projects",
    order: 2,
    title: { en: "Projects", de: "Projekte" },
    description: {
      en: "REST API: list, create, change and delete projects.",
      de: "REST-API: Projekte auflisten, anlegen, ändern und löschen.",
    },
    intro: {
      en: "Projects hold the issues. They belong to one workspace.",
      de: "Projekte enthalten die Issues. Sie gehören zu genau einem Workspace.",
    },
  },
  issues: {
    file: "issues",
    order: 3,
    title: { en: "Issues and relations", de: "Issues und Beziehungen" },
    description: {
      en: "REST API: list with filters and paging, read, create, change and delete issues, and link them to each other.",
      de: "REST-API: Issues mit Filtern und Seiten auflisten, lesen, anlegen, ändern, löschen und miteinander verknüpfen.",
    },
    intro: {
      en: "The issue list is paged and can be filtered, see [Filters](filters.md).",
      de: "Die Issue-Liste kommt seitenweise und lässt sich filtern, siehe [Filter](filters.md).",
    },
  },
  options: {
    file: "options",
    order: 4,
    title: {
      en: "Statuses, priorities and types",
      de: "Status, Prioritäten und Typen",
    },
    description: {
      en: "REST API: the values an issue's status, priority and type can take.",
      de: "REST-API: Welche Werte Status, Priorität und Typ eines Issues annehmen können.",
    },
    intro: {
      en: "Read-only lists. Use them to find the ids you put into issues and filters.",
      de: "Nur lesbare Listen. Hier findest du die IDs, die du in Issues und Filtern verwendest.",
    },
  },
  comments: {
    file: "comments",
    order: 5,
    title: { en: "Comments", de: "Kommentare" },
    description: {
      en: "REST API: list, write, change and delete comments on an issue.",
      de: "REST-API: Kommentare eines Issues auflisten, schreiben, ändern und löschen.",
    },
    intro: {
      en: "Comments and replies on an issue.",
      de: "Kommentare und Antworten an einem Issue.",
    },
  },
  attachments: {
    file: "attachments",
    order: 6,
    title: { en: "Attachments", de: "Anhänge" },
    description: {
      en: "REST API: list, add (file or link), read and remove attachments of an issue.",
      de: "REST-API: Anhänge eines Issues auflisten, hinzufügen (Datei oder Link), lesen und entfernen.",
    },
    intro: {
      en: "Files and links attached to an issue.",
      de: "Dateien und Links an einem Issue.",
    },
  },
  labels: {
    file: "labels",
    order: 7,
    title: { en: "Labels", de: "Labels" },
    description: {
      en: "REST API: list, create, change and delete labels.",
      de: "REST-API: Labels auflisten, anlegen, ändern und löschen.",
    },
    intro: {
      en: "Labels belong to a workspace and can be put on any issue in it.",
      de: "Labels gehören zu einem Workspace und lassen sich an jedes Issue darin hängen.",
    },
  },
  members: {
    file: "members",
    order: 8,
    title: { en: "Members", de: "Mitglieder" },
    description: {
      en: "REST API: the people of a workspace or a project.",
      de: "REST-API: Die Mitglieder eines Workspace oder Projekts.",
    },
    intro: {
      en: "Read-only. People are added and removed in the app.",
      de: "Nur lesbar. Personen werden in der App hinzugefügt und entfernt.",
    },
  },
  views: {
    file: "views",
    order: 9,
    title: { en: "Views", de: "Views" },
    description: {
      en: "REST API: saved views, and the issues a view shows.",
      de: "REST-API: Gespeicherte Views und die Issues, die eine View zeigt.",
    },
    intro: {
      en: "A view stores a filter, grouping and sorting under a name. Its filter uses the [filter language](filters.md).",
      de: "Eine View speichert Filter, Gruppierung und Sortierung unter einem Namen. Ihr Filter nutzt die [Filtersprache](filters.md).",
    },
  },
};

const frontMatter = (page: Page, lang: Lang) =>
  `---\ntitle: ${JSON.stringify(doc(page.title, lang))}\ndescription: ${JSON.stringify(doc(page.description, lang))}\nsidebar:\n  order: ${page.order}\n---\n\n<!-- ${TEXT[lang].generated} (scripts/docs-api/generate.ts) -->\n\n`;

// ─── REST ────────────────────────────────────────────────────────────────

/** `/api/v1/issues/{id}/comments` → `$ISSUE_ID`. */
function curlPath(path: string): string {
  return path.replace(/([a-z-]+)\/\{id\}/g, (_, seg: string) => {
    const singular = seg
      .replace(/ies$/, "y")
      .replace(/s$/, "")
      .replace(/-/g, "_")
      .toUpperCase();
    return `${seg}/$${singular}_ID`;
  });
}

function paramTable(params: ApiDocParam[], lang: Lang): string {
  const t = TEXT[lang];
  const rows = params.map(
    (p) =>
      `| \`${p.name}\` | \`${cell(p.type)}\` | ${p.required ? t.yes : ""} | ${cell(doc(p.desc, lang))} |`,
  );
  return `| ${t.name} | ${t.type} | ${t.required} | ${t.description} |\n| --- | --- | --- | --- |\n${rows.join("\n")}`;
}

function endpoint(e: ApiDocEndpoint, lang: Lang): string {
  const t = TEXT[lang];
  const out: string[] = [];
  out.push(`## \`${e.method} ${e.path}\``);
  out.push(`${t.scope}: \`${e.scope}\`\n\n${doc(e.desc, lang)}`);
  if (e.pathParams?.length)
    out.push(`**${t.path}**\n\n${paramTable(e.pathParams, lang)}`);
  if (e.queryParams?.length)
    out.push(`**${t.query}**\n\n${paramTable(e.queryParams, lang)}`);
  if (e.bodyParams?.length)
    out.push(`**${t.body}**\n\n${paramTable(e.bodyParams, lang)}`);
  const curl = [
    `curl ${e.method === "GET" ? "" : `-X ${e.method} `}"$BARYNT_URL${curlPath(e.path)}" \\`,
    `  -H "Authorization: Bearer $BARYNT_API_KEY"${e.requestExample ? " \\" : ""}`,
  ];
  if (e.requestExample)
    curl.push(
      `  -H "Content-Type: application/json" \\`,
      `  -d '${e.requestExample.replace(/\n\s*/g, " ")}'`,
    );
  out.push(`**${t.example}**\n\n${fence(curl.join("\n"), "bash")}`);
  if (e.requestExample)
    out.push(`**${t.request}**\n\n${fence(e.requestExample)}`);
  out.push(
    `**${t.response}**\n\n${fence(e.response, e.response.includes("//") ? "jsonc" : "json")}`,
  );
  return out.join("\n\n");
}

function restPage(id: ApiDocGroupId, lang: Lang): Generated {
  const page = REST_PAGES[id];
  const group = API_DOC_GROUPS.find((g) => g.id === id);
  if (!group) throw new Error(`No API docs for ${id}`);
  const text = `${frontMatter(page, lang)}${doc(page.intro, lang)} ${TEXT[lang].note}\n\n${group.endpoints.map((e) => endpoint(e, lang)).join("\n\n")}\n`;
  return { path: `${lang}/api-reference/${page.file}.md`, text };
}

// ─── Filters ─────────────────────────────────────────────────────────────

const FILTER_STRINGS = {
  en: {
    title: "Filters",
    description:
      "The filter language of the API: how to say which issues you want, with rules, groups, fields, comparisons and ready-made recipes.",
    first: "The smallest useful filter",
    group: "Either … or …",
    rule: "A rule",
    fields: "Fields",
    fieldsIntro:
      "Which comparisons a field takes is listed per field. Values are ids unless noted.",
    field: "Field",
    ops: "Comparisons (`is`)",
    op: "Comparison",
    means: "Means",
    value: "Value",
    special: "Special values",
    recipes: "Recipes",
    usage: "Where a filter goes",
    pitfalls: "What usually goes wrong",
    comparisons: "Comparisons",
    nullable: "takes `_none`",
    what: "What it is",
    values: "Values",
  },
  de: {
    title: "Filter",
    description:
      "Die Filtersprache der API: wie du sagst, welche Issues du willst, mit Regeln, Gruppen, Feldern, Vergleichen und fertigen Rezepten.",
    first: "Der kleinste nützliche Filter",
    group: "Entweder … oder …",
    rule: "Eine Regel",
    fields: "Felder",
    fieldsIntro:
      "Welche Vergleiche ein Feld kennt, steht beim Feld. Werte sind IDs, sofern nichts anderes dabeisteht.",
    field: "Feld",
    ops: "Vergleiche (`is`)",
    op: "Vergleich",
    means: "Bedeutung",
    value: "Wert",
    special: "Besondere Werte",
    recipes: "Rezepte",
    usage: "Wo ein Filter hingehört",
    pitfalls: "Was meistens schiefgeht",
    comparisons: "Vergleiche",
    nullable: "kennt `_none`",
    what: "Was es ist",
    values: "Werte",
  },
} as const;

function filtersPage(lang: Lang): Generated {
  const s = FILTER_STRINGS[lang];
  const page: Page = {
    file: "filters",
    order: 10,
    title: s.title,
    description: s.description,
    intro: "",
  };
  const out: string[] = [];
  out.push(FILTER_DOC_INTRO.map((l) => doc(l, lang)).join("\n\n"));
  out.push(`## ${s.first}\n\n${fence(FILTER_DOC_FIRST_EXAMPLE)}`);
  out.push(
    `## ${s.group}\n\n${doc(FILTER_DOC_GROUP_TEXT, lang)}\n\n${fence(FILTER_DOC_GROUP_EXAMPLE)}`,
  );
  out.push(
    `## ${s.rule}\n\n| ${TEXT[lang].name} | ${TEXT[lang].type} | ${TEXT[lang].description} |\n| --- | --- | --- |\n${FILTER_DOC_RULE_KEYS.map((r) => `| \`${r.name}\` | \`${cell(r.type ?? "")}\` | ${cell(doc(r.desc, lang))} |`).join("\n")}`,
  );
  out.push(
    `## ${s.fields}\n\n${s.fieldsIntro}\n\n| ${s.field} | ${s.what} | ${s.comparisons} | ${s.values} |\n| --- | --- | --- | --- |\n${FILTER_DOC_FIELDS.map((f) => `| \`${f.field}\` | ${cell(doc(f.what, lang))} | ${f.ops.map((o) => `\`${o}\``).join(", ")} | ${cell(doc(f.values, lang))}${f.nullable ? ` (${s.nullable})` : ""} |`).join("\n")}`,
  );
  out.push(
    `## ${s.ops}\n\n| ${s.op} | ${s.means} | ${s.value} |\n| --- | --- | --- |\n${Object.entries(
      FILTER_DOC_OPS,
    )
      .map(
        ([op, info]) =>
          `| \`${op}\` | ${cell(doc(info.means, lang))} | ${info.value === "—" ? "—" : `\`${cell(info.value)}\``} |`,
      )
      .join("\n")}`,
  );
  out.push(
    `## ${s.special}\n\n| ${s.value} | ${TEXT[lang].description} |\n| --- | --- |\n${FILTER_DOC_SPECIAL.map((r) => `| \`${r.name}\` | ${cell(doc(r.desc, lang))} |`).join("\n")}`,
  );
  out.push(
    `## ${s.recipes}\n\n${FILTER_DOC_RECIPES.map((r) => `### ${doc(r.title, lang)}\n\n${fence(r.code)}`).join("\n\n")}`,
  );
  out.push(
    `## ${s.usage}\n\n${FILTER_DOC_USAGE.map((r) => `- \`${r.name}\`: ${doc(r.desc, lang)}`).join("\n")}`,
  );
  out.push(
    `## ${s.pitfalls}\n\n${FILTER_DOC_PITFALLS.map((l) => `- ${doc(l, lang)}`).join("\n")}`,
  );
  return {
    path: `${lang}/api-reference/filters.md`,
    text: `${frontMatter(page, lang)}${out.join("\n\n")}\n`,
  };
}

// ─── Webhook events ──────────────────────────────────────────────────────

function webhookEventsPage(lang: Lang): Generated {
  const de = lang === "de";
  const page: Page = {
    file: "webhook-events",
    order: 11,
    title: de ? "Webhook-Ereignisse" : "Webhook events",
    description: de
      ? "Alle Ereignisse, die Barynt per Webhook meldet, jeweils mit einer Beispiel-Nachricht."
      : "Every event Barynt sends to a webhook, each with an example message.",
    intro: "",
  };
  const intro = de
    ? "Jede Nachricht ist ein `POST` mit JSON-Body `{ event, timestamp, data }` und signiert, siehe [Webhooks](../integrations/webhooks.md). Hier steht, was in `data` steckt."
    : "Every message is a `POST` with the JSON body `{ event, timestamp, data }`, signed as described in [Webhooks](../integrations/webhooks.md). This page shows what is in `data`.";
  const body = API_DOC_WEBHOOK_EVENTS.map(
    (e) => `## \`${e.event}\`\n\n${doc(e.desc, lang)}\n\n${fence(e.payload)}`,
  ).join("\n\n");
  return {
    path: `${lang}/api-reference/webhook-events.md`,
    text: `${frontMatter(page, lang)}${intro}\n\n${body}\n`,
  };
}

// ─── MCP tools ───────────────────────────────────────────────────────────

interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  minimum?: number;
  maximum?: number;
}

function schemaType(s: JsonSchema): string {
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (s.anyOf)
    return [...new Set(s.anyOf.map(schemaType))]
      .filter((t) => t !== "null")
      .join(" | ");
  const base = Array.isArray(s.type) ? s.type.join(" | ") : (s.type ?? "any");
  if (base === "array" && s.items) return `${schemaType(s.items)}[]`;
  if (base === "integer" || base === "number") {
    const range =
      s.minimum !== undefined && s.maximum !== undefined
        ? ` (${s.minimum}–${s.maximum})`
        : "";
    return `${base}${range}`;
  }
  return base;
}

async function loadMcpInputs(): Promise<Map<string, JsonSchema>> {
  const { plugin } = await import("bun");
  plugin({
    name: "server-only-stub",
    setup(build) {
      build.module("server-only", () => ({ exports: {}, loader: "object" }));
    },
  });
  const { registerBaryntTools } = await import("../../lib/mcp/tools");
  const { z } = await import("zod");
  const inputs = new Map<string, JsonSchema>();
  registerBaryntTools({
    registerTool: (name: string, config: { inputSchema?: never }) => {
      inputs.set(
        name,
        config.inputSchema
          ? (z.toJSONSchema(config.inputSchema) as JsonSchema)
          : {},
      );
    },
  } as never);
  return inputs;
}

const MCP_GROUP_TITLES: Record<string, DocText> = {
  workspaces: { en: "Workspaces", de: "Workspaces" },
  projects: { en: "Projects", de: "Projekte" },
  issues: { en: "Issues and relations", de: "Issues und Beziehungen" },
  options: {
    en: "Statuses, priorities and types",
    de: "Status, Prioritäten und Typen",
  },
  comments: { en: "Comments", de: "Kommentare" },
  attachments: { en: "Attachments", de: "Anhänge" },
  labels: { en: "Labels", de: "Labels" },
  members: { en: "Members", de: "Mitglieder" },
  views: { en: "Views", de: "Views" },
};

function mcpToolsPage(lang: Lang, inputs: Map<string, JsonSchema>): Generated {
  const de = lang === "de";
  const t = TEXT[lang];
  const page: Page = {
    file: "mcp-tools",
    order: 12,
    title: de ? "MCP-Tools" : "MCP tools",
    description: de
      ? "Alle Tools des Barynt-MCP-Servers mit Scope und Argumenten."
      : "Every tool of the Barynt MCP server, with its scope and arguments.",
    intro: "",
  };
  const intro = de
    ? "Jedes Tool entspricht einem Aufruf der REST-API, mit denselben Scopes, Rechten und Antworten. Argumente sind eine flache Liste; ein `*` markiert Pflichtangaben. Wie du einen Client verbindest, steht unter [MCP-Server](../integrations/mcp.md)."
    : "Each tool matches a call of the REST API, with the same scopes, permissions and answers. Arguments are one flat list; a `*` marks required ones. How to connect a client is described in [MCP server](../integrations/mcp.md).";
  const out: string[] = [];
  for (const group of MCP_TOOL_GROUPS) {
    out.push(`## ${doc(MCP_GROUP_TITLES[group.id] ?? group.id, lang)}`);
    for (const tool of group.tools) {
      const schema = inputs.get(tool.name);
      if (!schema)
        throw new Error(
          `MCP tool ${tool.name} is documented but not registered`,
        );
      const props = Object.entries(schema.properties ?? {});
      const required = new Set(schema.required ?? []);
      const lines = [
        `### \`${tool.name}\``,
        `${t.scope}: \`${tool.scope}\`\n\n${doc(tool.desc, lang)}`,
      ];
      if (props.length)
        lines.push(
          `| ${t.name} | ${t.type} | ${t.description} |\n| --- | --- | --- |\n${props
            .map(
              ([name, s]) =>
                `| \`${name}\`${required.has(name) ? " \\*" : ""} | \`${cell(schemaType(s))}\` | ${cell(s.description ?? "")} |`,
            )
            .join("\n")}`,
        );
      out.push(lines.join("\n\n"));
    }
  }
  const missing: string[] = [];
  for (const [name] of inputs)
    if (
      !MCP_TOOL_GROUPS.some((g) => g.tools.some((tool) => tool.name === name))
    )
      missing.push(name);
  if (missing.length)
    throw new Error(
      `MCP tools registered but not documented (mcpDocsData.ts): ${missing.join(", ")}`,
    );
  return {
    path: `${lang}/api-reference/mcp-tools.md`,
    text: `${frontMatter(page, lang)}${intro}\n\n${out.join("\n\n")}\n`,
  };
}

// ─── Run ─────────────────────────────────────────────────────────────────

export async function generate(): Promise<Generated[]> {
  const inputs = await loadMcpInputs();
  const files: Generated[] = [];
  for (const lang of ["en", "de"] as const) {
    for (const id of Object.keys(REST_PAGES) as ApiDocGroupId[])
      files.push(restPage(id, lang));
    files.push(
      filtersPage(lang),
      webhookEventsPage(lang),
      mcpToolsPage(lang, inputs),
    );
  }
  return files;
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  const files = await generate();
  let stale = 0;
  for (const file of files) {
    const path = join(OUT, file.path);
    const current = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (current === file.text) continue;
    stale++;
    if (check) console.error(`out of date: docs/guide/${file.path}`);
    else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, file.text);
      console.log(`wrote docs/guide/${file.path}`);
    }
  }
  if (check && stale) {
    console.error("Run `bun run docs:api` and commit the result.");
    process.exit(1);
  }
  process.exit(0);
}
