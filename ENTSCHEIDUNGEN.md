# Entscheidungen

Nach Regel 8 selbst entschieden. Jede Zeile: was, warum, wie rückgängig.

## Arbeitsweise und Sicherheit
| # | Entscheidung | Warum |
|---|---|---|
| 1 | Alles auf dem Branch `entwicklung`, nur lokal committet, nichts nach GitHub gepusht. | `main` ist die echte App (GitHub Pages). Ein Push würde Code veröffentlichen; nötig ist er erst beim Freigeben. |
| 2 | Testumgebung: Worker `stamio-api-test`, Datenbank `stamio-test`, App `https://stamio-test.pages.dev` (Cloudflare Pages, `/api` über Pages Function an den Worker). | Eigene Adresse ohne „ironman“, gleiche Herkunft für App und API (keine CORS-Probleme), kostenlos. |
| 3 | Echte Datenbank nicht gelesen. Testdaten sind erfunden (`fixtures/demo.mjs`); Jonahs echte Daten kommen per `scripts/copy-prod-to-test.mjs` (von Jonah gestartet) oder per Backup-Datei in die Test-App. | Der Lesezugriff auf die echte Datenbank wurde abgelehnt. Nicht umgangen. |
| 4 | Migration auf mehrere Nutzer (0002) nur an Kopien: Unit-Test mit Altdaten, Kopier-Skript für die Testumgebung, beim Freigeben eine **neue** Datenbank aus einer Kopie. Die alte bleibt 4 Wochen. | Regel 2: Daten nie ohne Sicherung und getestete Migration umbauen. |
| 5 | Erste Einrichtung nur mit Einrichtungscode (`SETUP_CODE`), neue Nutzer nur per Einladung (14 Tage, einmalig). Keine offene Registrierung. | Regel 5. |
| 6 | Alle Schlüssel nur als Cloudflare-Secrets, Dienst-Tokens AES-GCM-verschlüsselt (`TOKEN_KEY`). Zugangsdaten für Jonah in `ZUGANG.local.md` (nicht im Repo). | Regel 3. |
| 7 | CI (GitHub Actions): Typen, Unit-, Server- und E2E-Tests (Chromium + WebKit, 390 px). Deploy nur aus `main`, nur wenn grün und ein Cloudflare-Token hinterlegt ist. Migrationen nie automatisch. | Regel 4 und 2. |

## Name und Marke
| # | Entscheidung | Warum |
|---|---|---|
| 8 | Name **Stamio** (von „Stamina“), Zeichen „S“. Steht nur in `shared/brand.ts`. Alternativen in NAMEN.md. | kurz, für alle Ausdauersportarten, deutsch/englisch aussprechbar, keine bekannte Marke gefunden (RDAP-Prüfung). |
| 9 | Repo, alter Worker und alte Adresse heißen bis zum Freigeben weiter „ironman…“. | Auftrag: Umbenennen erst beim Freigeben. |
| 10 | Alte Screenshots in `docs/design/vorher/` zeigen den alten Namen. | Dokumentieren den Ausgangszustand; die App selbst nennt ihn nirgends (Test prüft das). |

## Oberfläche
| # | Entscheidung | Warum |
|---|---|---|
| 11 | 5 Tabs: Heute, Plan, Coach, Fortschritt, Mehr. Werte und Essen unter „Mehr“. | Auftrag (max. 5 Tabs); Werte kommen meist automatisch, Essen ist nicht täglich nötig. |
| 12 | Heute-Variante A (Antwort-Karte) als Standard, B (Feed) unter Einstellungen wählbar. | Vergleich in DESIGN.md: A beantwortet die Kernfrage ohne Tippen. |
| 13 | Gut/Okay/Schlecht entfernt. Anstrengung (RPE) nur optional, eingeklappt. | Auftrag F: Bewertung aus Messdaten. |
| 14 | Manuelle Score-Korrektur nur unter Einstellungen, höchstens ±15. | Auftrag F. |
| 15 | Texte zentral in `shared/lang/de.ts`, Englisch vorbereitet (fällt auf Deutsch zurück). Test meldet fehlende Texte und Schaltflächen ohne Aktion. | Auftrag D (i18n). |
| 16 | Persönliche Standardwerte im Code (Alter 17, 184 cm, 73 kg, Ruhepuls 56, HFV 65) durch neutrale ersetzt. Gespeicherte Werte bleiben. | Profil statt Code-Konstanten. |

