# Ergebnis

## Auftrag 4 (11.10.2026)

**Neue Version ist in der Test-App: https://stamio-test.pages.dev** (Version 2.1.0). Die echte App ist unverändert.
**Was du jetzt tun musst:** [FUER-JONAH.md](FUER-JONAH.md) – zuerst die Server-Schlüssel für die Verbindungen, dann Papa den Einladungscode geben (steht in `ZUGANG.local.md`).

**Was beim ersten Test schiefging:** Papa hat die App nur auf seinem iPhone benutzt, ohne Konto auf dem Server (in der Test-Datenbank sind nur deine zwei PCs). Dort standen deine Werte als Standard im Code, und ohne Server-Konto und ohne App-Schlüssel der Anbieter konnte er nichts verbinden. Beides ist behoben bzw. vorbereitet.

**Geprüft:** 260 Unit- und Server-Tests, 36 E2E-Tests auf iPhone-Breite in Chromium und WebKit (2 Server-Abläufe laufen nur einmal in Chromium), alle grün. Fünf erfundene Test-Personen laufen automatisch durch den ganzen Fragebogen und die ersten 4 Planwochen, jeder Plan wird auf alle Regeln aus C4 geprüft. Live-Test nach dem Deploy: App lädt ohne Fehler, neuer Fragebogen ist online, Datenbank-Erweiterung (nur neue Tabelle und Spalten) ist angewendet.

