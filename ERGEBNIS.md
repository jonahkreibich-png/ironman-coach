# Ergebnis

## Auftrag 5 (12.10.2026)

**Neue Version in der Test-App: https://stamio-test.pages.dev** (Version 2.2.0). Die echte App ist unverändert. Alles liegt jetzt auch auf GitHub (Branch `entwicklung`), `main` ist unverändert.
**Was du jetzt tun musst:** [FUER-JONAH.md](FUER-JONAH.md) – kurz: Papa neu starten lassen, Mitteilungen auf deinem iPhone erlauben.

**Warum Papas Lauf auf Montag lag:** Die alte Zuordnung von Notizen (Auftrag 4) kannte keine Wochentage, Sportarten oder Verneinungen; „kann mittwochs nicht laufen, nur Samstag oder Sonntag“ blieb wirkungslos. Jetzt ist jede Angabe eine Regel, die Plan, Engine, Chat und KI einhalten.
**Warum Meldungen nicht ankamen:** Ohne Server-Konto oder ohne Verbindung wurde die Meldung nur in die Zwischenablage kopiert (die App sagte „kopiert“, nicht „gesendet“); dazu ging der getippte Text verloren, wenn die App im Hintergrund neu zeichnete, und deine Liste lud nie neu. In der Test-Datenbank ist von Papa keine Meldung angekommen.

**Geprüft:** 589 Unit- und Server-Tests und 95 E2E-Tests (iPhone-Breite, Chromium und WebKit) grün, darunter 87 echte Sätze für den Regel-Parser, über 150 Chat-Gespräche auf den Plänen aller 6 Test-Personen, 100 Zufallsnachrichten und die Layout-Prüfung aller Bildschirme auf 320/375/390/430 px und 130 % Zoom, hell und dunkel.