## Funktionen
| # | Entscheidung | Warum |
|---|---|---|
| 17 | Plan-Generator nur sichtbar, wenn die App nicht als echte App läuft (`APP_ENV` ≠ production). Der Fragebogen nutzt ihn auch in der Testumgebung. | Auftrag D: Generator nur im Test. |
| 18 | Neuer Plan ersetzt nur die Zukunft (`transitionPlan`); der alte Plan wird gemerkt und kann zurückgeholt werden. | Nichts Erledigtes geht verloren. |
| 19 | Coach-Engine regelbasiert, läuft bei neuen Daten, täglich und sonntags; jede Planänderung als Nachricht mit Grund und Rückgängig. | Auftrag 3A, kostenlos. |
| 20 | KI-Coach komplett gebaut, aber aus (kein API-Schlüssel). Starkes Modell nur für Gespräche, Routine-Modell für Umformulierungen und Essensfotos. Budget und Tageslimit. | Regel 7, Auftrag 3A. |
| 21 | Regeln stehen über der KI: jede KI-Änderung läuft durch dieselbe Regelprüfung; größere Änderungen nur als Vorschlag. Keine Diagnosen, keine Medikamente. | Auftrag 3A. |
| 22 | KI-Coach ab 16 mit eigener Einwilligung, unter 16 zusätzlich Eltern (App **und** Server prüfen). Unter 18 bleiben: keine Gewichtsziele, vorsichtigere Steigerung (+8 % statt +10 %), Mindestalter für lange Distanzen, Oura nur mit Eltern-Einwilligung (Oura-Vertrag). | Wunsch von Jonah (16 statt 18); Schutz Jüngerer bleibt. |
| 31 | Freischaltungen pro Nutzer (`shared/features.ts`): Betreiber (Admin, Nutzer 1) hat immer KI-Coach, Essen per Foto und Plan-Generator. Andere Nutzer nur, was freigeschaltet ist – heute vom Betreiber unter Daten und Geräte, später per Kauf im Store. Der Server prüft das bei jedem KI-Aufruf. | Wunsch von Jonah: für ihn immer alles, für andere später kostenpflichtig. |
| 23 | Oura-Daten gehen nie an die KI und nicht in die Claude-Zusammenfassung; beim Trennen standardmäßig löschen. | Oura API Agreement 4(d), 6(g), 5(f). |
| 24 | Apple Health über Kurzbefehl mit eigenem, widerrufbarem Schlüssel statt HealthKit. | HealthKit braucht eine native App (99 $/Jahr). |
| 25 | HealthFit: Dropbox-Weg gebaut, zusätzlich Datei-Upload per Kurzbefehl (iCloud) und intervals.icu. | Automatischer Dropbox-Export von HealthFit war nicht sicher zu bestätigen. |
| 26 | Eigener FIT-Decoder statt Bibliothek. | klein, läuft im Worker, mit echten FIT-Beispieldateien (MIT-Lizenz) getestet. |
| 27 | Dubletten: gleicher Tag, gleiche Sportart, Start ±30 min. Von Hand eingetragene Werte gewinnen immer. | Auftrag E. |
| 28 | Leistungs-Scores (0–100) relativ zum Ziel aus gemessener Pace/Leistung/Puls/Umfang, Start mit der alten Kalibrierung vom 03.10. | Auftrag F. |
| 29 | Krankheit am selben Tag beenden löscht die Phase (Versehen); sonst endet sie gestern und der Wiedereinstieg beginnt. | sonst blieb man nach „gesund“ bis Mitternacht krank. |
| 30 | „Wettkampf-Modus“ ab 14 Tagen vor einem A/B-Ziel mit Datum, danach 10 Tage Ergebnis und Erholung. | Auftrag 3E. |