| Punkt | Stand | Was |
|---|---|---|
| **A1** Fremde Werte | erledigt | Keine Werte einer Person mehr im Code; Schwellen werden aus Alter und Bestzeit geschätzt, als „geschätzt“ markiert, mit Test-Vorschlag; alte Werte auf fremden Geräten werden einmalig ersetzt; Nutzerwechsel und „Abmelden und Gerät freimachen“ löschen lokale Daten; Tests mit zwei Nutzern auf Server und Gerät. |
| **A2** Verbindungen | teilweise | Ursache je Dienst in VERBINDUNGEN.md (fehlende Server-Schlüssel, Fragebogen-Knopf ohne Rückweg, kein Server-Konto); Code repariert, jeder Knopf verbindet oder erklärt mit Alternative; Garmin, COROS, Suunto, Wahoo über intervals.icu in 3 Schritten; Status der Schlüssel in der App und per Skript; alle OAuth-Abläufe mit simulierten Anbietern getestet. **Offen:** die App-Schlüssel anlegen kannst nur du (FUER-JONAH.md 1). |
| **A3** Verbinden im Fragebogen | erledigt | Gleiche Abläufe direkt im Fragebogen, nach dem Erlaubnis-Bildschirm zurück an dieselbe Stelle, Antworten bleiben (E2E-Test). |
| **A4** Mehrere Ziele | erledigt | A-Ziel bestimmt die Phasen, B mit 4 Tagen ruhiger davor und 3 Tagen locker danach, C als Training; Umfang je Sportart nach Priorität und Abstand; Wochenkopf „Woche 3 von 10 → Halbmarathon, mit 10-km-Rennen am Samstag“. |
| **A5** Kraft | erledigt | Fehler war: Kraft bekam nur 8 % des Wochenumfangs und fiel unter 20 Minuten ganz weg (bei Papa mit vorsichtigem Start ab 50 genau so); die gewählte Häufigkeit (2×) wurde ignoriert. Jetzt mit gewählter Häufigkeit, konkreten Übungen mit Sätzen und Wiederholungen je Sportart, nie vor harten Tagen, in Erholungswochen leichter. |
| **A6** Distanz und Text | erledigt | Titel, Dauer, Distanz und Beschreibung kommen aus denselben Bausteinen; automatischer Test prüft jede Einheit aller Test-Personen (Serien, Gesamt, Pace × Distanz). |
| **A7** Zeit eintragen | erledigt | Überall getrennte Felder Min/Sek bzw. Std/Min/Sek mit Zahlentastatur (Einstellungen, Fragebogen, Einheit, Ziele, Wettkampf), E2E-Test in WebKit. |
| **B1** Tage statt Uhrzeiten | erledigt | Pro Tag frei/kurz/mittel/lang, dazu morgens/abends für die Mitteilungen. |
| **B2** Wie oft pro Sportart | erledigt | Stepper je Sportart mit Anzeige der verfügbaren Tage; der Plan hält sich daran (geprüft). |
| **B3** Teamsport | erledigt | Sportart, Trainings- und Spieltage, Dauer, Saison; Spieltage hart, davor nichts Hartes; ohne Teamsport nirgends „Fußball“ oder „Spieltag“ (auch nicht bei Essen und Extra-Einheit). |
| **B4** Wunschzeiten | erledigt | Pro Ziel eigene Wunschzeit, Triathlon gesamt oder je Disziplin; sofortiger Hinweis, ob realistisch, sonst eine Spanne. |
| **B5** Können | erledigt | Kraulen ja/etwas/nein mit Metern, Brust, Laufen am Stück, längste Radfahrt, freies Feld für Berücksichtigungen. |
| **B6** Räder | erledigt | 8 Rad-Typen; Intervalle auf der Rolle, lockere Fahrten draußen mit dem passenden Rad. |
| **C1** Plan nach Können | erledigt | Kraul-Lernweg (8 Stufen), Brust plus Kraul-Technik, Lauf-Geh-Wechsel (8 Stufen); eine Stufe weiter nur, wenn die Daten zeigen, dass die letzte geklappt hat. |
| **C2** Beschreibungen | erledigt | Jede Einheit: was (Aufwärmen, Hauptteil, Ausklang), wie hart (eigene Zonen, Pace, Gefühl), warum, worauf achten. |
| **C3** Berücksichtigungen | erledigt | Eigener Bereich unter „Mehr“; Notizen werden Kategorien zugeordnet (Knie, Schwimmbad-Tage, kein Schwimmbad im Winter …), Unverstandenes steht als „noch nicht berücksichtigt“ da; kommende Wochen werden automatisch angepasst, mit Begründung im Coach. |
| **C4** Regelprüfung | erledigt | Alle 8 Regeln automatisch für alle 5 Test-Personen geprüft. |
| **C5** Plan bearbeiten | erledigt | Verschieben („Auf Tag …“), ändern, löschen, hinzufügen, Tage tauschen, Woche leichter/schwerer, „fest“ markieren, freundliche Warnung mit „Trotzdem übernehmen“, Rückgängig und Original. Ziehen mit dem Finger ist nicht gebaut. |
| **D1** Claude entfernt | erledigt | „Mit Claude besprechen“, Teilen-Menü und Zusammenfassung sind weg. |
| **D2** Freies Schreiben | erledigt | 46 Absichten mit vielen Formulierungen und Tippfehler-Toleranz, Antworten mit echten Daten, Aktionen erst nach Bestätigung, ehrliche Antwort mit Vorschlägen bei Unbekanntem; mit KI-Schlüssel übernimmt später der KI-Coach in derselben Oberfläche; Kosten in SPAETER.md. |
| **E1** Essen | erledigt | Tagestypen aus dem eigenen Plan (Ruhetag, Training, lang/hart, Wettkampftag); Spieltag nur mit Teamsport. |
| **F1** Fehler melden | erledigt | Unter „Mehr“ (und auf dem Startbildschirm), schickt letzte Bildschirme, Version, Gerät und letzte Fehler mit, keine Gesundheitsdaten; du siehst alle Meldungen als Liste. |
| **F2** Zusammenfassung | erledigt | „Das habe ich verstanden“ mit „Ändern“ je Punkt, erst danach wird der Plan gebaut. |
| **F3** Plan erklären | erledigt | Oben im Plan: Phasen bis zum Ziel, warum welche Sportart wie oft, was diese Woche wichtig ist. |
| **F4** Test-Nutzer | erledigt | Anlegen (Einladung), Zurücksetzen (Geräte starten neu mit dem Fragebogen), Löschen. Für Papa ist ein Test-Zugang angelegt. |
| **F5** Kein fremder Plan | erledigt | Neue Nutzer starten ohne Plan, Meilensteine, Krankheiten oder Notizen eines anderen (Server-Test und E2E-Test). |
| Deploy und Papa | erledigt | Neue Version in der Test-App; Papa hatte kein Server-Konto, deshalb gibt es statt „Zurücksetzen“ einen neuen Test-Zugang, mit dem er frisch startet. |

