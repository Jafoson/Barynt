---
title: "Mitwirken"
description: "Barynt auf dem eigenen Rechner laufen lassen, etwas ändern und zurückschicken. Für Entwickler, Übersetzerinnen und alle, die einen Tippfehler finden."
sidebar:
  order: 1
---

Barynt ist Open Source (MIT) und freut sich über Beiträge: ein korrigierter Tippfehler, ein besserer Satz in dieser Doku, eine Übersetzung, eine Fehlerbehebung oder ein Feature. Diese Seite bringt dich von null zu einem Pull Request.

## Helfen ohne Code

- **Melde einen Fehler oder eine Idee** als Issue auf [GitHub](https://github.com/Jafoson/Barynt/issues). Sag, was du getan hast, was du erwartet hast und was passiert ist. Ein Screenshot hilft.
- **Verbessere diese Doku.** Jede Seite hat unten einen Link **Seite bearbeiten**, der die Datei auf GitHub öffnet. Korrigiere, was falsch oder unklar ist, und schlage die Änderung vor. Siehe [Die Doku schreiben](#die-doku-schreiben) unten.
- **Übersetze.** Die App spricht Englisch und Deutsch, und diese Doku auch. Ein fehlender oder holpriger deutscher Satz ist ein guter erster Beitrag.

## Lokal laufen lassen

Du brauchst [Bun](https://bun.sh) 1.3 oder neuer und [Docker](https://www.docker.com) (für die Datenbank).

```bash
git clone https://github.com/Jafoson/Barynt.git
cd Barynt
bun install
cp example.env .env          # dann ein Secret in AUTH_SECRET eintragen: bunx auth secret
bun run db:dev               # startet Postgres und Redis, migriert und füllt Demodaten ein
bun run dev                  # http://localhost:3000
```

Die Demodaten sind eine Firma namens Nimbus mit ein paar Projekten, Aufgaben und Menschen, du hast also gleich etwas zum Durchklicken. Passkeys funktionieren auf `localhost` ohne weitere Einrichtung.

| Befehl | Was er tut |
| --- | --- |
| `bun run dev` | Der Entwicklungsserver |
| `bun run lint`, `bun run format` | Den Code prüfen und formatieren (Biome) |
| `bun run test` | Die komplette Testsuite |
| `bun run db:reset` | Die Datenbank wegwerfen und von vorn beginnen |

## Die Form des Codes

- **Next.js 16 und React 19**, TypeScript, PostgreSQL mit Prisma. Styles sind SCSS-Module, kein Tailwind.
- Seiten sind standardmäßig **Server-Komponenten**. Änderungen laufen über **Server-Funktionen**, nicht über API-Routen.
- Jede Feature-Komponente ist geteilt in den Teil, der Daten lädt, und den Teil, der sie zeichnet.
- Die ausführlichen Konventionen stehen in `CLAUDE.md` im Stammverzeichnis des Repositorys: Architektur, Styling, Rich Text, Icons, E-Mail, der Datenbank-Ablauf und das Testen. Lies sie vor einer größeren Änderung.

> [!WARNING]
> Führe die Tests immer mit `bun run test` aus, nicht mit `bun test`. Die Suite ist absichtlich in mehrere isolierte Prozesse aufgeteilt, weil manche Tests Module ersetzen, die andere echt testen. `CLAUDE.md` erklärt, warum.

## Eine Änderung einreichen

1. Lege einen Branch von `main` an.
2. Mach die Änderung. Berührst du `prisma/schema.prisma`, füge eine Migration hinzu (`bun prisma migrate dev --name was-es-tut`) und prüfe, dass das Seed weiterläuft.
3. Führe `bun run lint`, `bun run format` und `bun run test` aus.
4. Nutze **Conventional Commits** für deine Nachrichten: `fix(board): keep the card order after a refresh`. Der Typ (`fix`, `feat`, `docs`, …) entscheidet, wie die nächste Versionsnummer gewählt wird und was in den Release Notes steht.
5. Öffne einen Pull Request und beschreibe, was sich geändert hat und warum.

## Die Doku schreiben

Diese Seiten sind Markdown-Dateien in `docs/guide/` des Repositorys. Ein Feature, das ändert, was Nutzer sehen oder tun, sollte seine Seite **im selben Pull Request** aktualisieren.

- Eine Datei pro Seite, in einem Ordner pro Gruppe: `using-barynt/views.md`. Die deutsche Seite hat denselben Pfad unter `de/`.
- Der Kopf (Front Matter) enthält `title`, eine `description` in einem Satz und `sidebar.order`.
- Schreibe für Menschen, die nicht programmieren: Teamleitungen, Produktleute, Administratoren. Kurze Sätze, konkrete Beispiele und die Wörter, die die App selbst benutzt.
- Hinweisboxen nutzen GitHubs `> [!NOTE]`, `> [!TIP]` und `> [!WARNING]`. Links zwischen Seiten sind relative `.md`-Links.
- Screenshots kommen in `docs/guide/assets/`. Englische Seiten nutzen `assets/en/`, deutsche `assets/de/`; Screenshots werden im Dark Mode aufgenommen. Der Test `tests/unit/docs` prüft, dass Links und Bilder existieren.

`docs/guide/README.md` hat die vollständige Anleitung, auch dazu, wie du deine Änderungen auf der echten Seite vorab ansiehst.
