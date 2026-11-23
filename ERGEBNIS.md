# Auftrag 41 (von dir „Auftrag 40“ genannt): keine Wiederholungen, Anleitung oben, Kopf aufgeräumt (23.11.)

**Stand:** Version **3.29.0** – veröffentlicht am 23.11. (erst Test-App, dann echte App mit Sicherung; Kopie der echten Daten aller Nutzer geprüft, Start-Test aller Nutzer ok, 10 Minuten ohne Startfehler). Intern „Auftrag 41“, weil es Auftrag 40 (3.28.0) schon gab.

## 1. Box „verschoben/angepasst“ ohne Wiederholungen
- **Ursache:** Jede Anpassung wurde gespeichert, auch solche ohne sichtbaren Unterschied (z. B. dieselbe Verschiebung zweimal, hin und zurück). Die Box listete alle. Dazu stand bei alten KI-Verschiebungen ein interner Platzhalter im Titel.
- **Jetzt:** Anpassungen ohne Unterschied werden nicht gespeichert. Die Box zeigt nur Original → jetzt, jeden Schritt einmal mit Datum, und heißt „verschoben“, „angepasst“ oder „verschoben und angepasst“. Ohne echten Unterschied gibt es keine Box. Platzhalter sind nie sichtbar.
- **Bestehende Daten:** Leere oder doppelte Anpassungen werden beim Start über den normalen Abgleich stillgelegt, nicht direkt am Server (Nutzer 1: 6, Nutzer 2: 1, Nutzer 5: 1).

## 2. Anleitung oben
Vor dem Training steht die Anleitung direkt unter dem Kopf, nach dem Training eingeklappt als „Anleitung“ über dem Ablauf. Im Heute-Tab führt „Anleitung ›“ mit einem Tipp dorthin.

## 3. Kopf aufgeräumt
Kurzer Titel (z. B. „Rad 3 × 10 min Sweet Spot“), Schwimmsätze immer mit Lage, Sportart einmal, „Geplant“ einmal (mit Grund), ein Abzeichen („✓ erledigt · anders als geplant“). Bei erledigten Einheiten steht „Als nicht erledigt markieren“ statt „Fällt aus“.

## 4. Tests verschwinden nicht mehr still
- **Ursache Lauftest 25.10. (Nutzer 1):** Beim Bearbeiten war „Locker“ vorausgewählt. Speichern ohne Änderung machte aus dem Test einen lockeren Lauf. Dazu verschob die Wochenauswertung auch Tests.
- **Jetzt:** Das Bearbeiten wählt die echte Art vor und baut nur bei echter Änderung um. Die Wochenauswertung fasst Tests nicht an. Ein umgewandelter oder gestrichener Test wird neu eingeplant, mit Mitteilung („… entfällt als Test → neuer Termin“).

## 5. Wiederholungs-Prüfer
Er läuft dauerhaft im großen Test über Heute, Plan, Einheiten (vor und nach dem Abhaken), Coach, Fortschritt und Mehr, für 8 Testnutzer und die Demo. Gefunden und behoben: doppelte „Woche“-Angaben im Wochenkopf (jetzt „Woche 12 · 3. Woche im Block 2“) und ein doppelter Name in der Diagramm-Legende.

## 6. Weitere Ideen
In VORSCHLAEGE.md (A–H), mit Aufwand für Englisch und Einheiten.

## 7. Weitere Fehler
- **Verbindung abgelaufen:** Hinweis auf Heute mit „Neu verbinden“; dazu ehrlich „keine aktuellen Daten seit …“.
- **Plan folgt dem echten Training:** Wochenumfang nach den letzten 4 Wochen, lange Einheiten höchstens etwa 10 min über der längsten echten, jeweils mit Begründung. Trainierst du mehr, steigt der Plan wieder. Eine schon geplante Woche wird einmal nachgeholt. Kopie der echten Daten: Nutzer 1 von 7,6 auf 5,5 h, längster Lauf höchstens 50 min; Nutzer 2 von 3,8 auf 3 h; Nutzer 5 unverändert (zu wenig Einträge, um es zu beurteilen).
- **Offene Einheiten ohne Eintrag:** einmal pro Woche auf Heute „Hast du diese Woche trainiert?“ zum schnellen Abhaken. Nach 21 Tagen gilt eine Einheit als „ohne Eintrag“.
- **Mitteilungen:** Heute bietet sie an; auf dem iPhone mit Hinweis auf den Home-Bildschirm.
- **Fehlerbericht:** hängt nur Fehler seit dem letzten Bericht an (höchstens 7 Tage).
- **Test nach Wettkampf:** Der nächtliche Daten-Check führt jetzt erst die Plan-Pflege aus. Vorher lief er vor ihr und meldete Tests, die gleich danach verschoben wurden.
- **Umwandeln in Ketten:** Es wird immer vom Original aus umgewandelt, ohne „Locker statt: Tempo statt: …“.

## Daten-Check je Nutzer
| Nutzer | Vorher (Fehlerprotokoll) | Nachher (frische Sicherung 23.11.) |
|---|---|---|
| 1 | 22.11. Test nach Wettkampf 3×; 18.11. Wert „Intervall: m“ (Schwimmen); 11.11. Erholung nach Wettkampf, langer Tag; 8.11. Erholungswoche 3×, langer Schritt | 0 Befunde, 0 Regel-Verstöße |
| 2 | 8.11. Wert „cad“ (Schwimmen), Erholungswoche 4×; 31.10. mehrere Regeln | 0 Befunde; 6 bekannte Lücken im Plan (Entscheidung 538, unverändert) |
| 5 | 8.11. Erholungswoche 5×; 31.10. Wettkampfwoche | 0 Befunde, 0 Regel-Verstöße |

Alle drei starten fehlerfrei, auch mit dem lokalen Stand der Vorversion.

## Tests
- Release-Lauf: Unit 3.396 grün, Browser 861 grün, 0 rot (WebKit iPhone und Chromium, inkl. neuem Wiederholungs-Prüfer).
- Großer Test 34 min: Simulation (36 Nutzer, 19.292 Tage) 0 Fehler. Gefunden und behoben: „Grund“ fehlte im Kopf, „nur hart gesetzt“ galt als ohne Unterschied (Entscheidung 658).
- Release: zwei Läufe wegen Tests angehalten, die nur unter voller Last rot waren (Tab-Leiste, Service Worker), einzeln grün. Die Grenzen sind jetzt an der echten Größe festgemacht (Entscheidungen 659–660).
- Entscheidungen 641–660.

