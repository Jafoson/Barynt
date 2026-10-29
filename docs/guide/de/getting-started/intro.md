---
title: "Einführung"
description: "In Barynt plant dein Team seine Arbeit: jede Aufgabe, jeder Fehler und jede Idee an einem Ort, auf einem Server, den du selbst kontrollierst."
sidebar:
  order: 1
---

![Das Barynt-Dashboard eines Workspace](../../assets/overview.webp)

## Was ist Barynt?

Barynt ist ein Issue-Tracker. Einfach gesagt: eine gemeinsame To-do-Liste für ein ganzes Team, gebaut für Arbeit mit vielen Beteiligten und vielen beweglichen Teilen. Jede Aufgabe, jede Fehlermeldung und jede Idee wird zu einer **Aufgabe** (im Englischen _Issue_), die jemandem gehört, verschiedene Stufen durchläuft (_Offen_, _In Bearbeitung_, _Erledigt_) und ihre ganze Geschichte behält: die Diskussion, die Dateien, wer wann was geändert hat.

Wenn du Jira, Linear oder Trello kennst, findest du dich schnell zurecht. Der Unterschied: Barynt läuft auf **deinem eigenen Server**. Deine Daten bleiben bei dir, es gibt keinen Preis pro Person, und der Code ist Open Source (MIT).

## Für wen ist Barynt?

- **Teamleitungen und Führungskräfte** sehen, wo es steht, ohne herumzufragen: Dashboards zeigen, was offen und überfällig ist und wo sich Arbeit staut.
- **Produktverantwortliche** sammeln Ideen und Fehler, sortieren sie und machen daraus einen Plan, dem das Team auf einem Board folgen kann.
- **Alle, die die Arbeit machen,** bekommen eine klare Liste dessen, was ihnen gehört, eine tastaturfreundliche Oberfläche und einen Posteingang, der sagt, wann etwas von ihnen gebraucht wird.
- **Wer den Server betreibt,** bekommt einen einfachen Installer, Anmeldung mit dem Firmen-Login und ein klares Protokoll, wer was getan hat.

Du musst kein Entwickler sein, um Barynt zu benutzen. Technisch ist nur die Einrichtung (und der Bereich [Integrationen](../integrations/api.md)).

## Was du damit machen kannst

- **Arbeit festhalten.** Schreibe Aufgaben mit formatiertem Text, Checklisten, Bildern und Dateien. Zerlege große in Unteraufgaben und verknüpfe zusammengehörige.
- **Sie so sehen, wie du sie brauchst.** Zeige dieselben Aufgaben als Board, als Liste oder als gespeicherte View mit eigenen Filtern: „meine offenen Fehler“, „alles, was diese Woche fällig ist“.
- **Den Fortschritt verfolgen.** Jedes Projekt hat ein Dashboard mit Zahlen und Diagrammen, die du selbst anordnen kannst.
- **Festlegen, wer was darf.** Gib Menschen Rollen von „darf nur lesen und kommentieren“ bis „leitet den Workspace“ oder baue eigene Rollen.
- **Auf dem Laufenden bleiben.** Ein Posteingang sagt dir, wenn dir etwas zugewiesen wird, du erwähnt wirst oder jemand antwortet, auf Wunsch auch per E-Mail.
- **Andere Werkzeuge anbinden.** Lass deinen KI-Assistenten Aufgaben anlegen und ändern oder verbinde Skripte und andere Systeme.

## So ist diese Anleitung aufgebaut

| Wenn du … willst | Fang hier an |
| --- | --- |
| Barynt in den ersten zehn Minuten ausprobieren | [Erste Schritte](first-steps.md) |
| Die Begriffe verstehen, die Barynt benutzt | [Die Bausteine](concepts.md) |
| Täglich mit Aufgaben arbeiten | [Barynt benutzen](../using-barynt/issues.md) |
| Menschen einladen und Zugriff festlegen | [Verwaltung](../administration/members.md) |
| Barynt auf einem Server einrichten | [Installation](install.md) |
| Einen KI-Assistenten oder ein anderes Werkzeug verbinden | [Integrationen](../integrations/mcp.md) |

> [!TIP]
> Den Server einzurichten ist eine einmalige Aufgabe und gehört meist zur IT. Alle anderen können [Installation](install.md) überspringen und gleich zu den [Ersten Schritten](first-steps.md) gehen.

## Wie es läuft (für Neugierige)

Barynt ist eine einzelne Webanwendung plus eine PostgreSQL-Datenbank. Zwei optionale Extras machen es angenehmer: Redis (begrenzt, wie oft die API aufgerufen werden darf) und S3-kompatibler Speicher (für Avatare und Anhänge). Der Installer richtet alles auf einem Server ein, samt HTTPS, in etwa fünf Minuten. Für größere Umgebungen gibt es ein [Kubernetes-Chart](helm.md).
