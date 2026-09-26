# Custom fields

Extra data on an issue that the fixed columns do not cover: a customer number, an environment, an external address. A field is **defined** once and **answered** on each issue.
(BARY-79. Plugins can declare fields in their manifest and build on them instead of bringing their own tables; that comes with the plugin side of the ticket.)

## What is built

| Part | Where | Ticket |
| --- | --- | --- |
| The model, the types, the checks | `prisma/schema.prisma`, `lib/custom-fields/` | BARY-80 (this page) |
| The permission `customfield.manage` | `lib/rbac/permissions.ts`, [rbac.md](rbac.md#custom-fields-one-permission-bary-79) | BARY-80 |
| Defining fields: create, change, archive, delete (server side, audited) | `features/custom-fields/` | BARY-81, this page |
| The screens to manage them: a workspace's Fields section, a project's Fields page, the window | `features/custom-fields/components/`, `formState.ts` | BARY-81, this page |
| Answering them on the issue (detail page, panel and dialog) | `features/custom-fields/values.ts`, `valueActions.ts`, `IssueCustomFields` | BARY-81, this page |
| Answering them when an issue is created (the composer) | `features/custom-fields/composerAnswers.ts`, `FieldChip`, `createIssue` | BARY-81, this page |
| Showing them on cards and rows, and the Display panel that chooses which | `features/custom-fields/cardFields.ts`, `CardFieldValues`, `features/issues/viewCustomFields.ts` | BARY-81, this page |
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

## Defining fields (`features/custom-fields/actions.ts`)

Four actions, each asks for `customfield.manage` **where the field applies** (the workspace for a workspace-wide field, the project for a project's, so a project admin cannot touch a
field that applies in every project) and reports the reason instead of throwing, like the label actions. What the client sends is data: `parseDefinition` checks it and says which part is
wrong (`issues`, one per part).

| Action | What it does | Audit entry |
| --- | --- | --- |
| `createCustomField(scope, input)` | A new field in the workspace (`{ workspaceId }`) or in a project (`{ projectId }`, and the workspace is then the **project's**, never the caller's). The key is made of the name unless one is given, and **numbered while it is taken**; one that was asked for and is taken is refused. At most 100 per workspace. The new field goes last | `customfield.created` |
| `changeCustomField(id, { name, description, config })` | What is left out stays. **The key and the type never change** (the API and a plugin's manifest use the key; the answers would no longer fit a new type). **An option of a choice cannot be taken away while an issue answers with it**: the reason names the option and how many. Saving what is already there writes and audits nothing | `customfield.updated`, naming which parts changed |
| `setCustomFieldArchived(id, archived)` | Retire a field or bring it back; the answers stay | `customfield.archived` / `customfield.restored` |
| `deleteCustomField(id)` | Deletes the field **and every answer to it**. The audit entry counts them | `customfield.deleted` (marked: it cannot be undone) |

- **A plugin's field is the plugin's** (`pluginId` set): a person cannot change, archive or delete it.
- **Two people making the same key at once:** the database says which one came second, and that one gets "a field with this key already exists".

What the screens read is in [`features/custom-fields/queries.ts`](../features/custom-fields/queries.ts): `getCustomFieldsView` (a workspace's page needs `customfield.manage`; a project's page shows to whoever may see the project and says whether they may manage; a project's page also lists the workspace-wide fields that apply there, read only) and `getFieldsOfProject` (the fields an issue has: workspace-wide and the project's, archived ones left out). A row whose type this code does not know is left out, never breaks the page.

## The screens

- **The workspace's fields**: `/<workspace>/settings/fields`, a section of the workspace settings for whoever holds `customfield.manage` in the workspace (`WORKSPACE_SETTINGS_NAV`; the page is a 404 without it,
  because `getCustomFieldsView` asks itself). Holding it also makes the workspace settings reachable, like `role.manage` does.
- **A project's fields**: the project's existing **Fields** page (`.../settings/fields`) keeps the switches of the built-in detail fields and gets an **Own fields** section below them: the project's own fields (change,
  archive, delete for whoever holds `customfield.manage` in the project, the list only for everyone else who may see the project) and, under **From the workspace**, the workspace-wide fields that apply there, **read only**:
  they are changed where they belong. A project cannot hide a workspace-wide field in v1; archive it in the workspace.