# Auftrag 40: alle 15 Vorschläge eingebaut (22.11.)

**Stand:** Version **3.28.0** – veröffentlicht am 22.11. (erst Test-App, dann echte App mit Sicherung; Kopie der echten Daten aller Nutzer geprüft, Start-Test aller Nutzer ok, 10 Minuten ohne Startfehler).

## Was neu ist
| Nr. | Vorschlag | Jetzt |
|---|---|---|
| 1 | Lauf-Geh-Wechsel | Laufteile werden getrennt gewertet (Pace und Puls nur der Laufrunden, Gehpausen herausgerechnet). Ohne Runden: Hinweis statt falscher Pace. |
| 2 | Teamsport | Belastung aus der Zeit in den Pulszonen statt aus dem Ø Puls (Halbzeit und Bank drücken den Schnitt nicht mehr). |
| 3 | Intensitätsverteilung | Aus der Zeit in den Zonen, notfalls aus den Runden; nicht mehr die ganze Einheit nach Ø Puls. |
| 4 | 5-km-/10-km-Bestwert | Auch der schnellste zusammenhängende Abschnitt aus km-Zeiten oder Runden. |
| 5 | Coach: „Wie fit bin ich?“, „Bin ich übertrainiert?“ | Eigene Antworten mit Form, Fitness, Ampel, Ruhepuls und Belastung, immer mit Arzt-Hinweis. |
| 6 | Coach: Zonen | Je Sportart: Laufen Puls, Rad Watt und/oder Puls, Schwimmen Tempo pro 100 m. |
| 7 | Tests ohne Wettkampfziel | Coach schlägt einen Test vor (mit „Übernehmen“), wenn der letzte über 8 Wochen her ist. |
| 8 | Verschobener Test passt nicht mehr | Coach nennt einen neuen Termin (oder „frühestens ab …“). |
| 9 | Zonen aus Wettkämpfen | Auch aus Rad- und Laufteil im Triathlon und aus Freiwasser. |
| 10 | Dauer überall gleich | „45 min 30 s“, „1 h 10 min“ statt „45′“, „1:10“ oder „45,5 min“. |
| 11 | „kürzer“ bei roter Ampel | Coach bietet stattdessen Pause an. |
| 12 | Hinweis „Neue Version“ | Verdeckt kein offenes Fenster mehr. |
| 13 | Ladezeit | App-Code in 4 Teile zerlegt (vorher 1,5 MB in einer Datei); nach Updates lädt nur, was sich geändert hat. **Abweichung:** nicht erst bei Bedarf nachgeladen, weil die App offline sicher starten muss (Entscheidung 635). |
| 14 | „= 45 min 30 s“ unter Zeitfeldern | Steht dauerhaft da, auch nach dem Öffnen. |
| 15 | Dauer-Feld | Zeigt gespeicherte Werte als Zeit („45:30“ statt „45,5“). |

## Beim Release gefunden
- **Echter Fehler (nie live):** Durch die Aufteilung (13) kam der Coach-Teil erst nach dem Laden der Seite. Ging das Netz genau dann weg, startete die App nicht. Jetzt kommen alle Teile mit der Seite (Entscheidung 638, neuer Test).
- Drei Tests angepasst (alte Schreibweise „1:10“, Zeitablauf im Test, Dateiname) – Entscheidungen 638–640.

## Tests
- Unit: 3.386 grün. Browser: 846 grün (WebKit iPhone und Chromium).
- Großer Test 26 min: 9 Abläufe nur unter Last rot, einzeln alle 189 grün (Entscheidung 637).
- Echte Daten (Kopie): alle 3 Nutzer laden und starten fehlerfrei, auch mit dem Stand der Vorversion.

# Auftrag 39: Zeiteingabe ohne Doppelpunkt, Wettkampf zählt als Test, große Fehlersuche (21.11.)

**Stand:** Version **3.27.0** – veröffentlicht am 21.11. (erst Test-App, dann echte App mit Sicherung; Kopie der echten Daten aller Nutzer geprüft, Start-Test aller Nutzer ok, 10 Minuten ohne Startfehler).

## 1. Zeit und Pace ohne Doppelpunkt
- **Vorher:** fünf verschiedene Leser für Zeiten, getrennte Kästchen (Std/Min/Sek) neben Feldern mit Komma-Tastatur; „5,3“ als Pace nicht erkannt; „45,30“ in Minuten-Feldern = 45,3 min; km-Abschnitte mit Tastatur ohne Komma; Haltezeit „1:30“ = 1 Wiederholung.
- **Jetzt (alle Zeitfelder, eine Regel):** nur Ziffern tippen, der Doppelpunkt kommt von selbst (530 → 5:30, 14530 → 1:45:30). Komma, Punkt und Doppelpunkt gehen auch. **Zwei Ziffern nach dem Trenner = Sekunden** („45,30“ = 45 min 30 s), **eine Ziffer = Zehntel-Minute** („45,5“ = 45 min 30 s). Unter dem Feld steht „= 45 min 30 s“. Unklar („5,3“, „5:3“, Wettkampf „9:30“) → Nachfrage mit zwei Knöpfen, gespeichert wird erst danach.
- Gilt für: Einheiten-Werte, Testfelder, km-Abschnitte, Ablauf (Wiederholung, ganzer Satz, Pause, Abschnitte), Kraft (Haltezeit, Pause), Schwellen, Ziele (Wunsch- und Ergebniszeit), Wettkampf (Zeit, Teilzeiten), Fragebogen, Können/Teamsport, Plan bearbeiten, Morgenwerte.
- Entscheidungen 608–610.

## 2. Wettkampf zählt als Test
- **Ursache (Nutzer 1, Lauftest 18.4. nach Halbmarathon 4.4., dazu Schwimm-/Radtest 13./14.4.):** Der Plan kannte ein gemeinsames Testdatum für alle Sportarten, Wettkämpfe zählten nicht, die Sperre danach galt 7 Tage und nur für A/B.
- **Jetzt (alle Nutzer, alle Sportarten):** Rhythmus je Sportart; ein A/B-Wettkampf zählt als Test seiner Sportarten; 14 Tage nach jedem Wettkampf kein Test (fällige werden dahinter verschoben). Zonen aus dem Ergebnis: Laufrennen → Schwellen-Pace (VDOT) und -Puls, Schwimmen im Becken → CSS, Rad-Event mit Watt → FTP. Bestehende Pläne repariert die Plan-Pflege (mit Kopie der Daten von Nutzer 1 geprüft: 3 Tests → 0). Entscheidungen 612–615.

