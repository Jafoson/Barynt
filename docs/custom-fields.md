# Custom fields

Extra data on an issue that the fixed columns do not cover: a customer number, an environment, an external address. A field is **defined** once and **answered** on each issue.
(BARY-79. Plugins can declare fields in their manifest and build on them instead of bringing their own tables; that comes with the plugin side of the ticket.)

## What is built

| Part | Where | Ticket |
| --- | --- | --- |
| The model, the types, the checks | `prisma/schema.prisma`, `lib/custom-fields/` | BARY-80 (this page) |
| The permission `customfield.manage` | `lib/rbac/permissions.ts`, [rbac.md](rbac.md#custom-fields-one-permission-bary-79) | BARY-80 |
| Managing fields, filling them in on the issue, showing them on cards and rows | | BARY-81, not built yet |
| REST, MCP, filters, search, webhooks, audit | | BARY-82, not built yet |
| Fields declared by a plugin, and what happens to them when it is uninstalled | | not built yet |

## The model

Two tables ([`prisma/schema.prisma`](../prisma/schema.prisma)).

**`CustomFieldDefinition`** says what a field is and where it applies.

| Column | Meaning |
| --- | --- |
| `workspaceId`, `projectId` | `projectId` `null` = a **workspace-wide** field (every project of the workspace), else that **project's** field only. The same reach as a `Label` |
| `key` | What the API and a plugin's manifest call it: 2 to 40 lowercase letters, digits and single dashes, starting with a letter. **Unique in the workspace**, project fields included, so a key names one field everywhere |
| `name`, `description` | What people read. The name is one line of at most 60 characters, the description at most 200 |
| `type` | One of the six types below. A `const` tuple in [`lib/custom-fields/types.ts`](../lib/custom-fields/types.ts), **not a database enum**: a new type is a change in code and no migration |
| `config` | What the type allows, in its normal form (below) |
| `position` | The order in lists and on the issue |
| `archivedAt` | Set when a field is retired: it leaves the screens and the API, and **its values stay** |
| `pluginId` | The plugin that declared it, `null` for a field a person made. `ON DELETE SET NULL`: when a plugin is uninstalled and the admin keeps its fields, they become ordinary ones |

At most **100** definitions per workspace (`MAX_CUSTOM_FIELDS_PER_WORKSPACE`), the projects' included.

**`CustomFieldValue`** is one issue's answer to one field. The primary key is `(issueId, fieldId)`, so an issue has at most one answer to a field. **No value is no row.**

The value lives in **the column of the field's type**, so a filter is an indexed comparison and not a look into JSON:

| Type | Value on the outside | Column |
| --- | --- | --- |
| `text` | one trimmed line, at most `maxLength` characters (default 200, at most 1000) | `text` |
| `url` | an `http://` or `https://` address without a user name or password, at most 2000 characters | `text` |
| `select` | the **id** of one of the options | `text` |
| `number` | a number (never a text that looks like one); optionally whole numbers only, a smallest and a largest | `number` (double) |
| `date` | a day as `YYYY-MM-DD`, stamped at **noon UTC** like `Issue.dueDate`, so it never slips to another day | `date` |
| `user` | a member's id | `userId` |

A **check constraint** (`CustomFieldValue_one_value_check`) makes the database refuse a row with no column set or with two: a row is exactly one value. Each of the four columns has an index with `fieldId` in front, for "which issues have this value". Deleting an issue, a project, a workspace or a definition deletes the values (`CASCADE`); deleting a **member** deletes the values that name them.

## What a type allows (`config`)

Checked and put in its normal form by `parseFieldConfig` ([`lib/custom-fields/config.ts`](../lib/custom-fields/config.ts)); a setting the type does not have is **refused, not ignored**.

| Type | `config` |
| --- | --- |
| `text` | `{ maxLength }` |
| `number` | `{ integer, min, max }` (`min`/`max` may be `null`; whole bounds when `integer`) |
| `select` | `{ options: [{ id, label, color }] }`, 1 to 50 options |
| `date`, `user`, `url` | `{}` |

**The options of a choice.** An option's **id** is what values store, so **renaming an option changes its label and never its id**. A new option gets an id made of its label (`Staging` becomes `staging`, a second one `staging-2`); one that comes with an id keeps it. Labels are unique whatever the case, and at most 60 characters on one line; a color is `#rrggbb` or none.

## Reading and writing a value

- **`toColumns(field, input)`** turns what a person, an API client or a plugin sends into the columns, or says why not. `null`, `undefined`, an empty text and a text of only spaces are **"no value"** (the caller removes the row); zero is a number, `false` is not a text. Nothing is coerced: `"42"` is not a number.
- **`fromColumns(type, columns)`** gives the value back, and only from the column of the field's type: a row written for another type, or by hand, is not read as this one's.
- **`fieldConfigOrDefault(type, stored)`** reads a stored `config` and **never throws or refuses**: a definition that an older version or someone wrote by hand must not make an issue unreadable.
- What needs the database is the caller's: that a `user` is a **member of the workspace**, and that the field **applies to the issue's project** (a project field only in its project).

## Who may do what

- **Defining** is `customfield.manage`: in the workspace for workspace-wide fields (`owner`, `admin`, `manager`), in a project for that project's (`project_admin`) ([rbac.md](rbac.md#custom-fields-one-permission-bary-79)).
- **Filling in** a field is editing the issue: `issue.update.own` / `issue.update.any`, like status or labels.

## Demo data

`bun db:seed` creates a workspace-wide text field **Customer** and a select field **Environment** in the first project, answered on a few issues.

## Not decided yet

- Multiple choice, a boolean and a required flag are not in v1; a type is an addition to the tuple and its column mapping.
- Whether a project may hide a workspace-wide field (the way it hides a workspace label) is decided with the screens (BARY-81).