## Auftrag 4 (11.10.2026)
| # | Entscheidung | Warum |
|---|---|---|
| 32 | Keine Werte einer Person mehr im Code. Fehlende Schwellen werden aus dem Profil geschätzt (Maximalpuls aus dem Alter, Schwellenpuls 89 % bzw. 86 % davon, Schwellen-Pace aus einer Bestzeit nach Riegel, sonst grob aus Erfahrung) und als „geschätzt“ markiert, mit Test-Vorschlag. Ohne eigene Grenzwerte lernt die Ampel 7 Tage den Normalbereich statt fester Zahlen. | A1: Andere Nutzer sahen Jonahs Werte, weil sie im Code als Standard standen. |
| 33 | Alte, auf einem Gerät gespeicherte Standardwerte (genau 170/162 bzw. 165, 5:39, 28 km/h) gelten auf Geräten, die nicht zu Jonahs Konto gehören, einmalig als geschätzt und werden neu berechnet. Jonahs Konto (Nutzer 1) wird nie angefasst. | Der Vater hatte diese Werte schon gespeichert. Jonahs echte Werte sind zufällig genau diese Zahlen, deshalb nur außerhalb seines Kontos. |
| 34 | Einladung oder Kopplung auf einem Gerät mit Daten: die Daten werden vorher gelöscht, außer der Nutzer bestätigt „gehören mir“. Daten eines anderen Kontos werden immer gelöscht. Neu: „Abmelden und Gerät freimachen“. | A1: Nutzerwechsel ohne Vermischung. |
| 35 | „Test-Nutzer anlegen“ erzeugt eine Einladung mit Merkmal Test. Zurücksetzen markiert alle Datensätze als gelöscht (die Geräte räumen beim nächsten Abgleich auf), das Gerät bleibt angemeldet und startet mit dem Fragebogen. | F4. |
| 36 | Garmin, COROS, Suunto, Wahoo laufen über intervals.icu (3 Schritte), kein eigener Partner-Antrag. | A2: kostenlos, sofort möglich, offizielle Verbindungen. |
| 37 | Fehlt ein App-Schlüssel, zeigt die App eine Erklärung und eine Alternative statt eines Fehlers. Betreiber sehen die Namen der fehlenden Secrets. | A2: „kein Knopf, der nichts tut“. |
| 38 | Fragebogen: Zeit pro Tag in 4 Stufen statt Uhrzeiten (kurz bis 45, mittel bis 90, lang mehr als 90 min), Häufigkeit je Sportart als Spanne (z. B. 1-2×), Teamsport mit Trainings- und Spieltagen und Saison. Alte Antworten mit Zeitfenstern funktionieren weiter. | B1-B3. |
| 39 | Mehrere Ziele: das A-Ziel bestimmt die Phasen. B-Ziele: 4 Tage vorher nichts Hartes und weniger Umfang, 3 Tage danach locker. C-Ziele: nur der Tag davor ohne Hartes. Der Umfang je Sportart folgt einer Gewichtung aus Priorität (A 1, B 0,6, C 0,3) und Abstand zum Termin. | A4. |
| 40 | Jede Einheit entsteht aus Bausteinen (Aufwärmen, Hauptteil, Ausklang). Titel, Dauer, Distanz und Text werden daraus berechnet; Anpassungen (Umfang ±, Stufe) bauen sie neu. | A6/C2: Zahlen und Text passen immer zusammen. |
| 41 | Lernwege: Kraul in 8 Stufen (Wassergewöhnung bis 800 m am Stück), Brust-Weg in 3 Stufen, Lauf-Geh-Wechsel in 8 Stufen bis 30 min. Der Plan bleibt auf der aktuellen Stufe; erst wenn Daten zeigen, dass sie geklappt hat (Dauer ≥ 90 %, RPE ≤ 7 oder Uhr misst die Strecke am Stück), steigt die nächste Woche eine Stufe. | C1. |
| 42 | Kraft: Übungen mit Sätzen und Wiederholungen je Sportart (Läufer: Beine, Rumpf, Waden; Schwimmer: Schulter, Zug; Teamsport: Adduktoren), nie am Tag vor harten Einheiten, Spielen oder Wettkämpfen, in Erholungs- und Wettkampfwochen leichter. | A5. |
| 43 | Freie Berücksichtigungen werden über Stichwörter Kategorien zugeordnet (Knie, Achillessehne, Rücken, Schulter, Schwimmbad-Tage, kein Schwimmbad im Winter, Rad nur drinnen …). Unbekanntes bleibt sichtbar als „noch nicht berücksichtigt“. Nach jeder Änderung plant die App ab nächster Woche neu, die laufende Woche bleibt. | C3: einfach, nachvollziehbar, ohne KI. |
| 44 | „Plan bearbeiten“ nutzt dieselben Anpassungen wie der Coach (mit Rückgängig). Neu: Einheit hinzufügen und „fest“ (die Engine ändert sie nicht mehr). Warnungen sind Hinweise, übernehmen geht trotzdem. | C5: „es ist sein Plan“. |
| 45 | „Mit Claude besprechen“ und „Plan-Code einfügen“ sind aus dem Coach-Tab entfernt. Der Coach-Chat versteht ohne KI 46 Absichten (unscharfer Wortvergleich, Tippfehler bis 1-2 Zeichen). Aktionen (Krankheit, Umplanen, Berücksichtigung) laufen erst nach einem Tipp auf „Ja“. Das Essens-Foto kann weiter an die Claude-App geteilt werden, bis der KI-Schlüssel da ist. | D1/D2. |
| 46 | Zeitfelder überall als getrennte Zahlenfelder (Min/Sek, bei Bestzeiten und Wunschzeiten Std/Min/Sek) mit Zahlentastatur. | A7: iPhone-Zahlentastatur hat keinen Doppelpunkt. |
| 47 | Wunschzeiten: Prognose grob aus den (auch geschätzten) Schwellen plus vorsichtiger Verbesserung bis zum Termin (Einsteiger höchstens 15 %, sonst 8 %). Liegt die Wunschzeit mehr als 2 % darunter, schlägt die App eine Spanne vor. | B4. |
| 48 | Neue Pläne bekommen eindeutige Einheiten-IDs je Erstellungsdatum. | Sonst hätten neu geplante Wochen erledigte Häkchen alter Einheiten geerbt. |
| 49 | E2E-Tests laufen mit einem Worker, weil mehrere Tests denselben lokalen Server mit Datenbank nutzen. | stabil statt schnell (gesamt gut 1 Minute). |