## 3. Gefundene Fehler (alle behoben, jeder mit Test, der vorher scheiterte)
| Nr. | Fehler | Schwere | Ursache |
|---|---|---|---|
| 1 | Tests 9–14 Tage nach einem Wettkampf, Wettkampf zählte nicht als Test | mittel | ein Testdatum für alle Sportarten, Sperre nur 7 Tage |
| 2 | Verschobener Test → 2 Wochen später schon der nächste (Schwimm-/Radtest doppelt) | mittel | Rhythmus nach Verschieben auf alten Termin zurückgesetzt |
| 3 | Teamsport-Training bearbeitet → still zum Lauf umgebaut | hoch | Sportart-Auswahl kannte keinen Teamsport, „Laufen“ vorgewählt |
| 4 | Plan-Änderung stürzte ab bei einer Einheit nur mit Übungsliste | mittel | Plan-Prüfung erwartete immer Bausteine |
| 5 | Zeit mit automatischem Doppelpunkt wurde beim Verlassen nicht gespeichert | hoch (neu, vor Release gefunden) | Browser lösen nach Skript-Änderung kein „change“ aus |
| 6 | Coach-Woche: abgehakt ohne Werte zählte 0 h („−100 %“) | mittel | Woche ignorierte „wie geplant“ (Belastung/Scores nicht) |
| 7 | „Fast alles geschafft (1 von 1)“ | klein | fehlender Fall „alles“ |
| 8 | Ruhetag-Begründung: „morgen steht …“ meinte übermorgen | klein | „morgen/gestern“ vom Ruhetag statt von heute aus |
| 9 | „Wie viele Stunden … diese Woche?“ → Antwort zum heutigen Tag | mittel | „wie viele“ galt als Tagesfrage |
| 10 | „Wann ist der nächste Test?“ → „geschätzt: 5.“, kein Termin, fremde Sportarten | mittel | Anzahl statt Namen, Plan nicht gelesen |
| 11 | „Was mache ich heute?“ → Antwort beginnt mit „Ja:“ | klein | Ja/Nein-Antwort für jede Tagesfrage |
| 12 | Plan-Dashboard „0,0 min“, „405,0 Minuten“ | klein | feste Kommastelle |
| 13 | Daten-Check und Plan-Pflege stürzten bei gespeicherter Dauer mit Kommastelle ab (83,7 min) | hoch (neu, beim Release mit Kopie der echten Daten gefunden, nie live) | gespeicherte Zahl lief durch die neue Zeit-Lesart |

## Tests
- Neu: Unit `auftrag39-zeit` (Regel), `auftrag39-wettkampftest` (Plan, Pflege, Zonen; vorher rot), `auftrag39-fehler` (Coach; vorher rot). Browser (WebKit iPhone + Chromium, echte Eingabe): `auftrag39-zeit` (jedes Zeitfeld, Nachfrage, Überlauf 320 px/28 px, hell/dunkel), `auftrag39-rundgang` (19 Nutzer: alle Tabs und Unterseiten, Einheiten abhaken/ändern/Rückgängig, Umwandeln, Coach mit Folgefrage, Score, Ziel, dunkel, große Schrift, 320 px, Querformat, App-Wechsel), `auftrag39-knoepfe` (jeder sichtbare Knopf jedes Bildschirms und seiner Fenster, 648 Klicks). Coach-Fragen: 16 Nutzer × 20 Fragen.
- Alte Tests angepasst (getrennte Zeitkästchen → ein Feld).
- **Großer Test: 36:31 min** (Unit 3352 grün, Simulation 36 Nutzer / 19.292 Tage / 0 Fehler, Browser 408 Läufe; 5 rot nur durch die Test-Umgebung: fester Port, Zeitlimit, Last – behoben, einzeln grün).
- **Release:** 3354 Unit-Tests und 842 Browser-Tests grün. Zwei Läufe angehalten: Bildrate-Test unter Last (kein App-Fehler, Test misst neu) und Fehler 13 (behoben).
- **Vorschläge:** 15 Stück in VORSCHLAEGE.md (dabei die 4 offenen aus Auftrag 35), nichts davon eingebaut.

# Auftrag 38: Ablauf vollständig, Gemachtes gilt überall, einfacher eintragen, Umwandeln mit Vorschau (19.11.)

**Stand:** Version **3.26.0**, veröffentlicht am 19.11. (erst Test-App, dann echte App mit Sicherung; 3326 Unit-Tests und 788 Browser-Tests grün, Start-Test aller Nutzer ok, 10 Minuten ohne Startfehler).

## Was war falsch (Ursachen, gelten für alle Nutzer)
- **Ablauf unvollständig:** `isIvStep` nahm nur Hauptteil-Schritte ab Zone 3. Lockere Hauptteile (z. B. 20 min locker vor Hügelsprints, Lauf-ABC, Erholungsblöcke) fehlten, die Summe stimmte nicht.
- **Gemachtes nicht überall:** Zahlen wurden übernommen, aber Titel, Liste und Coach blieben beim Plan; nicht Eingetragenes zählte in der Summe gar nicht.
- **Kurze Stücke:** Hügelsprints über 10 s bekamen Puls- und Pace-Ziel (betraf alle Bibliotheks-Einheiten mit Stücken unter 1 min bzw. bergauf).

## Jetzt
- **Ganze Einheit im Ablauf** (alle Sportarten): Aufwärmen, alle Hauptteile (auch Zone 1-2), Technik, Sätze, Ausklang; darunter „Summe: geplant 41 min · gemacht 41 min“. Lockere Teile werden gegen ihre Zone bewertet, zählen aber nicht als Intervall. Gespeicherte Daten bleiben gültig (ältere Listen werden beim Lesen ergänzt).
- **Gemacht gilt überall:** z. B. Titel „Rad 3 × 10 min Sweet Spot, statt 2 × 8 min“, Kopf „Geplant 45 min · Gemacht 58 min · Anders als geplant: 3 × 10 min statt 2 × 8 min; Aufwärmen 10 statt 15 min“. Coach-Bewertung: „3 × 10 min statt 2 × 8 min – mehr Sweet-Spot-Zeit (30 min statt 16 min), gut.“ Chat, KI-Kontext, Belastung, Woche, Scores nutzen dasselbe.
- **Einfacher eintragen:** Satz-Fenster oben Wiederholungen [−] n [+], Dauer, Pause, dann Werte. Neuer gleicher Satz → „Zu Satz 1 hinzufügen?“, gleiche Sätze zusammenführen. Knöpfe „Wie geplant gemacht“/„Anders gemacht“ entfernt; abgehakt ohne Werte gilt still „wie geplant“. Frühere Änderungen bleiben als Hinweis.
- **Minuten und km zusammen** („41 min · ca. 6 km“, „4×3 min (ca. 650 m)“), Umschalter entfernt.
- **Kurze Wiederholungen/bergauf:** ohne Puls bzw. Tempo, dafür „kräftig, fast maximal (Gefühl 9/10), langsam zurückgehen“; Bewertung danach.
- **Umwandeln:** Vorschau Vorher → Nachher (Titel, Dauer, Ablauf, Belastung, Woche, Bedenken), andere Vorschläge, „Rückgängig“ im Hinweis, „Original wiederherstellen“ an der Einheit (auch nach Neuladen).
- Entscheidungen 600–607.

