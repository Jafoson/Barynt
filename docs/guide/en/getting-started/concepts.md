---
title: "The building blocks"
description: "Workspaces, projects, issues, views, roles: the handful of words Barynt is built from, with an example."
sidebar:
  order: 3
---

Barynt has only a few ideas, and they fit inside each other. Learn these words once and the rest of the guide reads easily.

## The big picture

Imagine **Nimbus**, a company building a web app and a mobile app. In Barynt that looks like this:

- **Nimbus** is the **workspace**. It holds everything the company tracks, and everyone who works there is a **member**.
- **Web App** and **Mobile** are **projects** inside it. Each has its own board, its own numbers and, if needed, its own circle of people.
- Inside _Web App_, "Login drops the session on Safari" is an **issue** with the number `NIM-1`. It is a _Bug_ of _Urgent_ priority, it is _In Progress_, and it is assigned to Aisha.

The words in bold are explained below.

## Work

| Word | What it is |
| --- | --- |
| **Workspace** | The home of a team. It has its own members, projects, teams, labels, roles and settings. One Barynt server can hold many workspaces, and they cannot see each other. |
| **Project** | A group of related issues, with a short identifier such as `NIM`. Projects can be public (every workspace member is in) or private (only people you add). |
| **Issue** | One unit of work: a task, a bug, an idea. It has a title, a description, properties and a discussion. Its number is the project identifier plus a counter, like `NIM-12`. |
| **Sub-issue** | A smaller piece of a bigger issue. The parent shows how many are done, like 2/5. |
| **Relation** | A link between two issues: _blocks_, _is blocked by_, _relates to_, _is a duplicate of_. |
| **Attachment** | A file or a link on an issue. |
| **Comment** | A message in an issue's discussion. Others can reply to it and react with an emoji. |

## The properties of an issue

Every issue carries a few properties, and the same set is used across the workspace so that filters and charts mean the same thing everywhere.

**Status** says where the issue stands:

| Status | Meaning |
| --- | --- |
| Backlog | Known, but not planned yet |
| Todo | Planned, not started |
| In Progress | Someone is on it |
| In Review | Done, waiting for a second look |
| Done | Finished |
| Canceled | Will not be done |

**Priority** says how urgent it is: _No priority_, _Low_, _Medium_, _High_, _Urgent_.

**Type** says what kind of work it is: _Feature_, _Bug_, _Improvement_, _Task_ or _Chore_.

**Labels** are free tags such as `Frontend`, `Customer` or `Design`. They can belong to one project or to the whole workspace, and an issue can have as many as it needs.

**Assignee** is the one person responsible. **Due date**, **story points** and **time estimate** are optional planning fields, which you can switch on per project.

> [!NOTE]
> The statuses, priorities and types above are the same in every workspace. Labels, roles and teams are the parts you shape yourself.

## Ways to look at the work

| Word | What it is |
| --- | --- |
| **Board** | Columns by status. Drag cards to move work forward. |
| **List** | The same issues as rows, grouped and sorted as you like. |
| **View** | A saved combination of filters, grouping, order and layout, such as "Open bugs" or "Due this week". Private, for a project, or for the whole workspace. |
| **Dashboard** | Numbers and charts for a project or the whole workspace. You arrange the widgets. |
| **My issues** | Everything assigned to you, across all projects. |
| **Inbox** | The things that need your attention: assignments, mentions, replies. |

## People and access

| Word | What it is |
| --- | --- |
| **Member** | A person with access to a workspace. |
| **Team** | A named group of members, for example "Mobile team". Teams can be linked to projects so that their members get access together. |
| **Role** | A bundle of permissions, such as _Member_, _Admin_ or _Viewer_. Roles exist at three levels: for the workspace, for a single project and for the whole server. |
| **Platform** | The server itself. A **platform administrator** looks after accounts, workspaces and server-wide settings, but cannot read anyone's issues. |

The idea behind roles is simple: your **workspace role** says what you may do in the workspace itself, and your **project role** says what you may do inside one project. Read more in [Roles and permissions](../administration/roles.md).

## Where things live

When you are lost, this map helps:

- The **sidebar** on the left: dashboard, board and your issues, then your projects, then members, teams and workspace settings. Your name at the bottom opens your personal settings.
- The **tabs** at the top of each project: Board, List, Dashboard and your saved views.
- **`⌘K` / `Ctrl+K`** from anywhere: search issues, projects and pages, or run a command.