| Punkt | Stand | Was |
|---|---|---|
| **0** Arbeit sichern | erledigt | Vorher alle Dateien und die ganze Git-Historie nach Schlüsseln, Codes, persönlichen Daten und Auftragsdateien durchsucht (nichts gefunden), `entwicklung` gepusht und nach jeder Phase erneut. `AUFTRAG-5.md` steht in `.gitignore`. |
| **A1** Regel-Modell | erledigt | `shared/constraints.ts`: nur an Tagen, nie an Tagen, Tag frei, Höchstdauer, Ort/Gerät (auch Monate), Zeitraum, Körper mit Folgen, Vorliebe; hart oder weich. |
| **A2** Wochenraster | erledigt | Im Fragebogen (Teil „Zeit und Alltag“) und unter „Berücksichtigungen“: Sportart × Mo-So, geht / lieber nicht / geht nicht; Tage ohne Zeit gesperrt, Teamsport-Tage markiert, Regeln aus Sätzen erscheinen sofort im Raster. |
| **A3** Freitext | erledigt | Satz-Parser (Tage, Spannen, Wochenende, Synonyme, Verneinung, „nur“, „lieber“, Minuten, Daten, Jahreszeiten, Orte, Körperteile, Tippfehler, Mundart), 87 Testsätze inkl. Papas Satz. Nach jeder Eingabe „So habe ich es verstanden“ mit „Stimmt“/„Ändern“; Unverstandenes öffnet ein passendes Formular. Mit KI-Schlüssel übersetzt die KI in dasselbe Format (geprüft, mit Bestätigung). |
| **A4** Harte Regeln immer | erledigt | Plan-Generator, wöchentliche Anpassung, Verschieben der Engine, Chat und KI-Werkzeuge halten sie ein; unmögliche Wünsche → klarer Hinweis mit „2 Läufe am Wochenende, dafür einer länger“ / „Laufen auch am … erlauben?“; weiche Ausnahmen mit Begründung in der Einheit; „Plan bearbeiten“ darf mit Warnung „nur dieses Mal“; neue Planprüfung „keine harte Regel verletzt“ für alle 6 Test-Personen (neu: Vater-Profil mit Sa/So, Mi nie, Schwimmbad Do, Di frei); bei geänderten Regeln wird sofort neu geplant und die laufende Woche repariert, mit Nachricht im Coach. |
| **B** Meldungen | erledigt (ohne E-Mail) | Ausgang auf dem Gerät (geht nach dem Einrichten bzw. bei Verbindung automatisch raus), Mitteilung an alle deine Geräte mit Link zur Meldung, Posteingang neu/in Arbeit/erledigt mit Text, Bildschirm, Version, Gerät, Screenshot (ein Tipp öffnet die Fotos), „Als Text kopieren“ für Claude Code, Antwort an den Nutzer (erscheint bei ihm im Coach und unter „Meine Meldungen“). Test: Nutzer B meldet, Betreiber A sieht es. **E-Mail:** geht nicht kostenlos (braucht eigene Domain), siehe SPAETER.md. |
| **C** Nichts ragt heraus | erledigt | Fester WebKit-Test über alle Bildschirme (aus dem Code gelesen, neue laufen mit), Zustände leer/normal/voll/Fehler, Sheets, Begrüßung, 320/375/390/430 px und 130 % Zoom, hell und dunkel. Ursachen zentral behoben (Umbruch, schrumpfbare Bausteine, Zeitfelder, Tab-Beschriftung, Safe-Area). |
| **D1-D5** Chat | erledigt | Jede Nachricht bekommt eine Antwort; Rückfragen mit Zusammenhang („Ich hab Mittwoch keine Zeit“ → „Donnerstag oder Samstag?“ → „Samstag“); verschieben, tauschen, kürzer, länger, leichter, härter, streichen, Tag frei, Woche leichter, Woche mit wenig Zeit, krank, Schmerzen (mit Stärke), Verletzung, Urlaub/Prüfungen, neue dauerhafte Regel, Ziel und Wunschzeit – mit Vorschau, Bestätigen, Rückgängig; Schnellaktionen je nach Lage; gezielte Rückfragen mit Knöpfen statt Floskeln. |
| **D6** Test-Paket | erledigt | 186 Gespräche (31 Abläufe × 6 Personen, mindestens 150 laufen wirklich), D2-Beispiel, Regel-Ablehnung, Schnellaktionen, 100 Zufallsnachrichten. |
| **D7** KI-Schlüssel | erledigt (vorbereitet) | Mit Schlüssel versteht und formuliert die KI; KI-Werkzeuge prüfen dieselben harten Regeln, neue Regeln über `add_rule` als Vorschlag. Ab wann es sich lohnt: SPAETER.md. |
| **D8** Nachrichten altern | erledigt | „Gerade aktuell“ oben; Briefings/Kommentare nach 7 Tagen (3/7/14 einstellbar) in den durchsuchbaren Verlauf; erledigte Gespräche nach 3 Tagen als eine Zeile; offen/ungelesen/angeheftet bleibt; Planänderungen bleiben im Anpassungs-Protokoll. |
| **E1** Export/Löschen | erledigt | Mehr → Daten und Geräte → „Meine Daten als Datei“ und „Konto löschen“ („LÖSCHEN“ eintippen + zweiter Tipp): alles sofort, Verbindungen getrennt, Server-Backups nach 30 Tagen. |
| **E2** Privatsphäre | erledigt | Betreiber sieht nur Name, Status, Version, Geräte, Meldungen; Trainingsdaten nur mit Freigabe pro Meldung. Server-Test sucht in allen Antworten nach Gesundheitsfeldern. Abschnitt in STORE-PLAN.md. |
| **E3** Start für Tester | erledigt | Einladung als Link (`?invite=…`, „Link teilen“), iPhone-Weg über Home-Bildschirm mit Code aus der Zwischenablage, Begrüßung in 3 Seiten, dann Fragebogen. |
| **E4** Daten verlieren unmöglich | erledigt | Neue Konten synchronisieren ab dem ersten Eintrag; Wiederherstellungscode beim Einrichten (einmal angezeigt, erneuerbar), damit bekommt ein neues Gerät alles zurück (E2E: Safari-Daten gelöscht → Code → Daten zurück). |
| **E5** Fehler je Tester | erledigt | Im Posteingang „Fehler bei Testern (14 Tage)“, ohne Gesundheitsdaten. |
| **E6** Neu in dieser Version | erledigt | Einmal nach dem Update 3 Punkte. |
| Abschluss | erledigt | Deploy in die Test-Umgebung (Datenbank-Erweiterung 0004: nur neue Spalten und Tabellen), Papa als Test-Nutzer zurückgesetzt, `entwicklung` gepusht. |

**Ehrlich offen:**
- Kein E-Mail-Versand bei Meldungen (kostet eine Domain). Nur Mitteilungen; die musst du auf deinem iPhone einmal erlauben.
- Ein echter Bildschirm-Abdruck „mit einem Tipp“ ist im Browser nicht möglich; der Tipp öffnet die Fotos, dort wählt man das iPhone-Bildschirmfoto.
- Die echten Anbieter-Anmeldungen (Oura, Dropbox …) fehlen weiter, bis du die App-Schlüssel anlegst.
- Der Chat ohne KI versteht viel, aber nicht alles; was er nicht versteht, fragt er gezielt nach.
- Auf dem iPhone muss ein Tester den Einladungscode einmal einfügen, weil die Home-Bildschirm-App ihren Speicher nicht mit Safari teilt.

Weitere Dokumente: [ENTSCHEIDUNGEN.md](ENTSCHEIDUNGEN.md) (Nr. 50-71) · [SPAETER.md](SPAETER.md) · [STORE-PLAN.md](STORE-PLAN.md) (Abschnitt 6)

---

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
