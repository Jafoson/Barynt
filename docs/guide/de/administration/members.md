---
title: "Mitglieder und Einladungen"
description: "Hol Menschen in einen Workspace oder in ein einzelnes Projekt: per E-Mail, mit einem Link oder automatisch über die Firmen-Domain. Rollen ändern und Menschen entfernen."
sidebar:
  order: 2
---

Ein **Mitglied** ist ein Mensch mit Zugriff auf einen Workspace. Diese Seite behandelt die drei Wege, Menschen hinzuzufügen, wie du sie änderst oder entfernst und wie du jemanden von außen für nur ein Projekt hereinholst.

![Die Mitglieder eines Workspace](../../assets/members.webp)

## Die Mitgliederliste

Öffne **Mitglieder** in der Seitenleiste. Du siehst alle im Workspace mit ihrer **Rolle**, ihren **Teams** und ihrem Status (_Aktiv_ oder _Eingeladen_ für Menschen, die noch nicht angenommen haben). Die Rolle einer Person änderst du direkt in der Liste, und entfernen kannst du sie mit der Schaltfläche am Zeilenende. Was du tun kannst, hängt von deiner eigenen Rolle ab, siehe [Rollen und Berechtigungen](roles.md).

## Wege, Menschen hinzuzufügen

### 1. Per E-Mail einladen

Klicke auf **Mitglied einladen**, trage eine oder mehrere Adressen ein (getrennt durch Komma oder Zeilenumbruch), wähle eine **Rolle** und sende ab.

![Der Einladungs-Dialog](../../assets/invite.webp)

Was dann passiert, hängt von der Adresse ab:

- Hat die Person **schon ein Konto** auf diesem Server, wird sie sofort hinzugefügt. Sie bekommt eine Benachrichtigung, mehr ist nicht nötig.
- Ist die Adresse **neu**, legt Barynt eine Einladung an. Die Person bekommt eine E-Mail mit einem Link. Ein Klick darauf richtet ihren Zugang ein, und sie ist drin. Die Einladung gilt **14 Tage**.

Nach dem Absenden sagt dir Barynt für jede Adresse, was passiert ist: _Ist jetzt dabei_, _Einladung per Mail verschickt_ oder, wenn kein Mailserver eingerichtet ist, _Kein Mailversand eingerichtet — Link kopieren_ mit einer Schaltfläche zum Kopieren.

> [!WARNING]
> Eine Einladung für eine **neue** Person wird über einen Anmelde-Link angenommen, der per E-Mail kommt. Hat dein Server keine [Mail-Einrichtung](email.md), lassen sich solche Einladungen nicht annehmen. Nutze stattdessen einen **Einladungslink** (unten): Er funktioniert ohne E-Mail.

Neue Mitglieder kommen automatisch in alle **öffentlichen Projekte** des Workspace, mit einer Start-Projektrolle, die zu ihrer Workspace-Rolle passt.

### 2. Ein Einladungslink für alle

Erzeuge unter _Workspace Einstellungen → Einladungen_ einen **Einladungslink**: Wähle die Rolle und wie lange er gilt (nie oder eine Anzahl Tage) und klicke auf **Link erzeugen**. Jeder, der ihn öffnet, kann sich anmelden oder ein Konto anlegen und tritt mit dieser Rolle bei. Er eignet sich für einen Team-Chat oder eine Rundmail. **Widerrufen** stoppt ihn jederzeit.

![Einladungen und der Einladungslink](../../assets/invitations.webp)

Es ist immer nur ein Link pro Workspace aktiv: Ein neuer ersetzt den alten. Nimm für einen Link, den viele sehen, eine eingeschränkte Rolle (_Member_ oder _Viewer_).

### 3. Automatisch über die Firmen-Domain

Haben alle in deiner Firma eine Adresse auf derselben Domain, kann der Workspace sie **beanspruchen**. Wer sich mit so einer Adresse registriert, tritt automatisch als Member bei. Das richtest du unter _Workspace Einstellungen → Allgemein_ ein, siehe [Workspace-Einstellungen](workspace.md).

## Offene Einladungen

_Workspace Einstellungen → Einladungen_ listet auch alle, die eingeladen wurden, aber noch nicht angenommen haben: die Adresse, wer eingeladen hat, wann und wann sie abläuft. Für jede kannst du:

- **Erneut senden:** erzeugt einen neuen Link und neue 14 Tage.
- **Zurückziehen:** Der Link wird ungültig. Entstand das Konto nur für diese Einladung, wird es ebenfalls entfernt.

## Ändern und entfernen

- **Eine Rolle ändern:** Wähle in der Spalte _Rolle_ eine andere. Du kannst Rollen nur bis zu deinem eigenen Rang vergeben.
- **Jemanden entfernen:** Klicke auf die Entfernen-Schaltfläche der Zeile. Barynt zeigt, in wie vielen Projekten die Person aktiv ist, und lässt dich bestätigen. Sie verliert den Zugriff auf den Workspace und alle seine Projekte und wird per E-Mail informiert (wenn Mail eingerichtet ist). Ihre bisherige Arbeit bleibt: Aufgaben, Kommentare und Verlauf bleiben, wie sie waren.
- Konten von Menschen, die die Firma verlassen haben, kann außerdem eine Plattform-Administration **deaktivieren**, siehe [Plattform-Verwaltung](platform.md).

## Jemanden nur in ein Projekt einladen

Manchmal soll ein Kunde oder eine Freelancerin **ein** Projekt sehen und sonst nichts.

1. Öffne die Seite **Mitglieder** des Projekts und klicke auf **Mitglied hinzufügen**.
2. Wähle den Tab **Per E-Mail**, gib die Adresse ein und wähle die Projektrolle. Für Menschen von außen wähle **Guest**.
3. Sende ab.

Ein **Guest** wird nur dem Projekt hinzugefügt. Er ist **kein** Mitglied des Workspace und sieht sonst nichts. Jede andere Projektrolle fügt die Person zusätzlich als normales Mitglied dem Workspace hinzu, samt seiner öffentlichen Projekte.

Der andere Tab desselben Dialogs, **Aus dem Workspace**, fügt Menschen hinzu, die schon Mitglieder des Workspace sind. So füllst du ein **privates** Projekt. Auch die Seite _Einladungen_ des Projekts hat einen Einladungslink, der eine gewählte Projektrolle vergibt.

Mehr zur Projekt-Mitgliedschaft unter [Projekteinstellungen](project-settings.md).

## Teams

Statt Menschen einzeln hinzuzufügen, kannst du sie in ein [Team](teams.md) stecken und dem Team eine Rolle in einem Projekt geben.
