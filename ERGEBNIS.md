# Ergebnis (AUFTRAG-2 und AUFTRAG-3)

**Test-App: https://stamio-test.pages.dev** – eigene Testumgebung (eigener Worker, eigene Datenbank). Die echte App ist unverändert.
**Was du jetzt tun musst:** [FUER-JONAH.md](FUER-JONAH.md) (Pflicht ca. 45 min). Wenn dir die Test-App gefällt: **„Freigeben“** sagen, dann stellt Claude nach [scripts/release.md](scripts/release.md) um.

## Neu

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

## Was fehlt oder offen ist (ehrlich)
- **Echte Daten nicht in der Testumgebung.** Mein Lesezugriff auf die echte Datenbank wurde abgelehnt; ich habe das nicht umgangen. Die Testumgebung ist leer. Kopieren: Schritt 1 in FUER-JONAH.md (testet dabei auch die Datenbank-Umstellung an der Kopie).
- **Nichts zu GitHub gepusht.** Alles liegt lokal auf dem Branch `entwicklung` (18 Commits). Die GitHub-CI ist daher noch nicht gelaufen; lokal laufen alle Schritte grün.
- **E2E gegen die Live-Test-Adresse** habe ich nicht automatisiert, nur von Hand geprüft (App lädt, Server antwortet, Einrichtung ohne Code wird abgelehnt). Die E2E-Tests laufen gegen denselben Code lokal.
- **Dienste ohne App-Schlüssel:** Oura, Dropbox, WHOOP, Polar, Withings zeigen „auf dem Server noch nicht eingerichtet“, bis du die Entwickler-Apps anlegst (FUER-JONAH.md 7–9).
- **KI-Coach und Essens-Foto** sind aus (kein API-Schlüssel, kostet Geld – SPAETER.md).
- **HealthKit direkt, Fitbit, Garmin, Suunto, COROS, Wahoo, TrainingPeaks:** nur vorbereitet bzw. brauchen Freischaltung.
- **Englisch** nur angefangen (fällt auf Deutsch zurück). **„Konto löschen“** fehlt noch (für einen Store nötig).
- **Umbenennen** von Repo, altem Worker und echter Adresse passiert erst beim Freigeben.

## Freigeben
Wenn alles passt: **„Freigeben“** an Claude. Danach: neue Datenbank aus einer frischen Kopie, echte Adresse https://stamio.pages.dev, dann ziehst du dein iPhone um (FUER-JONAH.md 12). Die alte App bleibt 4 Wochen als Rückfall.

Weitere Dokumente: [ENTSCHEIDUNGEN.md](ENTSCHEIDUNGEN.md) · [SPAETER.md](SPAETER.md) · [NAMEN.md](NAMEN.md)