## Tests
- Neuer Browser-Test `auftrag38` (WebKit iPhone + Chromium, echte Eingabe): Lauf mit Hügelsprints (10 + 20 + 6 × 10 s + 5 min, Summe 41 min, Sprints ohne Puls/Pace), Rad 2 × 8 → 3 × 10 mit [+] und Aufwärmen 10 (Titel, Geplant/Gemacht, Coach, Chat, KI-Kontext, Belastung steigt), „Zu Satz 1 hinzufügen?“, Umwandeln (Vorschau, andere Vorschläge, Rückgängig, Original nach Neuladen), Heute ohne Umschalter bei 320–430 px. Überlauf-Test für die neuen Fenster (320 px, 28 px Schrift, hell/dunkel).
- Unit `auftrag38` (10), u. a. **alle Bibliotheks-Einheiten**: keine Puls-Ziele unter 1 min, kein Tempo bergauf, Ablauf-Summe = Dauer.
- **Simulation:** 30 Testnutzer, je 6 Wochen, 259 geänderte Einheiten (Wiederholungen, Dauer, Sätze, Aufwärmen): Titel, Coach, KI-Kontext, Belastung, Woche, Scores und Summe überall das Gemachte, 0 Fehler.
- Alte Tests angepasst statt doppelt (Intervalle, km, Umwandeln, Auftrag 29/37).
- **Großer Test: 15 min**: Typprüfung, alle Unit-Tests, Simulation 36 Nutzer (19.292 Tage, 0 Fehler) + 30 Nutzer, 144 Browser-Abläufe. 3 rot (alte Erwartung „nicht gemacht“, WebKit-Timing) → angepasst, einzeln grün.

---

# Auftrag 37: Einheiten übersichtlich – ein Ablauf, Bearbeiten im Fenster, Nachtragen mit Datum (17.11.)

**Stand:** Version **3.25.0**, **veröffentlicht am 18.11.** (alle Tests grün: 3.316 Unit, 796 Browser; erst Test-App, dann echte App; beide vorher gesichert; alle 3 Nutzer laden und starten fehlerfrei; 10 Minuten ohne Startfehler). Beim 1. Release-Lauf gefunden und behoben: Die Uhr meldete eine Schwimm-Bahn mit 0 m als Wiederholung, jetzt zählt sie als Pause (Nr. 599). Die Daten auf dem Server sind dabei unverändert geblieben.

## Was war vorhanden, was war falsch
- Zwei Listen für dasselbe: „Abschnitte“ (Auftrag 35) und „Intervalle“ (Auftrag 36), dazu oben noch einmal die Schritte. Bearbeiten in drei Ebenen (Wiederholung → „Lage, Hilfsmittel …“ → „Satz bearbeiten“).
- **Fehler „alles klappt auf“, Ursache gefunden:** `refreshSheet` (kit.ts) merkte sich offene Bereiche über den Text der Überschrift. Alle gleich lautenden Bereiche gingen nach jeder Änderung auf (nachgestellt: 7 statt 3 offen). Behoben über feste Kennungen – gilt für alle Fenster der App.
- Nachtragen-Liste ohne Datum. Gesamtwerte bei Intervall-Einheiten nur aus Aufwärmen + Ausklang.

## Jetzt
- **Ein Ablauf** je Einheit (alle Sportarten): Aufwärmen → Sätze mit Wiederholungen → Ausklang; Schwimmen mit Einschwimmen/Technik/Ausschwimmen; Kraft: Übungen. Jede Zeile: Ist fett, Soll grau, Urteil (✓, zu hart, zu locker, kürzer, anders, wie geplant). Abweichung sichtbar: „1:41 · 1:41/100 m · Kraul (statt Brust)“, Satz-Kopf „3 × 100 m (2 Brust, 1 Kraul) · 2/3 im Ziel“.
- **Antippen → Fenster nur für diesen Teil** (Satz, Wiederholung, Abschnitt, Übung) mit allen Feldern und Knöpfen; in der Liste klappt nichts mehr auf. Das Diagramm oben öffnet dasselbe Fenster. „+ Abschnitt / Satz hinzufügen“; Aufwärmen/Ausklang ändern, löschen, wieder hinzufügen.
- **Wie geplant gemacht:** füllt den ganzen Ablauf (markiert „wie geplant“, nicht gemessen – zählt nie für Tempo, Scores, Kraul-Tempo). Uhrdaten haben Vorrang.
- **Rückgängig:** nach Löschen, „wie geplant“ und jedem Fenster ein Hinweis mit „Rückgängig“; mehrere Schritte nacheinander (auch „↶ Rückgängig (n)“ oben).
- **Seite:** Kopf (Wochentag + Datum, Geplant/Gemacht, Urteil) → Ablauf → Gesamtwerte (eingeklappt bei Uhr-Daten, jetzt aus dem ganzen Ablauf) → Coach-Bewertung → Gefühl/Notiz → „Mehr“.
- **Nachtragen:** „Mo, 12.10. · Rad locker 60 min“, nach Datum sortiert, je Einheit „Nachtragen“ oder „Nicht gemacht“.
- Gespeichert wird in den bisherigen Feldern: keine Umstellung deiner Daten (Entscheidungen 590–598).

## Bilder (Schwimm-Einheit, iPhone-Breite)
| Vorher (3.24.0) | Nachher (3.25.0) | Fenster einer Wiederholung |
|---|---|---|
| ![vorher](docs/auftrag37-vorher.png) | ![nachher](docs/auftrag37-nachher.png) | ![Fenster](docs/auftrag37-fenster.png) |