- **One list component** (`CustomFields`, with `embedded` for the project's page) and **one window** (`CustomFieldModal`, opened by `useOpenCustomFieldModal`): a bottom sheet on a phone (no Cancel, no autofocus), a
  dialog from a tablet up. The rows become cards on a phone (`card-rows`).
- **The key and the type are asked for only when a field is made** and cannot be changed after, so the change window has neither box (the type is shown, greyed, and says why). What a type allows
  (a text's length, a number's range and whole-numbers switch, a choice's options) can change. An option keeps its **id** through a rename (the window sends the id it read) and a new option has none, the server makes it.
  Taking away an option that issues answer with is refused by the server and the window says so under the options.
- **Archive before delete**: an archived field goes to its own **Archived** list (no longer offered, answers kept) with Restore and Delete. Deleting asks first and says **how many answers go with it**, in words
  that point to archiving as the way to keep them. A field a plugin declared shows a **Plugin** mark instead of buttons (the actions refuse it too).
- The **New field** button is off, with the reason, when the workspace has reached its 100 fields (`view.room`).
- The form's state is pure (`features/custom-fields/formState.ts`: `initialForm`, `configOf`, `toCreateInput`/`toChangeInput`, `isDirty`, `groupIssues`), so the conversions are tested without a DOM. A number is kept as the
  text of its box: an empty box is "no limit", never zero, and text that is not a number is sent as `NaN` for the server to refuse.

## Answering a field on an issue

- **One place writes an answer**: `writeFieldValue` (`features/custom-fields/values.ts`, server-only). The web app's action `setCustomFieldValue(issueId, fieldId, value)` (`valueActions.ts`) decides who may edit the issue, then calls it; the REST API and the MCP tools will do the
  same after **their** own check (BARY-82), so an answer is treated the same wherever it comes from.
- **Who may**: what editing the issue takes (`issue.update.any`, or `issue.update.own` for its reporter and assignee), the same as `updateIssue`; `customfield.manage` has nothing to do with it. Someone who may not, and an issue that does not exist, get the same sentence.
- **The field has to be this issue's**: of the issue's workspace, workspace-wide or its own project's, and **not archived** (an archived field's answers stay in the database, out of sight and out of reach). Anything else is "this field does not apply to this issue".
- **The answer is checked** by `toColumns` (the type's rules, in the field's own words: "Customer must be at most 60 characters."), and a `user` has to be a **member of the workspace**. Nothing is coerced. **An answer that is already there** writes and logs nothing (`{ ok: true, changed: false }`).
- **Stored** in the column of the field's type, all four columns written on a change so an old answer never sits beside the new one; clearing (null, an empty text) deletes the row. A field or an issue deleted while the write is on its way is "does not apply", not an error page.
- **Logged** once per change in the issue's own history: `issue.customField.changed`, label `Customer: Acme → Globex` (a choice by its label, a person by their name, none as `—`), the raw values in the entry's details. The webhook `issue.updated` and the API's payload
  learn about custom fields with BARY-82.
- **Reading**: `getIssueFieldEntries` (`queries.ts`) gives an issue its fields with its answers (`IssueDetail.customFields`, filled by the detail queries `getIssueById`/`getIssueByRef` only; `[]` on a board card or a list row). It asks nobody: the caller has let this person see the issue.
- **On screen** (`IssueCustomFields`): rows beside the planning rows in the attributes sidebar, and a section of its own, "Custom fields", in the stacked body (panel, and the full page on a phone). Whoever may edit the issue gets a popover per row (`FieldEditor`: a choice and a person are picked from a list, a text, number, day
  and address are typed and saved with the button); everyone else sees the answer, an address as a link. What cannot be saved says why beside the box before any request (`fieldInput.ts` runs the server's own `toColumns`), and a refusal from the server shows under its own row. `FieldValueView` draws one answer without a box of its own, so
  cards and list rows can use it.

## Answering a field while an issue is created

- The composer shows the fields that apply to its project as **chips in a second toolbar** under the attribute chips (`FieldChip`: the field's name until it has an answer, then the answer, highlighted, with a clear button; the detail view's `FieldEditor` opens). The composer's data carries the fields
  (`IssueComposerData.customFields`, from `getFieldsForNewIssues`: workspace-wide plus those of the projects where this person may create, archived left out; none where nothing can be created). Switching the project drops the answers of the old project's own fields
  (`answersForProject`), like it does for its labels. The state is pure (`composerAnswers.ts`).
- `createIssue` takes `customFields` (by field id) and **checks them before anything is written** (`resolveNewAnswers`, the same resolver as an answer on an existing issue): an answer that does not fit refuses the whole creation with `{ error }` (the composer shows it in its footer and stays as it is),
  and the project's next issue number is not used up. A field that no longer applies (archived while the window was open, another project's, gone) is left out, never an error. The answers are written with the issue and **not logged one by one**: `issue.created` is the one entry. `createIssue` now returns `{ id } | { error }`.

## Fields on cards and rows

- **Opt-in, per person and per view.** A board card or a list row shows no custom field until this person asks for it in the **Display** panel ("Custom fields" chips under the built-in ones, on the phone in the sheet). The choice is stored per project and view (`IssueViewPreference.shownCustomFields`) and, across projects, per workspace and view
  (`MyIssuesViewPreference.shownCustomFields`): field ids, **the other way round from `hiddenFields`** (which is everything-on by default), so a workspace with fields does not turn every card into a wall. At most six (`MAX_SHOWN_CUSTOM_FIELDS`); an id whose field is gone or archived is ignored when read.
- **What is read**: the page asks `getViewCustomFields` for the shown fields and the answers of **the issues on the page** (one query for the answers, none when nothing is shown), and hands them to the board and the list as `CardCustomFields` (`IssueLookups.customFields` on the board, the `customFields` prop on the list). `IssueDetail.customFields` stays `[]` on cards and rows.
- **Drawing**: `CardFieldValues` shows each answer with the field's name before it, small and quiet (`FieldValueView` inside): below the labels on a board card, in a column of its own in a list row (on a phone or tablet its own line at the bottom of the card). It is read-only: the card opens the issue, and the answer is changed there. An issue with no answer to a shown field shows nothing.
- **Saved by** `setIssueViewCustomFields` and `setMyIssuesViewCustomFields` (personal settings: signed in, nothing more; the list is cut down by `sanitizeShownFields`).
- **The `my issues` display actions take the workspace as an argument** (`setMyIssuesViewFieldVisibility`, `setMyIssuesViewGroups`, `setMyIssuesViewCustomFields`; the Topbar binds it): a Server Action runs before the page it was called from is rendered, so `getCurrentWorkspaceId()` is `null` in it and the old versions silently wrote nothing (the display settings of "my issues" never saved). The workspace is client data, so the action asks that this person can enter it.

## Who may do what

- **Defining** is `customfield.manage`: in the workspace for workspace-wide fields (`owner`, `admin`, `manager`), in a project for that project's (`project_admin`) ([rbac.md](rbac.md#custom-fields-one-permission-bary-79)).
- **Filling in** a field is editing the issue: `issue.update.own` / `issue.update.any`, like status or labels.

## Demo data

`bun db:seed` creates a workspace-wide text field **Customer** and a select field **Environment** in the first project, answered on a few issues.

## Not decided yet

- Multiple choice, a boolean and a required flag are not in v1; a type is an addition to the tuple and its column mapping.
- Whether a project may hide a workspace-wide field (the way it hides a workspace label): not in v1, see [the screens](#the-screens).
