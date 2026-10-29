---
title: "Einführung"
description: "Barynt ist ein Issue-Tracker, den du selbst betreibst. Workspaces enthalten Projekte, Projekte enthalten Issues, und Status, Prioritäten, Issue-Typen, Labels und Rollen lassen sich pro Workspace einstellen."
sidebar:
  order: 1
---

![Workspace-Übersicht](../../assets/overview.webp)

## Was du bekommst

- Issues mit Rich Text, Unteraufgaben, Beziehungen und Anhängen
- Board-, Listen- und Dashboard-Ansichten, gespeichert und geteilt
- Rollenbasierter Zugriff über Plattform, Workspace und Projekt
- Ein Posteingang in der App, optional mit E-Mail pro Ereignis
- Eine REST-API, Webhooks und ein Remote-MCP-Server

## Wie es läuft

Eine Next.js-App und PostgreSQL. Redis (Rate Limiting) und S3-kompatibler Speicher (Avatare, Anhänge) sind optional. Die mitgelieferte Compose-Datei bringt RustFS und Caddy mit.

> [!NOTE]
> Neu hier? [Der Installer](install.md) bringt dir mit einem einzigen Befehl eine laufende Instanz auf einen Server.

## Nächste Schritte

- [**Installation**](install.md) — Eine Zeile auf einem Linux-Server
- [**KI verbinden**](../integrations/mcp.md) — MCP für Claude & Co.