## Tests
- **Fehler nachgestellt, bevor er behoben wurde:** 1 Wiederholung geändert → 7 Bereiche offen statt 3. Jetzt prüft der Test, dass beim Ändern nichts aufklappt.
- **Neuer Test `auftrag37`** (WebKit iPhone + Chromium, echte Eingabe): Schwimmen 3 × 100 m Brust → 2. auf Kraul → Bewertung gegen das Kraul-Ziel; Pull Buoy und Titel für den Satz; Einschwimmen/Ausschwimmen ändern, löschen, wieder hinzufügen; Gesamtwerte passen zum Ablauf; „Wie geplant gemacht“ + eine Abweichung; Rückgängig (einzeln und mehrere Schritte); Diagramm öffnet dasselbe Fenster; Nachtragen zeigt Datum und öffnet den richtigen Tag; dasselbe für Laufen, Rad, Koppel (Rad + Lauf) und Kraft; Überlauf 320/375/430 px mit großer Schrift für Liste und Fenster.
- **Unit-Tests `ablauf37`** (7): Reihenfolge, Soll/Ist/Urteil, wie geplant zählt nie als Messwert, Uhr hat Vorrang, Gesamtwerte mit Pause, Löschen/Hinzufügen, Kraft.
- **Alte Tests angepasst statt doppelt:** Intervalle (22, 36), Abschnitte (35), km-Ansicht, Kraft, Vorlagen, Extra-Einheiten – gleiche Prüfungen, neuer Weg über das Fenster.
- **Alle Browser-Tests** (~940, beide Browser): grün. 4 Teile parallel (50 min); 69 dort rote Tests waren Überlast bzw. fest eingestellter Port – die 25 Dateien nacheinander wiederholt: 442 grün (28 min).
- **Großer Test: 18:26 min** (Ziel unter 45 min). Simulation 36 Nutzer, 19.292 Tage, 33.703 Aktionen, 0 Fehler; 134 Browser-Abläufe; Typprüfung; alle Unit-Tests. Rot nur unter Last: 3 Push-Server-Tests und 2 WebKit-Starts – einzeln wiederholt grün.

---

# Auftrag 36: Intervalle bearbeiten, Scores, Prognose, große Simulation (16.11.)

**Stand:** Version **3.24.0**, **veröffentlicht am 16.11.** (alle Tests grün; erst Test-App, dann echte App; beide vorher gesichert; alle 3 Nutzer starten fehlerfrei, auch vom alten Stand aus). Beobachtung danach am 17.11. nachgeholt: keine Startfehler seit dem Hochladen (ganze Nacht). Beim 1. Release-Lauf gefunden und behoben: „zusätzlich“ fehlte in der Intervall-Liste, Enter verlor unter Last den Fokus (Nr. 589).

## 1. Intervalle nach dem Training
- **Vorher:** jede Wiederholung eine große Karte (7 Felder + 5 Knöpfe); Titel, Lage, Hilfsmittel nicht änderbar; „4 × 100 m in 1:55“ ohne Pace bekam kein Urteil.
- **Jetzt:** Sätze gruppiert („4 × 100 m Kraul · Pull Buoy“), eine Zeile je Wiederholung (Werte + Urteil), Antippen öffnet die Details. „Ganzer Satz gleich“ (Dauer, Pace/Watt, Puls), einzelne Wiederholungen abweichend. Je Satz bzw. Wiederholung: Titel, Lage (Kraul, Brust, Rücken, Delfin, Lagen, Technikübung, Beine), Hilfsmittel (Pull Buoy, Kickboard, Paddles, Flossen, keine), Zone; Laufen/Rad: Art (bergauf, Fahrtspiel, Steigerung …) und Untergrund. Sätze hinzufügen, löschen, verschieben, Wiederholung hinzufügen.
- **Das Programm versteht es:** Bewertung gegen das tatsächlich Gemachte (Pull-Tempo, Brust-Tempo, andere Zone; bergauf ohne Tempo-Ziel). Kraul mit Pull Buoy zählt nicht als „Kraul am Stück ohne Hilfsmittel“, sondern als „mit Pull Buoy am Stück“ und nur abgeschwächt für die CSS; Kickboard/Beine = Beinarbeit; Flossen nie fürs Kraul-Tempo. Schwimm-Stufen und Bestwerte nutzen das. Coach (Bewertung und KI-Kontext): „Die 4 × 100 m Kraul hast du mit Pull Buoy statt ohne Hilfsmittel geschwommen – zählt nicht als Kraul am Stück …“.
- **Kraft:** „Wie letztes Mal (Datum: 5 Übungen mit Gewichten)“ übernimmt Übungen und Gewichte; Ändern, Tauschen, Hinzufügen gab es schon.

## 2. Scores
**Kraft-Score neu** (vorher nur Regelmäßigkeit; die „Steigerung“ las ein Feld, das nie gefüllt wurde): Regelmäßigkeit 30 %, Umfang je Bereich 20 %, Abdeckung Triathlon 15 % (Beine/Hüfte, einbeinig/Stabilität, Rumpf, Zug, Druck), Steigerung 20 % (Epley, bester Satz, Körpergewicht bei Übungen ohne Gewicht, unter 18 nur ab 6 Wdh., kein Maximaltest), Dauer 15 %. Ohne Übungen: „Nur Regelmäßigkeit bekannt“ + Hinweis (Vorlage oder „Wie letztes Mal“).

| Wert | Ergebnis | Grund |
|---|---|---|
| Effizienz locker | nicht (bleibt angezeigt, 0 %) | hängt stark an Hitze, Müdigkeit, Strecke, Uhr; fließt schon gedämpft in die Schwellen-Schätzung |
| Puls-Erholung in Intervallpausen | nicht | hängt an Pausenlänge und Puls-Verzögerung der Uhr; steht in der Bewertung |
| Umfang/Regelmäßigkeit (Ausdauer) | nicht | steckt in der Gesamt-Form (CTL), sonst doppelt; bei Kraft ja |
| Schritt-/Trittfrequenz | nicht | Stil, kein Leistungsmaß |
| Laufleistung (Watt) | nicht | je Uhr/Sensor anders gerechnet, nicht vergleichbar |
| NP | **aufgenommen** (kein neues Gewicht) | ersetzt Ø-Watt bei harten welligen Fahrten (VI 1,02–1,15) in der FTP-Schätzung; bildet die Belastung besser ab; sehr unruhige Fahrten mit mehr Unsicherheit |
| Höhenmeter-Leistung | nicht | geländeabhängig; Hügel werden schon herausgerechnet |
| Schwimmen mit/ohne Hilfsmittel | **aufgenommen** | Kraul ohne Hilfsmittel voll, Pull Buoy abgeschwächt (+5 s, 4-fache Unsicherheit), Beine/Flossen nie |
| Schwimm-Puls | nicht | Handgelenk-Puls im Wasser unzuverlässig |
| SWOLF | nicht | Mischung aus Zeit und Zügen, doppelt zu CSS und Meter pro Zug |
| Freiwasser | nicht im Score | Bedingungen (Strömung, Neo) zu verschieden; in der Prognose ja |