**Ehrlich offen:**
- Die App-Schlüssel für Oura, Dropbox, WHOOP, Polar und Withings fehlen, bis du sie anlegst. Bis dahin gehen Apple Health (Kurzbefehl), Datei-Import und intervals.icu (auch für Garmin & Co.).
- Echte Anmeldungen bei den Anbietern habe ich nicht gemacht, nur mit simulierten Anbietern getestet.
- Dein eigener Plan auf dem Server ist der alte Block-1-Plan. Er funktioniert weiter; die neuen Beschreibungen und Lernstufen bekommt er erst, wenn du den Fragebogen neu durchläufst oder unter „Berücksichtigungen“ etwas änderst.
- Neue Texte gibt es nur auf Deutsch (Englisch fällt wie bisher auf Deutsch zurück).
- Immer noch nichts zu GitHub gepusht: alles liegt lokal auf dem Branch `entwicklung` (jetzt 31 Commits).

Weitere Dokumente: [VERBINDUNGEN.md](VERBINDUNGEN.md) · [ENTSCHEIDUNGEN.md](ENTSCHEIDUNGEN.md) (Nr. 32-49) · [SPAETER.md](SPAETER.md) (KI-Chat-Kosten)

---

## Auftrag 2 und 3

**Test-App: https://stamio-test.pages.dev** – eigene Testumgebung (eigener Worker, eigene Datenbank). Die echte App ist unverändert.
**Was du jetzt tun musst:** [FUER-JONAH.md](FUER-JONAH.md) (Pflicht ca. 45 min). Wenn dir die Test-App gefällt: **„Freigeben“** sagen, dann stellt Claude nach [scripts/release.md](scripts/release.md) um.

### Neu

**Grundlage (Auftrag 2 A/B)**
- Neuer Name **Stamio** mit Icon und Startbildern. „Ironman“ steht nirgends mehr in der App (Test prüft das). Namensliste: NAMEN.md.
- Vite + TypeScript, gemeinsame Logik in `shared/` für App und Server, schlankes Fehlerprotokoll ohne Gesundheitsdaten.
- 144 Unit- und Server-Tests, 22 E2E-Tests auf iPhone-Breite (Chromium und WebKit). GitHub Actions: Tests bei jedem Push, Deploy nur aus `main`, wenn grün.

**Neue Oberfläche (2 C)** – Details und Vorher/Nachher in [DESIGN.md](DESIGN.md)
- 5 Tabs: **Heute, Plan, Coach, Fortschritt, Mehr**. Heute beantwortet „Wie geht es mir, was mache ich?“ ohne Tippen; Abhaken mit 1 Tipp.
- Heute ist halb so lang wie vorher (995 statt 2062 px), keine Eingabefelder mehr. Einen Wert korrigieren: 2 statt 4 Tipps.
- Hell und dunkel, zweite Heute-Variante (Feed) wählbar.

**Mehrere Nutzer, Profil, Ziele, Plan-Generator (2 D)**
- Jeder Nutzer hat eigene Daten; neue Nutzer nur per Einladungscode (unter Mehr → Daten und Geräte).
- Profil statt fester Werte im Code, beliebig viele Ziele (5 km bis Langdistanz, Duathlon, Rad-Event, Fitness …) mit Priorität A/B/C.
- Regelbasierter Plan-Generator mit Phasen, Erholungswochen, festen Terminen und Sicherheitsregeln (nur in der Testumgebung sichtbar).
- Fragebogen für neue Nutzer: 8 Teile, Fortschritt, überspringbar, Vorbefüllung aus Daten, am Ende Plan mit Zusammenfassung in 5 Sätzen.
- Texte zentral auf Deutsch, Englisch vorbereitet; metrisch/imperial.

**Verbindungen (2 E)** – Übersicht in [VERBINDUNGEN.md](VERBINDUNGEN.md)
- Apple Health per Kurzbefehl (widerrufbarer Schlüssel), HealthFit über Dropbox oder Datei, Datei-Import (.fit/.gpx/.tcx), intervals.icu, Oura, WHOOP, Polar, Withings. Fitbit/HealthKit vorbereitet, Garmin & Co. als „Partner nötig“.
- Quelle bei jedem Wert, von Hand Eingetragenes bleibt („Auf Original zurücksetzen“), Dubletten ±30 min, automatisches Abhaken, Hinweis bei „neu verbinden“.

