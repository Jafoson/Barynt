---

title: "Die Bausteine"
description: "Workspaces, Projekte, Aufgaben, Views, Rollen: die Handvoll Begriffe, aus denen Barynt besteht, mit einem Beispiel."
sidebar:
order: 3
---

Barynt kennt nur wenige Ideen, und sie stecken ineinander. Wenn du diese Begriffe einmal kennst, liest sich der Rest dieser Anleitung leicht.

## Das große Bild

Stell dir **Nimbus** vor, eine Firma, die eine Web-App und eine Mobile-App baut. In Barynt sieht das so aus:

- **Nimbus** ist der **Workspace**. Er enthält alles, was die Firma verfolgt, und alle, die dort arbeiten, sind **Mitglieder**.
- **Web App** und **Mobile** sind **Projekte** darin. Jedes hat sein eigenes Board, seine eigenen Zahlen und, falls nötig, seinen eigenen Kreis von Menschen.
- In _Web App_ ist „Login verliert die Sitzung in Safari“ eine **Aufgabe** mit der Nummer `NIM-1`. Sie ist ein _Bug_ mit Priorität _Dringend_, steht auf _In Bearbeitung_ und ist Aisha zugewiesen.

Die fett gesetzten Wörter werden unten erklärt.

## Arbeit

| Begriff          | Was es ist                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workspace**    | Das Zuhause eines Teams. Er hat eigene Mitglieder, Projekte, Teams, Labels, Rollen und Einstellungen. Ein Barynt-Server kann viele Workspaces enthalten, und sie sehen einander nicht.                                    |
| **Projekt**      | Eine Gruppe zusammengehöriger Aufgaben mit einem kurzen Bezeichner wie `NIM`. Projekte können öffentlich sein (jedes Workspace-Mitglied ist dabei) oder privat (nur Menschen, die du hinzufügst).                         |
| **Aufgabe**      | Eine Arbeitseinheit: eine To-do, ein Fehler, eine Idee (englisch _Issue_). Sie hat Titel, Beschreibung, Eigenschaften und eine Diskussion. Ihre Nummer besteht aus dem Projektbezeichner und einem Zähler, etwa `NIM-12`. |
| **Unteraufgabe** | Ein kleineres Stück einer größeren Aufgabe. Die übergeordnete Aufgabe zeigt, wie viele erledigt sind, etwa 2/5.                                                                                                           |
| **Beziehung**    | Eine Verbindung zwischen zwei Aufgaben: _blockiert_, _wird blockiert von_, _verknüpft mit_, _ist Duplikat von_.                                                                                                           |
| **Anhang**       | Eine Datei oder ein Link an einer Aufgabe.                                                                                                                                                                                |
| **Kommentar**    | Eine Nachricht in der Diskussion einer Aufgabe. Andere können antworten und mit einem Emoji reagieren.                                                                                                                    |

## Die Eigenschaften einer Aufgabe

Jede Aufgabe trägt ein paar Eigenschaften, und im ganzen Workspace gilt dieselbe Auswahl, damit Filter und Diagramme überall dasselbe bedeuten.

Der **Status** sagt, wo die Aufgabe steht:

| Status              | Bedeutung                              |
| ------------------- | -------------------------------------- |
| Rückstand (Backlog) | Bekannt, aber noch nicht geplant       |
| Offen (Todo)        | Geplant, nicht begonnen                |
| In Bearbeitung      | Jemand arbeitet daran                  |
| In Überprüfung      | Fertig, wartet auf einen zweiten Blick |
| Erledigt            | Abgeschlossen                          |
| Abgebrochen         | Wird nicht umgesetzt                   |

Die **Priorität** sagt, wie dringend es ist: _Keine Priorität_, _Niedrig_, _Mittel_, _Hoch_, _Dringend_.

Der **Typ** sagt, um welche Art Arbeit es geht: _Feature_, _Bug_, _Improvement_, _Task_ oder _Chore_.

**Labels** sind freie Schlagwörter wie `Frontend`, `Customer` oder `Design`. Sie können zu einem Projekt oder zum ganzen Workspace gehören, und eine Aufgabe kann beliebig viele tragen.

**Zuständig** ist die eine verantwortliche Person. **Fälligkeitsdatum**, **Story Points** und **Zeitschätzung** sind optionale Planungsfelder, die du pro Projekt einschalten kannst.

> [!NOTE]
> Die Status, Prioritäten und Typen oben sind in jedem Workspace dieselben. Labels, Rollen und Teams sind die Teile, die du selbst gestaltest.

## Wege, die Arbeit anzusehen

| Begriff            | Was es ist                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Board**          | Spalten nach Status. Ziehe Karten, um Arbeit voranzubringen.                                                                                                                         |
| **Liste**          | Dieselben Aufgaben als Zeilen, gruppiert und sortiert, wie du magst.                                                                                                                 |
| **View**           | Eine gespeicherte Kombination aus Filtern, Gruppierung, Reihenfolge und Layout, etwa „Offene Bugs“ oder „Diese Woche fällig“. Privat, für ein Projekt oder für den ganzen Workspace. |
| **Dashboard**      | Zahlen und Diagramme für ein Projekt oder den ganzen Workspace. Die Widgets ordnest du selbst an.                                                                                    |
| **Meine Aufgaben** | Alles, was dir zugewiesen ist, über alle Projekte hinweg.                                                                                                                            |
| **Posteingang**    | Was deine Aufmerksamkeit braucht: Zuweisungen, Erwähnungen, Antworten.                                                                                                               |

## Menschen und Zugriff

| Begriff       | Was es ist                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mitglied**  | Ein Mensch mit Zugriff auf einen Workspace.                                                                                                                                  |
| **Team**      | Eine benannte Gruppe von Mitgliedern, zum Beispiel „Mobile-Team“. Teams lassen sich mit Projekten verknüpfen, damit ihre Mitglieder gemeinsam Zugriff bekommen.              |
| **Rolle**     | Ein Bündel von Berechtigungen, etwa _Member_, _Admin_ oder _Viewer_. Rollen gibt es auf drei Ebenen: für den Workspace, für ein einzelnes Projekt und für den ganzen Server. |
| **Plattform** | Der Server selbst. Eine **Plattform-Administration** kümmert sich um Konten, Workspaces und serverweite Einstellungen, kann aber niemandes Aufgaben lesen.                   |

Die Idee hinter den Rollen ist einfach: Deine **Workspace-Rolle** sagt, was du im Workspace selbst darfst, und deine **Projektrolle** sagt, was du innerhalb eines Projekts darfst. Mehr dazu unter [Rollen und Berechtigungen](../administration/roles.md).

## Wo was liegt

Wenn du dich verlaufen hast, hilft diese Karte:

- Die **Seitenleiste** links: Dashboard, Board und deine Aufgaben, darunter deine Projekte, dann Mitglieder, Teams und Workspace Einstellungen. Dein Name ganz unten öffnet deine persönlichen Einstellungen.
- Die **Tabs** oben in jedem Projekt: Board, Liste, Dashboard und deine gespeicherten Views.
- **`⌘K` / `Strg+K`** von überall: Aufgaben, Projekte und Seiten suchen oder einen Befehl ausführen.
