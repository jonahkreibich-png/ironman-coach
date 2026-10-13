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

## Auftrag 5 (12.10.2026)
| # | Entscheidung | Warum |
|---|---|---|
| 50 | Ein Regel-Modell für alles (`shared/constraints.ts`): Art (nur an Tagen, nie an Tagen, Tag frei, Höchstdauer, Ort/Gerät, Zeitraum, Körper, Vorliebe), Bezug und Stärke (hart/weich). Plan-Generator, wöchentliche Anpassung, Verschieben durch die Engine, Coach-Chat, KI-Werkzeuge und „Plan bearbeiten“ prüfen mit denselben Funktionen. | A1/A4: Papas „mittwochs nicht laufen, nur Sa/So“ wurde ignoriert, weil die Stichwort-Zuordnung (Nr. 43) keine Tage verstand. |
| 51 | Freitext wird von einem eigenen Satz-Parser gelesen (Tage, Spannen, Wochenende, Sportarten mit Synonymen, Verneinung, „nur“, „lieber“, Minuten, Daten, Jahreszeiten, Orte, Körperteile, Tippfehler und Mundart). Ohne Verneinung und ohne „nur“ gilt „Laufen Sa und So“ als „nur Sa und So“; die App zeigt das immer zur Bestätigung. | A3, kostenlos, nachvollziehbar, 87 Testsätze. |
| 52 | Gespeichert wird die Regel, der Satz bleibt als Notiz sichtbar. Alte Notizen ohne gespeicherte Regel werden beim Planen automatisch gelesen (deshalb wirkt Papas alter Satz sofort). Wird eine Notiz im Raster komplett aufgehoben, merkt sich die App das, damit der Satz nicht neu gelesen wird. | Nichts geht verloren, bestehende Profile funktionieren ohne Umbau. |
| 53 | „Tage ohne Zeit“ (Zeit pro Tag = kein Training) sind im Raster gesperrt und werden dort nicht geändert, sondern unter „Zeit pro Tag“. | Eine Quelle pro Angabe. |
| 54 | Passt ein Wunsch nicht zu harten Regeln (3 Läufe, nur Sa/So erlaubt), plant der Generator so viele, wie erlaubt sind (gleiche Zeit, also länger), und zeigt einen Hinweis mit zwei Lösungen: weniger Einheiten oder einen weiteren Tag erlauben (nie einen ausdrücklich verbotenen Tag). | A4: nicht heimlich umgehen. |
| 55 | Findet eine harte Einheit wegen Regeln keinen Tag, wird sie zur lockeren statt zu entfallen. Kraft nie am Tag vor einer harten Einheit, auch über die Wochengrenze. | Lieber locker als gar nicht. |
| 56 | Weiche Regeln werden mit hohem Abzug bewertet; wird eine gebrochen, steht in der Einheit „Ausnahme: …, weil …“. | A4. |
| 57 | Die Engine, der Chat und die KI dürfen harte Regeln nie brechen. Nur der Nutzer in „Plan bearbeiten“, mit Warnung und „Nur dieses Mal erlauben“; die Ausnahme hängt an der einzelnen Anpassung. | A4. |
| 58 | Ändert sich eine Regel, wird ab nächster Woche neu geplant und die laufende Woche sofort repariert (Einheiten auf erlaubte Tage, sonst streichen), mit Nachricht im Coach und Rückgängig. | A4 „sofort neu geprüft“. |
| 59 | Mit KI-Schlüssel übersetzt das günstige Modell (Haiku 5.5) Freitext mit strukturierter Ausgabe in dasselbe Regel-Format; jede Regel wird geprüft (`sanitizeRule`), bei Fehlern gilt der eingebaute Parser. | A3, wenige Cent im Jahr. |
| 60 | Meldungen: Ursache war, dass ohne Server-Konto oder ohne Verbindung nur in die Zwischenablage kopiert wurde und die Liste beim Betreiber nie neu lud; dazu ging der Entwurf beim Neuzeichnen verloren und die Version wurde zu „#“ zensiert. Jetzt: Ausgang auf dem Gerät (übersteht auch das Einrichten), automatischer Versand nach dem nächsten Abgleich, Mitteilung an alle Betreiber-Geräte, Posteingang mit Status. | B. |
| 61 | Keine E-Mail-Benachrichtigung: Cloudflare Email Routing braucht eine eigene Domain (ca. 10 € im Jahr). Nur Push. | Regel 7. |
| 62 | Screenshot per Tipp aus den Fotos (iPhone-Bildschirmfoto), automatisch auf höchstens 900 px verkleinert. Ein Bild der Seite selbst zu erzeugen geht in Safari nicht zuverlässig. | B. |
| 63 | Gegen Überlauf zentrale Basisregeln in `styles.css` (Text bricht um, Bausteine dürfen schrumpfen, Zeilen umbrechen, Tabellen scrollen in ihrem Kasten, Safe-Area links/rechts) statt Einzelkorrekturen; ein fester WebKit-Test liest die Bildschirme aus `main.ts`, neue laufen automatisch mit. 130 % Zoom = 300 px CSS-Breite. | C. |
| 64 | Chat ohne KI: Gesprächsführung mit Rückfragen (`shared/coach/dialog.ts`), alle Änderungen als feste Aktionen (`shared/coach/ops.ts`) mit Rückgängig. Wählt der Nutzer auf eine Rückfrage einen Tag, wird direkt ausgeführt (die Frage war die Vorschau); sonst „Ja/Nein“. Fragen („Warum …?“) beantwortet das Wissen, keine Änderung. | D1-D5. |
| 65 | „Ab jetzt/immer/mittwochs“ = dauerhafte Regel, „am Mittwoch“ = nur diese Woche; unklar → Rückfrage. Schmerzen fragen nach der Stärke; stark = streichen, Arzt, schonender Plan. | D3. |
| 66 | Nachrichten: Briefings/Kommentare nach 7 Tagen (einstellbar 3/7/14) in den Verlauf, erledigte Gespräche nach 3 Tagen als eine Zeile; offen, ungelesen, angeheftet bleibt. | D8. |
| 67 | Konto löschen löscht sofort alles außer den nächtlichen Server-Backups; diese werden nach 30 Tagen automatisch entfernt. Das Betreiber-Konto kann sich nicht selbst löschen. | E1 und Schutz vor Datenverlust durch Versehen. |
| 68 | Der Betreiber sieht von anderen nur Name, Status, App-Version, Geräte und Meldungen (die Zahl der Datensätze ist entfernt). Trainingsdaten nur, wenn der Nutzer sie für eine Meldung ankreuzt. | E2, serverseitig getestet. |
| 69 | Wiederherstellungscode (16 Zeichen) für jedes neue Konto, einmal angezeigt, nur als Hash gespeichert, jederzeit erneuerbar. Kein E-Mail-Login (bräuchte einen Mail-Versand, siehe 61). | E4 kostenlos. |
| 70 | Einladung als Link `…/?invite=CODE`. Auf dem iPhone in Safari: erst auf den Home-Bildschirm, der Code wird kopiert und in der App mit einem Tipp eingefügt, weil die Home-Bildschirm-App ihren Speicher nicht mit Safari teilt. | E3. |
| 71 | Version 2.2.0; „Neu in dieser Version“ einmal nach dem Update, neue Nutzer sehen es nicht. | E6. |
| 72 | Einstellungen, die den Plan neu bauen (Berücksichtigungen; Sportarten, Stunden, Stil, Ziele im Profil), werden nur vorgemerkt; „Übernehmen“ zeigt die Planänderungen dieser und nächster Woche und plant erst dann neu. Name, Gewicht, Sprache usw. speichern weiter sofort. Lösungen aus einer Coach-Nachricht gelten sofort (bewusster Tipp). Ziele ändern den Plan jetzt beim Übernehmen (vorher gar nicht). | Auftrag 6, Punkt 1: versehentliche Tipps dürfen den Plan nicht ändern. |
| 73 | Namensempfehlung „Tempendo“ (Alternative „Stamendo“), Name in der App bleibt bis zu Jonahs Wahl „Stamio“. | Punkt 2, NAMEN.md. |
| 74 | Echte App unter neutralen Namen: Pages `coach-app-efc7`, Worker `coach-api-efc7`, D1 `coach-db-efc7`. Die Test-Umgebung behält `stamio-test`, weil Papa sie nutzt; ein Umzug der Test-App lohnt sich erst mit dem neuen Namen. | Punkt 3: Namenswechsel ohne erneuten Umzug. |
| 75 | Kopie der echten Daten in die Test-App ersetzt nur Nutzer 1 (alte Datensätze als gelöscht, neue mit frischen Revisionen, Geräte laden neu); Test-Nutzer bleiben. | Punkt 4: Papa nicht stören. |
| 76 | Vor 0002 wird an Kopien der echten Datenbank 0001 erneut ausgeführt (nur „IF NOT EXISTS“). | Die echte Datenbank stammt aus einer älteren 0001 ohne `error_log`; 0002 brach daran ab (Test in multiuser.test.ts). |
| 77 | Neuer VAPID-Schlüssel statt des alten. | Der alte liegt nur als Cloudflare-Secret vor und ist nicht auslesbar; Mitteilungs-Abos gelten ohnehin je Adresse, das iPhone erlaubt sie auf der neuen Adresse einmal neu. |
| 78 | Ein Zeitplan je Server (`*/5`), der Lauf um 02:00 UTC macht das nächtliche Backup mit. Alte App unverändert mit 2. | Kostenlos sind 5 Zeitpläne pro Konto; alt 2 + Test 1 + neu 1 = 4. Kein Kauf. |
| 79 | Durchlauf mit echten Daten lokal (gleicher Server-Code, Kopie als SQLite, eigener Test-Einrichtungscode) statt mit dem echten Einrichtungscode im Browser. | Zugangscodes gibt Claude nicht in fremde Seiten ein; lokal ist es dieselbe App mit denselben Daten. |
| 80 | Coach: Trainingsfragen während einer Krankheitsphase („Kann ich morgen schwimmen?“) bekommen eine Antwort zur Krankheit statt einer Plan-Rückfrage; ab 18 Uhr wird „heute“ nicht mehr als Ausweichtag angeboten. Im Muster für harte Einheiten stand ein Steuerzeichen statt `\b` („Schwellentest“ galt nicht als hart); ein Test prüft jetzt alle Quelltexte auf Steuerzeichen. | Funde aus dem Durchlauf mit Jonahs Daten. |
| 81 | `entwicklung` → `main` per Fast-Forward (CI grün). Im Wurzelordner liegen nur noch `index.html`/`404.html` („Die App ist umgezogen“, Weiterleitung) und ein `sw.js`, das den alten Offline-Cache löscht und sich abmeldet. | Release Schritt 5: Ohne neues `sw.js` hätte das alte Icon die alte App weiter aus dem Cache gezeigt. Rückfall: `main` zurücksetzen, alter Server und alte Datenbank sind unverändert. |