**Gesamt-Form geprüft:** bleibt Trainingsbelastung (CTL) zum Ziel. Frische (TSB) schwankt täglich und ist je Phase gewollt hoch oder niedrig; Leistungs-Scores stehen getrennt und fließen in die Prognose – beides würde täuschen bzw. doppelt zählen. Neu: „Warum?“ mit CTL je Sportart, TSB und dieser Erklärung.

## 3. Prognose
Geprüft (Test `auftrag36-prognose`, 18 Fälle): Daniels-VDOT-Tabelle (VDOT 30–70, 5 km–Marathon) ±1 %, Riegel 1,06, Schwellen-Pace ≈ T-Pace (±3 %), Rad-Physik (200 W Rennrad 32–35 km/h, 250 W Zeitfahrrad 39–42 km/h), Wechselzeiten, Freiwasser +3 %, Neo −4 bis −6 %, 6 Alters-/Geschlechtsgruppen × 3 Niveaus × 8 Ziele (realistische Bereiche, stärker = schneller, länger = länger). Keine Rechenfehler gefunden. Erklärte Abweichungen:
- Ohne lange Läufe ist der Marathon > 5 % langsamer als Daniels (Riegel-Exponent bis 1,15) – gewollt, Daniels setzt Ausdauer voraus.
- Die Schwelle aus VO2max liegt ~3 % schneller als Daniels' T-Pace (App: Tempo für ~60 min) – innerhalb der Unsicherheit.
- Sprung/Pause/Krankheit: Training mit eigenem Trend ≤ typische Entwicklung < nach 6 Wochen Pause; krank nie schneller; gleiche Werte = gleiche Zeit.

**Dein Fall:** 5:39/km kommt aus lockeren Läufen hochgerechnet („Trend“), nicht gemessen (≈ VDOT 35); VO2max 57 der Uhr passt zu ca. 3:48/km. Jetzt: ehrlicher Hinweis in der Prognose, breiterer Bereich, Lauftest als erster Tipp, und der Coach schlägt vor, eine passende Laufeinheit durch den 30-min-Lauftest zu ersetzen (bei dir: 22.11. statt des langen Laufs). Allgemein für alle Nutzer: über 15 % Abstand oder nur hochgerechnet → Hinweis + Test.

## 4. Plan-Regeln (Daten-Check)
Die gemeldeten Fälle sind behoben, Ursachen im allgemeinen Code:
| Fund | Ursache | Fix |
|---|---|---|
| „Locker nach dem Wettkampf“ (Nutzer 1, 10.11.) | Neu-Planen nach einem Rennen kannte nur künftige Ziele; „Lauf-Qualität vor dem Laufziel“ setzte Intervalle direkt danach | Rennen der letzten 14 Tage zählen; Qualität nie in die lockeren Tage nach einem Rennen |
| „Erholungswoche zu niedrig/hoch“ (Nutzer 2, 5) und „lange Einheit +10 min“ | Bezug war eine gekürzte Woche (Coach, Ampel, Tagesanpassung) oder fiel ganz weg → Rückkehr zum Plan = „Sprung“ | Bezug = geplanter Wert; geplante reduzierte Wochen weiter ohne Bezug |
| Erholungswoche über 78 % | „Stufe wiederholen“ (Kraul lernen) und Schwimm-Stufen-Update setzten in der Erholungswoche wieder die volle Einheit ein | kürzere Dauer bleibt (zwei Stellen) |
| Erholungswoche „32 %“ nach dem Hauptrennen | Vergleich mit einer Aufbauwoche vor dem Rennen | kein Vergleich über ein A/B-Rennen |
| Wettkampfwoche: Intervalle am Montag | „Nachholen“ prüfte die Woche nicht | gleiche Sperre wie der Generator |
| „Nach langem Tag …“, harte Tage | entstanden in der Simulation nur durch eigene Änderungen mit „Trotzdem übernehmen“ | gelten nicht mehr als Plan-Fehler (die Pflege ließ sie schon) |

Echte Daten (Kopie vom 14.11., Stand 16.11.): alle 3 Nutzer laden fehlerfrei, **Daten-Check grün** (0 Befunde). Bei Nutzer 2 meldet die Plan-Pflege 6 Wochen ohne Tempolauf vor dem HM – ehrlich als Lücke markiert (kein freier Lauftag neben Spielen), kein Fehler.

## 5. Großer Test
Ein Aufruf: `node scripts/grosser-test.mjs` (16 Kerne, alles parallel).

| Teil | Dauer |
|---|---|
| Build (einmal) | 0:03 min |
| Typprüfung | 0:13 min |
| Unit-Tests (3 Worker) | 11:53 min |
| Simulation (18 Teile) | 15:07 min |
| Browser (3 Teile, je eigener Server) | 2:38 / 3:41 / 3:54 min |
| **Gesamt** | **15:11 min** (Ziel < 45) |