**Leistung aus Messdaten (2 F)**
- Gut/Okay/Schlecht ist weg. Scores 0–100 je Sportart aus Pace, Leistung, Puls und Umfang relativ zum Ziel, 6-Wochen-Trend und „Warum?“. Korrektur nur unter Einstellungen.
- Steigerungsleiter entscheidet aus Messdaten (Wiederholungen, Pulsanstieg, Erholung).

**Coach (Auftrag 3 A)**
- Kostenloser Coach: Morgen-Briefing, Kommentar nach jeder Einheit, Sonntags-Rückblick, Planänderungen mit Grund und Rückgängig, Schnellfragen, „Mit Claude besprechen“ (Zusammenfassung ohne Oura-Daten), Plan-Code mit Prüfung und Vorschau ([PLAN-FORMAT.md](PLAN-FORMAT.md)), Notizen.
- KI-Coach fertig gebaut, aber aus: Regeln stehen über der KI, Budget, Tageslimit, Kostenanzeige, Einwilligung (unter 18 mit Eltern, von App und Server geprüft). 37 + 19 Testfälle.

**Weitere Teile (3 B–F)**
- Fragebogen (B), Essen mit Tageszielen, Foto-Schätzung vorbereitet bzw. Teilen an die Claude-App, keine Gewichtsziele unter 18 (C), Prognose mit Spannen und Triathlon-Wechseln (D), Wettkampf-Modus 14 Tage vorher bis 10 Tage danach (E), [STORE-PLAN.md](STORE-PLAN.md) (F, nur Bericht).

**Nachtrag (deine Wünsche)**
- **Betreiber-Konto mit allem:** Du (Nutzer 1, mit dem Einrichtungscode) hast immer KI-Coach, Essens-Foto und Plan-Generator. Andere Nutzer haben sie erst, wenn du sie unter Daten und Geräte freischaltest – später per Kauf im Store (STORE-PLAN.md). Der Server prüft das bei jedem Aufruf.
- **KI-Coach ab 16** mit eigener Einwilligung; unter 16 zusätzlich Eltern.
- **Du musst den Fragebogen nicht ausfüllen:** erst Daten kopieren (FUER-JONAH 1), dann mit dem Einrichtungscode verbinden.

### Was fehlt oder offen ist (ehrlich)
- **Echte Daten nicht in der Testumgebung.** Mein Lesezugriff auf die echte Datenbank wurde abgelehnt; ich habe das nicht umgangen. Die Testumgebung ist leer. Kopieren: Schritt 1 in FUER-JONAH.md (testet dabei auch die Datenbank-Umstellung an der Kopie).
- **Nichts zu GitHub gepusht.** Alles liegt lokal auf dem Branch `entwicklung` (18 Commits). Die GitHub-CI ist daher noch nicht gelaufen; lokal laufen alle Schritte grün.
- **E2E gegen die Live-Test-Adresse** habe ich nicht automatisiert, nur von Hand geprüft (App lädt, Server antwortet, Einrichtung ohne Code wird abgelehnt). Die E2E-Tests laufen gegen denselben Code lokal.
- **Dienste ohne App-Schlüssel:** Oura, Dropbox, WHOOP, Polar, Withings zeigen „auf dem Server noch nicht eingerichtet“, bis du die Entwickler-Apps anlegst (FUER-JONAH.md 7–9).
- **KI-Coach und Essens-Foto** sind aus (kein API-Schlüssel, kostet Geld – SPAETER.md).
- **HealthKit direkt, Fitbit, Garmin, Suunto, COROS, Wahoo, TrainingPeaks:** nur vorbereitet bzw. brauchen Freischaltung.
- **Englisch** nur angefangen (fällt auf Deutsch zurück). **„Konto löschen“** fehlt noch (für einen Store nötig).
- **Umbenennen** von Repo, altem Worker und echter Adresse passiert erst beim Freigeben.

### Freigeben
Wenn alles passt: **„Freigeben“** an Claude. Danach: neue Datenbank aus einer frischen Kopie, echte Adresse https://stamio.pages.dev, dann ziehst du dein iPhone um (FUER-JONAH.md 12). Die alte App bleibt 4 Wochen als Rückfall.

Weitere Dokumente: [ENTSCHEIDUNGEN.md](ENTSCHEIDUNGEN.md) · [SPAETER.md](SPAETER.md) · [NAMEN.md](NAMEN.md)