- **Simulation:** 36 erfundene Nutzer (10 Test-Personen + 26 Daten-Fälle: alle Sportarten und Ziele, 16–64 Jahre, w/m, Teamsport, Uhr bzw. Handeingabe, fleißig bis faul), 12–24 Monate = **19 292 Tage, 33 703 Aktionen** (10 678 erledigt, 4 072 ausgelassen, 806 verschoben, 720 umgewandelt, 1 293 gekürzt, 1 148 anders gemacht, 977 Intervall-Einheiten, davon 285 mit Pull Buoy und 337 mit eigenem Titel, 1 056 Krafteinheiten mit Übungen, 641 mit Abschnitten, 152× krank, 73× verletzt, 41 Wettkämpfe, 12 Tests, 3 306 Coach-Fragen). Ergebnis im letzten Lauf: **0 Fehler, Daten-Check jede Nacht grün**.
- **Browser:** 37 Abläufe × WebKit/iPhone + Chromium (Intervalle mit Pull Buoy/Titel/Satz gleich, Satz hinzufügen/verschieben/löschen, Laufen bergauf, Kraft „Wie letztes Mal“, Kraft-Score, Gesamt-Form „Warum?“, Prognose-Hinweis, Umwandeln, km-Ansicht, Abschnitte, Coach schreiben, Plan bearbeiten, Grundabläufe); 74 Läufe. Im letzten Lauf 2 Zeitüberschreitungen beim Seitenaufruf unter Volllast (app „Einheit abhaken“, Plan-Übersicht 28 px) – einzeln wiederholt grün (34/34). Danach Runner entlastet (Simulation 8 Worker, Zeitlimit 90 s).
- **KI:** im großen Test keine KI-Aufrufe (eingebaute Coach-Engine + Zahlen-Prüfer auf jeder Antwort). Ein voller KI-Lauf nur bei Coach-Änderung und Schlüssel – lokal kein Schlüssel, darum übersprungen.
- **Beschleunigt:** Build nur einmal; Simulation in 18 Teilen statt einer Datei (Vitest verteilt nur Dateien); Browser in 3 Teilen mit je eigenem Server statt 1 Worker. Langsamste Teile: Simulation „erfahren-md-marathon“ 460 s (78 Wochen), Unit „longterm30 olympisch-erfahren“ 44 s, Browser „Umwandeln“ 70 s unter Last.

**Gefundene Fehler (vorher → nachher)**, jeder als dauerhafter Test (`auftrag36-regeln`, `auftrag36-kraft`, Simulation):
| Fund | vorher | nachher |
|---|---|---|
| nächtlicher Daten-Check (Simulation, alle Nutzer) | ein Testnutzer allein 95 Befunde/Jahr; erster Gesamtlauf: lange Einheit, Erholungswoche, Wettkampfwoche, harte Einheiten | 0 |
| Locker nach dem Wettkampf (frischer Plan nach Rennen) | Intervalle 3 Tage nach dem 10-km-Rennen | locker |
| Nachholen in der Wettkampfwoche | Schwellen-Intervalle am Montag vor dem Sprint | nicht mehr |
| Erholungswoche durch Lernstufen | 16 → 28 min, 79–82 % | kürzere Dauer bleibt |
| Kraft-Score | sprang 30 → 2 bzw. 8 → 31 | gleitend, eingeblendet |
| Kraft-Score ignorierte Einheiten ohne RPE | nur Regelmäßigkeit | zählt |
| Score-Obergrenze ohne Test | Sprung +13 bei der 15. Einheit | stufenlos |
| Lauftest-Vorschlag | blockiert durch geplanten Schwimm-Test | nur Lauftest blockiert |
| Nach dem Verschieben eines Satzes | falscher Satz aufgeklappt | wandert mit |
| Intervall „4 × 100 m in 1:55“ | kein Urteil (nur mit Pace) | Pace aus Zeit und Strecke |


## Tests während der Arbeit
Neu: `auftrag36-intervalle` (8), `auftrag36-kraft` (4), `auftrag36-prognose` (18), `auftrag36-regeln` (9) Unit-Tests; Browser `auftrag36-intervalle` (5) und `auftrag36-ablaeufe` (5) je WebKit + Chromium; Simulation `tests/sim` (36 Nutzer). Angepasst: `auftrag22.spec` (neue Intervall-Anzeige).

---

# Fix 3.23.1: Heute-Karte zu schmal und riesig hoch (14.11.)

**Stand:** veröffentlicht als 3.23.1 (14.11.): alle Tests grün (750), Sicherungen von Test- und echter App, erst stamio-test, dann echte App; Start-Test im Browser ok, 10 Minuten ohne Startfehler.

- **Fehler:** In der Heute-Karte rutschte der Umschalter „Minuten | km“ mit dem Haken in die Titelzeile. Der Titel schrumpfte auf 21–38 px, die Karte wurde 700–1100 px hoch.
- **Fix:** Titel (mit Symbol) füllt immer die erste Zeile, nur der Haken daneben, Umschalter darunter. Plan-Zeile und geöffnete Einheit hatten das Problem nicht (Umschalter steht dort schon unter dem Text) – jetzt dauerhaft mitgeprüft.
- **Warum die Überlauf-Tests es nicht fanden:** 1. Sie prüften nur, ob etwas über einen Rand ragt. Ein zu schmaler Titel ragt nirgends heraus, er wird nur schmal und hoch. 2. Ihre Testdaten hatten keine einzige Lauf-/Radeinheit mit Aufbau – der Umschalter erschien dort nie. 3. Der Test zum Umschalter (Auftrag 35) prüfte nur „ragt nichts heraus“ und nutzte einen kurzen Titel.
- **Neue Tests:** `auftrag35-umschalter-breite.spec.ts` (WebKit + Chromium, 320/375/390 px, Schrift normal und groß, Minuten und km, 4 der längsten und 2 häufige Titel aus echten Plänen): Titelbereich ≥ 60 % der Kartenbreite, Umschalter unter dem Titel, Karte nur eine Zeile höher, höchstens ca. 160 px (mittellange Titel) bzw. 210 px (längste). Mit altem Stand: 9 von 12 rot. Alle Überlauf-Tests prüfen jetzt zusätzlich „Text in zu schmalem Bereich“, und ihre Daten enthalten die lange Radeinheit.
- **Dabei gefunden und behoben (gleiche Ursache):** Datum auf Heute neben langem Zielnamen (12 px breit), Verbindungen und Notizen bei 130 % Zoom (≈ 40 px), Prognosen, Plan-Zeilen und -Kennzahlen, Wochenstunden, Fragebogen bei sehr großer Schrift. Bei normaler Größe sieht alles gleich aus wie vorher (Bildvergleich).

# Auftrag 35: Abschnitte, Kontraste, km-Ansicht, Einheit umwandeln, Puls-Zonen (13.11.)

**Stand:** Version **3.23.0**, **veröffentlicht am 14.11.** (erst Test-App, dann echte App; beide vorher gesichert, alle 3 Nutzer starten fehlerfrei, auch vom alten Stand aus; 10 Minuten ohne Startfehler). Gilt für alle Nutzer und alle Sportarten. Was du am iPhone tun kannst: FUER-JONAH.md.

## Was jetzt neu ist
| # | Punkt | Was vorher da war | Was jetzt geht |
|---|---|---|---|
| 1 | Abschnitte | nur Werte für die ganze Einheit; Aufwärmen drückte den Ø-Puls, Coach sagte „locker“ bzw. „eher locker“ falsch | Aufwärmen / Hauptteil / Ausklang (Schwimmen: Einschwimmen / Technik / Hauptserie / Ausschwimmen) je mit Dauer, Strecke, Ø/max. Puls, Pace bzw. Watt/Tempo bzw. Pace/100 m. Gesamtwerte rechnen sich daraus (Σ), einfache Eingabe bleibt. Bei Intervallen zusätzlich Aufwärmen und Ausklang. |
| 1 | Uhrdaten | Pulsverlauf nur auf dem Server | Neue Aufzeichnungen speichern einen kleinen Minuten-Verlauf. Die App erkennt den Hauptteil („Hauptteil 45 min, Ø Puls 147 (Zone 2), 100 % der Zeit in Zone 2“), Grenze korrigierbar („Aufwärmen bis Minute 15“). Ältere: aus Runden der Uhr bzw. km-Splits. |
| 1 | Coach | Zone am Ø der ganzen Einheit | Zone, Zeit in der Zielzone, Pace/Watt-Vorgabe nur am Hauptteil; Aufwärmen nie „zu locker“. Auch Scores, Prognose und Effizienz-Trends (Puls-basiert). Entkopplung unverändert. |
| 2 | Haken | Haken in Hintergrundfarbe – im Glas-Design sogar auf weißem Glas statt Grün (Ursache: Glas-Regel überschrieb das Grün) | weißer, kräftiger Haken auf vollem Grün, hell und dunkel |
| 2 | Kontraste | nur die Farb-Token geprüft | neuer Test misst jeden Bildschirm wie gezeichnet (WebKit + Chromium, hell + dunkel). Behoben: alle Platzhalter in Feldern (2,3:1 → AA), Anheften-Symbol im Coach, „Z1“ in der Zonen-Tabelle, „Aktiv geplant“ |
| 3 | Minuten / km | nur Minuten | Umschalter in Heute, Plan und Einheit, Wahl wird gemerkt (alle Geräte). Intervalle: „4 × 600 m an der Schwelle in ca. 3:00 (4:55–5:15/km), dazwischen 300 m traben“. Gesamt in beiden Ansichten dieselbe Strecke. Ohne gemessene Schwelle: „geschätzt – nach Gefühl 5-6/10“. |
| 4 | Umwandeln | nur „Plan bearbeiten“ | an jeder Einheit „Lieber Intervalle / locker / länger / kürzer“: Vorschlag mit Ablauf und Tempo, Prüfung (eigene Regeln, harte Tage nebeneinander, zu viele harte Einheiten, Spiel morgen, Ampel heute, Erholungswoche). Bei Bedenken ehrlich + leichtere Variante, „Trotzdem übernehmen“ geht immer. Coach, Woche und Chat kennen danach die neue Einheit. |
| 5 | Puls-Zonen | nur nach Tests | Vorschlag aus Uhrdaten (Maximalpuls mehrmals höher bzw. Schwellenpuls aus harten 20–30-min-Abschnitten) mit vorher/nachher und „Übernehmen“, Schutz gegen Messfehler und Fußball-Spitzen. Zonen-Seite zeigt je Wert Herkunft und Datum. |

## Selbst gefunden und behoben
- Tab-Leiste: Wer „Mehr“ antippte und gleich danach eine Unterseite, wurde manchmal wieder auf „Mehr“ zurückgeworfen (verspäteter Tab-Tipp; schon in 3.22.0, fiel beim Release-Test auf). Jetzt verfällt der verspätete Tipp; bei zwei schnellen Tipps gewinnt immer der letzte, und eine gleich danach geöffnete Einheit bleibt offen (beim zweiten Release-Versuch gefunden und behoben).
- Plan bearbeiten: Ein schon bestehender Hinweis galt als „neu“, wenn sich nur eine Zahl darin änderte (z. B. nach dem Kürzen einer Einheit „Woche 5: 102 % mehr“). Jetzt ohne Zahlen verglichen.

## Weitere Stellen mit demselben Problem (ein Wert für die ganze Einheit)
| Stelle | Problem | Lösung / Stand |
|---|---|---|
| Intervall-Einheiten | Ø Puls mit Pausen | **schon gelöst** (Ø nur der Belastungen, seit Auftrag 22) |
| Schwellentests | Aufwärmen im Ø | **schon gelöst** (Testteil 20–35 min bzw. Testfelder) |
| Schwimmen | Ø Pace aus Gesamtzeit mit Pausen und Technik | Technik-Einheiten zählen schon nicht; **neu**: Hauptserie eintragbar. Vorschlag: Schwimm-Score aus der Hauptserie, wenn eingetragen |
| Koppellauf nach dem Rad | erste km langsamer, Puls höher | **neu**: Abschnitte decken das ab (Übergang als Aufwärmen) |
| Lauf-Geh-Wechsel | Ø Pace mit Gehpausen | offen; Lösung: Laufanteile aus den Runden der Uhr getrennt werten |
| Teamsport | Ø Puls mit Halbzeit und Bank | offen; Lösung: Zeit in Zonen statt Ø (liefert die Uhr schon) |
| Intensitätsverteilung (Fortschritt) | ganze Einheit nach Ø Puls in eine Zone | offen; Lösung: Zeit in Zonen, wo vorhanden |
| Bestwert 5 km | Zeit aus ganzen Läufen mit Ein-/Auslaufen | offen; Lösung: schnellster 5-km-Abschnitt aus den Splits |
| Rad-Kadenz | Ø mit Rollphasen | klein; Lösung: nur Tretphasen |
| Rad-Tempo | Ø mit Hügeln/Wind | **schon gelöst** (Tempo-Trend nur aus flachen Fahrten) |
| Lange Einheiten mit Pausen | Pausen in der Dauer | **schon gelöst** (Bewegungszeit) |

## Tests
Alle grün im Release-Lauf: 3268 Unit-Tests, 738 Browser-Tests (WebKit/iPhone und Chromium), Plan-Check und Start-Test mit Kopien der echten Daten aller Nutzer. Neu: Kontrast-Test für jeden Bildschirm, Eingabe-/Anzeige-/Überlauf-Tests für Abschnitte, km-Ansicht, Umwandeln, Puls-Zonen und 3 Tests für die Tab-Leiste (langsames Gerät).

## Grenzen (ehrlich)
- Erkennung aus dem Pulsverlauf nur für Aufzeichnungen ab 3.23.0; ältere Rad-Aufzeichnungen ohne Runden bleiben ohne Abschnitte.
- Niedrigere Puls-Zonen schlägt die App nie automatisch vor (Training ist selten ganz ausbelastet) – dafür gibt es den Test.
