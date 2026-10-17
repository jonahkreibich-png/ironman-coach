# Ergebnis

## Auftrag 14: Ampel, Fehler melden, Dropbox, Schwimmen, Intensität (17.10.)

Live in der echten App (Version 3.1.0), vorher in stamio-test. Sicherungen: `data-export/prod-vor-auftrag14.sql`, `prod-vor-auftrag14b.sql`, `test-vor-auftrag14.sql`. Geändert wurden nur Papas und dein Plan (neu berechnet ab heute, Vergangenes und Erledigtes bleibt) plus je eine Coach-Nachricht „Plan korrigiert“.

**1 Ampel:** Ursache bei Papa: Morgens kam erst nur der Ruhepuls, der Server schrieb „grün 100/100“. Später kam der Schlaf (5,3 h), die App rechnete gelb 70, zeigte aber den alten Satz. Jetzt gibt es einen Wert (0-100) aus HFV, Ruhepuls, Schlaf, Krankheit, Belastung (Form und ACWR, erst ab etwas Trainingsverlauf) und neu Gefühl/Muskelkater (Morgen-Eingabe oder intervals.icu), je gegen die persönliche Basis. Farbe kommt nur aus dem Wert (ab 70 grün, 45-69 gelb, unter 45 rot); Ring, Wort, Satz und Farbe sind gleich, die Morgen-Nachricht wird bei neuen Werten erneuert. Unter „Warum?“ hat jeder Einzelwert seine Farbe. Ohne Morgenwerte (oder nur einem Wert): „Ampel unsicher – keine Morgenwerte“. „Lockerer Lauf mit Hügelsprints“ ist jetzt Zone 2 (kurze Stücke ändern die Grundzone nicht); alle Einheiten aller Test-Personen ohne Widerspruch Titel/Zone.

**2 Fehler melden:** Status neu → in Arbeit → erledigt oder verworfen, per Knopf oder Wischen (links erledigt, rechts in Arbeit). Erledigte stehen zugeklappt unter „Erledigt“, „neu“ zählt nur Offene. Melder sehen den Status, auch bei eigenen Meldungen. Gleiche Fehler sind eine Zeile („9× Dropbox: …“, kurzer Text, „Erledigt“). Die lange Dropbox-Meldung steht nicht mehr bei den Testern, sondern als „Hinweis für dich als Betreiber“; Tester sehen bei Verbindungen nur „noch nicht fertig eingerichtet, du musst nichts tun“.

**3 HealthFit/Dropbox:** Die echte App liest Dropbox schon seit 16.10., 17:53 Uhr: Der Server kann `/Apps` durchsuchen (geht nur mit „Full Dropbox“), fand `/Apps/HealthFitExporter` und hat eine echte FIT-Datei übernommen (Rad indoor 16.10., 30 min). In der Test-Umgebung fehlen die Schlüssel noch. Das Schlüssel-Skript zeigt jetzt gar nichts mehr vom Wert und setzt auf Wunsch Test und echt zusammen (`… beide`).

**4 Schwimmen:** Papa war wieder in „Kraul lernen“, weil er am 15.10. „25 m am Stück“ eingetragen hat und die Regel „kann kraulen, aber unter 50 m → Lernstufen“ griff. Jetzt gilt: „kann kraulen“ heißt immer normales Training, Stücke so lang wie am Stück (auch 25 m). Dauer = Meter × persönliche Pace (Kraul aus CSS oder Kraul-Check, sonst etwa Brust; Beinschlag und Übungen langsamer) + Pausen + 30 s je Serienwechsel. Geschätzte CSS zählt erst ab 400 m am Stück (Papas 2:05 war viel zu schnell). Papas alte 950 m in 32 min wären ehrlich gut 36 min; jetzt z. B. 700 m in 28 min (21 min schwimmen, 7 min Pausen). Neue Frage „Welche Hilfsmittel hast du?“ (Fragebogen, Berücksichtigungen); nur Vorhandenes wird eingeplant, ohne Brett Beinschlag in Seitlage. Jede Einheit als Liste Einschwimmen, Technik, Hauptteil, Ausschwimmen, je Zeile Wdh × Strecke, Lage, Hilfsmittel, Pause, Fokus, darunter Übungen erklärt (1 Satz) und Summe.

**5 Intensität:** Schon da war (Auftrag 9/10): Phasen, Rad Sweet Spot → Schwelle/Over-Unders → VO2max/Wettkampftempo mit Leitern, Lauf Schwelle im Aufbau und Wettkampftempo je Distanz, Hügelsprints/Fahrtspiel in der Grundlage, keine harten Tage vor Spielen. Neu: harte Tage nach Niveau (Einsteiger 1, Fortgeschrittene 2, Erfahrene 3; unter 18 und ab 60 höchstens 2, kein VO2max), Spiele zählen in allen Phasen; Einsteiger in der Grundlage nichts Hartes; Tempo in der späten Grundlage (Erfahrene jede Woche, Fortgeschrittene jede zweite); 5/10 km mit VO2max (5×3 min); Rad-Event mit langen Anstiegen; Tapering mit kurzen Reizen; Sportarten im Triathlon reihum; Leitern bleiben oben nicht stehen (keine gleiche Einheit zwei Wochen hintereinander); CSS-Intervalle wechseln (100er, 200er, 50er). Neuer Plan-Check bei jedem neuen und geänderten Plan korrigiert vor dem Anzeigen: zwei harte Tage nebeneinander, zu viele harte Tage, unter 75 % locker, Wiederholung, fehlende Intensität je Phase und Sportart.

Bei dir (Beispiel): bisher in den nächsten Wochen kein einziger Qualitätslauf; jetzt in den nächsten 8 Wochen 4 Tempo-/Schwellenläufe (sonntags im langen Lauf, weil Do zwischen Mi-Rad und Fr-Spiel liegt) und 4 harte Radeinheiten, im Aufbau 12 Schwellenläufe.

Auswertung (harte/leichte Qualitätseinheiten je Phase: S Schwimmen, R Rad, L Laufen; leicht = Hügelsprints, Fahrtspiel, Steigerungen, Technik-Sets; locker = Zeit in Zone 1-2 im geplanten Training):

| Person | Niveau | Grundlage | Aufbau | Spezifisch | Tapering | locker | Fehler |
|---|---|---|---|---|---|---|---|
| jugend-langdistanz | Fortgeschritten | S 0/38, R 10/0, L 1/19 | S 0/12, R 2/0, L 2/0 | – | – | 91 % | 0 |
| vater-rad-lauf | Erfahren | R 2/0, L 0/0 | R 6/0, L 0/0 | R 5/0, L 0/0 | R 2/0, L 0/0 | 93 % | 0 |
| laeuferin-hm | Erfahren | L 0/1 | L 3/0 | L 2/0 | L 2/0 | 93 % | 0 |
| einsteiger-sprint | Einsteiger | S 0/3, R 0/0, L 0/0 | R 4/0, L 0/0 | S 0/1, R 3/0, L 0/0 | S 0/1, R 1/0, L 0/0 | 95 % | 0 |
| erfahren-md-marathon | Erfahren | S 0/20, R 6/0, L 3/10 | S 9/18, R 9/0, L 9/0 | S 9/13, R 8/0, L 9/0 | S 2/4, R 2/0, L 2/0 | 89 % | 0 |
| vater-regeln | Erfahren | S 0/18, R 12/0, L 0/18 | S 0/10, R 7/0, L 0/0 | S 0/6, R 4/0, L 0/0 | S 0/1, R 1/0, L 1/0 | 91 % | 0 |
| marathon-anfaenger | Einsteiger | L 0/0 | L 0/0 | L 0/0 | L 0/0 | 100 % | 0 |
| rad-event | Erfahren | R 14/0 | R 8/0 | R 5/0 | R 2/0 | 93 % | 0 |
| olympisch-erfahren | Erfahren | S 0/38, R 14/0, L 11/19 | S 7/15, R 8/0, L 7/0 | S 5/10, R 5/0, L 5/0 | S 2/2, R 1/0, L 1/0 | 89 % | 0 |
| langdistanz-profi | Erfahren | S 0/54, R 13/0, L 10/17 | S 9/27, R 9/0, L 8/0 | S 9/24, R 9/0, L 9/0 | S 2/7, R 2/0, L 2/0 | 91 % | 0 |
| anfaenger-ohne-kraul | Einsteiger | S 0/24, R 0/0, L 0/0 | S 0/17, R 10/0, L 0/0 | S 0/6, R 4/0, L 0/0 | S 0/1, R 1/0, L 0/0 | 95 % | 0 |
| laeufer-ohne-rad | Erfahren | L 6/11 | L 5/0 | L 5/0 | L 1/0 | 92 % | 0 |
| teamsport-ohne-spiele | Fortgeschritten | R 0/0, L 5/18 | R 0/0, L 5/0 | R 0/0, L 3/0 | R 1/0, L 1/0 | 95 % | 0 |
| fuenfzig-wenig-zeit | Fortgeschritten | S 0/21, R 10/0, L 0/9 | S 0/15, R 7/0, L 1/0 | S 0/5, R 4/0, L 1/0 | S 0/1, R 1/0, L 1/0 | 93 % | 0 |
| triathlet-50m-freiwasser | Erfahren | S 0/52, R 14/0, L 11/18 | S 3/17, R 6/0, L 4/0 | S 3/11, R 5/0, L 5/0 | S 2/2, R 1/0, L 1/0 | 92 % | 0 |
| zufall-1 | Einsteiger | – | L 0/0 | L 0/0 | L 0/0 | 100 % | 0 |
| zufall-2 | Erfahren | L 0/1 | L 3/0 | L 3/0 | L 1/0 | 93 % | 0 |
| zufall-3 | Fortgeschritten | L 5/22 | L 14/0 | L 5/0 | L 1/0 | 93 % | 0 |
| zufall-4 | Erfahren | – | L 4/0 | L 3/0 | L 2/0 | 90 % | 0 |
| zufall-5 | Einsteiger | – | S 0/4, R 2/0, L 0/0 | S 0/3, R 2/0, L 0/0 | S 0/1, R 1/0, L 0/0 | 93 % | 0 |
| zufall-6 | Fortgeschritten | S 0/17, R 4/0, L 0/17 | S 0/11, R 7/0, L 1/0 | S 0/6, R 3/0, L 1/0 | S 0/1, R 1/0, L 0/0 | 91 % | 2 |
| zufall-7 | Erfahren | – | S 1/4, R 2/0, L 1/0 | S 2/2, R 2/0, L 1/0 | S 0/2, R 2/0, L 2/0 | 87 % | 0 |
| zufall-8 | Einsteiger | S 0/29, R 0/0, L 0/0 | S 10/24, R 5/0, L 0/0 | S 4/13, R 4/0, L 0/0 | S 0/2, R 2/0, L 0/0 | 95 % | 0 |
| zufall-9 | Fortgeschritten | R 7/0 | R 4/0 | R 4/0 | R 2/0 | 90 % | 0 |
| zufall-10 | Fortgeschritten | R 0/0, L 0/0 | R 0/0, L 3/0 | R 0/0, L 3/0 | R 1/0, L 1/0 | 92 % | 0 |
| fester-wochenaufbau | Fortgeschritten | S 0/36, R 12/0, L 0/12 | S 0/26, R 4/0, L 4/9 | S 0/8, R 2/0, L 1/3 | – | 93 % | 0 |
| jonah | Erfahren | S 0/36, R 12/0, L 11/12 | S 0/32, R 11/0, L 12/12 | S 0/10, R 3/0, L 3/3 | – | 88 % | 0 |
| papa | Erfahren | S 0/36, R 11/0, L 0/19 | S 9/15, R 9/0, L 0/0 | S 5/7, R 5/0, L 0/0 | S 0/2, R 1/0, L 0/0 | 87 % | 0 |

Einziger Rest: zufall-6 (Spiel samstags, Training dienstags, 5 h): nur montags ist Platz für Hartes, deshalb wechseln sich Rad und Lauf ab (Lauf 1 von 4 Wochen). Einsteiger mit Lauf-Geh-Wechsel (marathon-anfaenger, zufall-1) laufen bewusst alles locker.

Tests: 1392 Unit- und Server-Tests, 158 Browser-Tests (Chromium, WebKit, Layout 320-430 px). Entscheidungen 162-171.

## Auftrag 13: Verbindung, Extra-Einheiten, Trends, Design (16.10.)

Alles live in der echten App (Version 3.0.0), vorher in stamio-test. Sicherungen: `data-export/prod-vor-auftrag13.sql`, `prod-vor-auftrag13b.sql`, `prod-vor-design.sql`. Daten wurden nicht verändert.

**1 HealthFit/Dropbox – drei Ursachen:**
- Ein versehentlich beim Umzug (13.10.) entstandener zweiter Server `coach-app-efc7` ohne Schlüssel lief alle 5 min auf deiner echten Datenbank, scheiterte an „TOKEN_KEY fehlt“ und blockierte den richtigen Server. **Abgeschaltet.** Seitdem läuft der Abruf wieder über den richtigen Server (geprüft).
- Deine Dropbox-App hat nur „App folder“-Zugriff (sie sieht 0 Einträge) und damit nie `/Apps/HealthFit`. **Das musst du ändern:** FUER-JONAH.md, Abschnitt B (10 min). Alternative ohne Dropbox: HealthFit → intervals.icu (ebenfalls dort).
- Viele FIT-Dateien auf einmal überschritten die CPU-Grenze des kostenlosen Tarifs. Jetzt eine Datei pro Abruf, alle 5 min die nächste.
- Unter Verbindungen: „Fehler“ mit Grund und Hilfe statt „nicht verbunden“, letzter Abruf, letzte Datei, Warteschlange, „Jetzt abrufen“, „Neu verbinden“. Getestet Datei → Dropbox → App → Einheit mit einer echten Garmin-FIT-Datei (deine Dropbox ist erst nach Schritt B lesbar).

**2 Extra-Einheiten:** Aufzeichnungen füllen jetzt auch selbst hinzugefügte Einheiten (gleicher Tag und Sport, Uhrzeit und Dauer), mit Quelle und änderbar. Keine Dubletten mehr zwischen HealthFit und intervals.icu (das war eine Lücke). Extras zählten schon für Scores, CTL/ATL/TSB, Analyse und Bewertung; neu: harte Extra-Einheit → Vorschlag, die harte Einheit am selben/nächsten Tag locker zu machen; Woche über 115 % → Vorschlag, die restlichen lockeren Einheiten zu kürzen.

**3 Trends** unter Fortschritt (4 Wochen / 3 Monate / 1 Jahr): Erholung (HFV, Ruhepuls gegen 60-Tage-Basis, Schlaf, Bereitschaft), Fitness (CTL/ATL/TSB, Umfang je Sportart, ACWR), Effizienz (Pace bzw. Watt bei gleichem Puls, Entkopplung, Efficiency Factor), locker/mittel/hart, Schwimmen (Pace, Meter pro Zug, Züge pro Bahn, Kraul am Stück), Bestwerte mit „neu“, längste Einheiten, Schlaf gegen Qualität, Gewicht. Je Trend ein Satz, antippen zeigt den Verlauf; zu wenig Daten → „ab X … verfügbar“. Bei dir gerade z. B.: Pace bei Puls 141 um 26 s/km schneller, Verteilung 66/29/5 (zu viel mittel).

**4 Design:** Deine Wahl A „Glas“ gilt jetzt für alle: Glas-Karten, schwebende Tab-Leiste mit Linse, Systemschrift, federnde Knöpfe, hell und dunkel. Kontrast nachgerechnet (Text auf Karten mindestens 5:1), dafür Blau/Grün/Orange/Rot im hellen Modus etwas dunkler. „Bewegung reduzieren“ und „Transparenz reduzieren“ (iPhone-Einstellungen) werden beachtet. Beim Prüfen behoben: Titel wurde beim Scrollen von Text überdeckt, Score-Kacheln liefen bei 320 px über. Layout-Test (320-430 px, Zoom, hell/dunkel) grün.

Tests: 1318 Unit- und Server-Tests, 152 Browser-Tests (Chromium, WebKit, Layout 320-430 px). Entscheidungen 149-161.

## Auftrag 12: Zonen, Coach, Scores, Prognose (15.10.)

Live in der echten App (Version 2.8.0), vorher in stamio-test. Sicherungen: `data-export/prod-vor-release12.sql`, `test-vor-auftrag12.sql`. Daten wurden nicht verändert.

| Punkt | Was |
|---|---|
| **1** Rad-Tempozonen | km/h-Zonen je Rad (Rennrad, Gravel, drinnen virtuell), z. B. „Z2: 26–29 km/h flach“. Unter Einstellungen → Zonen und in jeder Rad-Einheit nach Puls/Watt, mit Hinweis auf Wind und Steigung. Neu nach dem Radtest (Feld „Ø Tempo der 20 min“) und aus lockeren flachen Fahrten. |
| **2** Coach bewertet | „Wie war mein Lauf/Training/Schwimmen gestern/meine Woche?“, „Vergleich mit letzter Woche“, auch „na wie wars beim radeln“ oder „wie wa mein trainig“. Antwort in 3 Teilen: Gut (mit Zahlen), Besser (mit Grund), Nächste Tage. Vergleicht mit Vorgabe und ähnlichen früheren Einheiten, nutzt Zonen, Entkopplung, Splits, Kadenz, Züge, RPE, Gefühl, Morgenwerte. Fehlt etwas: „Es fehlen …“ plus Knopf „Werte eintragen“. Kommt automatisch nach jeder erledigten Einheit (Einstellungen: ausführlich/kurz/aus). 91 Testfragen (Jonahs Daten und 10 Test-Personen). |
| **3** Chat-Design | „Coach schreibt …“ mit drei Punkten, dann Wort für Wort (30–60 Wörter/s), Antippen zeigt alles, Knöpfe danach, mitscrollen außer beim Hochscrollen, ohne Animation bei „Bewegung reduzieren“. Mit KI-Schlüssel echter Strom vom Server. Browser-Test hell/dunkel. |
| **4** Scores | Feste Skala (20 Einsteiger, 50 solider Hobbysportler, 70 stark, 85 Spitzenamateur, 100 Elite), nach Alter/Geschlecht bereinigt, kein Abschneiden. Statt „Ziel“: „Für dein Ziel nötig: 5:57/km, du bist schon 18 s schneller ✓ · Nächstes Etappenziel: 5:29/km“ (+ Wunschzeit), als Balken mit Strichen. „Warum?“ zeigt gezählte Einheiten, Sicherheit und was am meisten bringt („Kraul am Stück auf 100 m → +2“). Erreichte Etappenziele meldet der Coach. |
| **5** Prognose | „Wenn du heute starten würdest“ und „Erwartet am …“, je Disziplin Bereich und wahrscheinlichster Wert. Immer da, ohne Test breiter mit Test-Hinweis; Schwimmen auch aus 25-m-Zeit oder mit Brust. Ausdauer über Riegel-Exponent (1,06–1,15), Rad-Physik mit Watt, Abschlag nach dem Rad je Koppeltraining, Strecke (Höhenmeter, Freiwasser, Neopren, Temperatur) beim Ziel. Nach dem Rennen Zeiten je Disziplin eintragen → persönlicher Korrekturfaktor. Pacing-Plan mit Puls/Watt/km/h/Pace. |

Jonah heute (15.10.): Laufen 42, Rad 41, Schwimmen 20, Kraft 45. Ironman-Prognose heute etwa 14:45 h (sicher ankommen ist realistisch), Olympisch etwa 3:17 h. Am meisten bringen längere lockere Läufe und Kraul am Stück.

Geprüft mit bekannten Beispielen (10 km 47 min → Halbmarathon 1:43, typische Olympische Distanz 2:20–2:45) und allen Test-Personen. Tests: 1278 Unit- und Server-Tests, 149 Browser-Tests (Chromium und WebKit). Code auf `entwicklung` gepusht. Entscheidungen 138–148.

## Auftrag 11: Fehler aus Papas Test, neue Nutzer (15.10.)

Live in der echten App (Version 2.7.0), vorher in stamio-test geprüft. Sicherungen in `data-export/` (`prod-vor-release11.sql`, `test-vor-auftrag11.sql`).

**Papa** (echte App, nicht zurückgesetzt): Profil repariert und Plan nach den neuen Regeln neu berechnet, gilt ab morgen (16.10.). Kraulen jetzt normales Training (Stücke bis 100 m), Lauftreff fest eingeplant ohne Spieltage, Pulswerte wieder richtig. Er bekommt im Coach eine Nachricht. **Er muss sein Geburtsjahr neu eintragen** (er hatte „197“ eingegeben, siehe FUER-JONAH.md).

| Punkt | Was |
|---|---|
| **1** Kraulen | „ja“ = normales Training, Stücke so lang wie die Strecke am Stück (ohne Meter: 100 m). Lern-Stufen nur bei „ein bisschen“ oder unter 50 m, „nein“ = Technik von Anfang an, ab 200 m immer normal. Titel „Schwimmen: Grundlage / Technik + Ausdauer / Intervalle“, „Kraul lernen“ nur für Anfänger. 6 Fälle getestet. |
| **2** Teamsport ohne Spiele | Erst „Gibt es Spiele?“, nur bei Ja Spieltage. Ohne Spiele keine Spiel-Einheiten, keine Spieltag-Regeln; alte Spiele ohne Spieltage entfallen. Gleich im Fragebogen und unter Berücksichtigungen. |
| **3** Sofort gültig | Änderungen gelten ab heute (ab 18 Uhr ab morgen). Vergangenes und Erledigtes bleibt, der Rest der Woche wird neu verteilt (Erledigtes zählt mit, keine doppelte harte Einheit). Vorschau zeigt diese Woche. Neue Nutzer starten sofort. |
| **4** Wochenraster | Ein Bildschirm: Zeit pro Tag + Sportart × Tag. Stunden, längster Tag, Häufigkeit werden berechnet und sind nur nach innen änderbar (nie mehr als möglich). Im Profil nur noch die Zusammenfassung. |
| **5** Becken, Freiwasser | Neue Fragen. 25 m: keine 75-m-Stücke; 50 m: 50-m-Schritte. Freiwasser-Einheiten (Sichten, Orientierung, Start, Neopren) in der Saison und vor Triathlons, erst ab 200 m Kraul am Stück. |
| **6** Stunden bisher | Rechner „wie oft × wie lange“, Vorschlag aus Uhr/intervals.icu, „Weiß ich nicht“ = vorsichtiger Start, nach 2 Wochen passt sich der Plan an. |

**7: Die 10 wichtigsten Funde** (Papas echte Daten, 5 neue Test-Personen und ein Durchlauf im Browser von Einladung bis Verbindungen), alle behoben:
1. Geburtsjahr „197“ wurde angenommen → Alter 1829, Schwellenpuls −954. Jetzt Bereichsprüfung, Reparatur beim Start, Coach bittet um das Jahr.
2. „Kannst du kraulen?“ zeigte „ja“, speicherte aber nichts. Jetzt „bitte wählen“ und Pflicht.
3. Neuer Plan begann erst nächsten Montag („Heute kein Training“). Jetzt ab heute.
4. Fragebogen erneut → 3 gleiche Nachrichten „Dein Plan geht weiter …“. Jetzt eine je Anlass und Tag.
5. Tests, die nicht zum Können passen: 400-m-Schwimmtest ohne Kraul, Kraul-Check für Nichtkrauler, 70-min-Radtest bei 45 min längster Fahrt, Coach empfahl Anfängern einen 30-min-Lauftest.
6. Ziel ohne Datum landete stillschweigend 12 Wochen später (Sprint-Triathlon im Januar). Jetzt Saison-Platzhalter.
7. „Pull Buoy“ im Titel ohne Pull Buoy, Schwimm-Zone 2 = Zone 3, Kraul-Check mit viermal „100 m Brust“.
8. Unklare Texte: „Lange Ausfahrt 35 min“, „8×0.25 min“ (jetzt „8×15 s“), „Spiel/Training“ beim Volleyball ohne Spiele, „Kraft“ im Wochentext ohne Kraft, „nach Plan“ und „10.5 h“ in der Zusammenfassung.
9. Wochenraster zeigte ohne Zeit alles grün, Legende nannte „Spiel“ ohne Spiele; Tage vor dem Planstart hießen „Ruhetag“.
10. Verbindungen: lange Quellen-Liste mit HFV, CTL/ATL, SpO2 schon vor der ersten Verbindung. Jetzt erst danach, Begriffe erklärt. Dazu Hinweise bei Kraul, Wattmessung und Priorität.

Getestet: 1143 Unit- und Server-Tests, 133 E2E-Tests (Chromium und WebKit), dazu 5 neue Personen als Dauertest. Ein zufällig scheiternder Oura-Test ist repariert. Code auf Branch `entwicklung` gepusht.

## Auftrag 7 (13./14.10.2026)

**Dein Plan geht weiter.** Block 1 endet mit Woche 5 (Erholung bis 18.10.). Ab 19.10. Block 2: Woche 6 = Block 2, Woche 1, locker nach der Erkältung (ca. 4 h eigenes Training, Umfang aus deiner Fitness vor der Erkältung, CTL 32, minus 15 %), Lauftest am Sonntag 25.10., danach 3 Wochen +10 % und 1 Woche Erholung. Scores sind zurück (Schwimmen 33, Rad 50, Laufen 68, Kraft 44 statt 25/37/35/44), dazu Verlauf, Kalibrierung und deine echten Schwellen (LTHR 170). Erledigte Einheiten und Morgenwerte waren nie weg.

| Punkt | Was |
|---|---|
| **1** Umfang ragt heraus | Ursache: das Diagramm zeichnete alle 65 Wochen, die Balken brachen um und ragten aus der Karte. Jetzt 12 Wochen rund um heute. Der Layout-Test prüft zusätzlich „ragt aus seiner Karte“ und „Wort mitten umgebrochen“ (dabei noch „Verlauf/Notizen“ im Coach und „0/10“ im Plan gefunden und behoben). |
| **2** Plan geht weiter | Ursachen: der neue Plan ersetzte Kalibrierung und Verlauf, zählte neu ab „Woche 1“, nahm 1,2 h aus dem Fragebogen statt deiner Belastung, und beim Umzug hat das leere iPhone deine Schwellen überschrieben. Alles behoben, mit Tests. Regel für alle: Fragebogen und Profiländerung setzen fort. Dein Profil ist vollständig eingetragen (17 J., 184 cm, 73 kg, Ironman 2029, Weg Sprint → Olympisch → Halb-Ironman, LTHR 170, aerobe Schwelle 150-155, VO2max 57,5, Schwimmbad Di + Wochenende, morgens max. 40 min ohne Bad, Fußball Mo/Fr bis Okt. 2027, Kraft Di Unterkörper / Fr Oberkörper, Mobility täglich, Lauf-Ziel 4:30/km bei Puls 120, 3+1 mit +10 %). Nach dem Lauftest übernimmt die App Schwellenpuls, Schwellen-Pace und aerobe Schwelle automatisch (von der Uhr oder aus deinen Feldern) und sagt dir im Coach, was sich geändert hat. |
| **3** Felder statt Notizfeld | Jede Sportart hat ihre Felder (Lauf mit Splits, Kadenz, Entkopplung …, Rad mit Watt/Trittfrequenz/drinnen/Rad, Schwimmen mit Zügen, Kraul am Stück, Technik, Kraft mit Übungen × Sätze × Gewicht, Fußball). Für alle: RPE, Gefühl, „geplant vs. gemacht“, Notiz optional. Uhr/HealthFit und intervals.icu füllen automatisch mit Quelle, du kannst alles ändern. Pulszone („Zone 3 statt 2“) und CTL/ATL/TSB des Tages werden berechnet. Deine alten Notizen stehen jetzt in den Feldern (Quelle „Notiz“), die Notizen selbst bleiben. |
| **4** Coach erklärt den Tag | „Was genau soll ich heute/morgen/am Samstag … machen?“ → Schritte mit Metern, Wiederholungen, Pausen und deinen Pulswerten, passend zu Woche, Krankheit und Ampel. Bei Wiedereinstieg, schlechten Werten oder „ich hab nur 20 min“ schlägt er eine Änderung vor und ändert nach „Ja“. Der Ablauf steht auch im Plan (Einheit antippen). Ohne KI, 50+ Testfragen. |
| **5** KI-Coach | Bereit für den Schlüssel: neue Werkzeuge (Tag erklären, Analyse, alle Felder), harte Regeln über die Regel-Engine, Monatsbudget. Korrigiert: Cache-Preise, Haiku-Antworten konnten leer bleiben. Kosten etwa 6 Cent pro Frage (2-15 $ im Monat), 3 Schritte in [FUER-JONAH.md](FUER-JONAH.md). |
| **6** Analyse-Coach | Läuft auf dem Server morgens, nach jeder neuen Einheit (auch aus intervals.icu ohne App) und sonntags. Erkennt z. B. „aerobe Effizienz steigt“, „3 lockere Läufe mit zu hohem Puls“, „Ermüdung steigt“, Belastung (ACWR), Schlaf, Schwimm-Technik. Kleine Änderungen automatisch mit Rückgängig, größere als Vorschlag. Unter Coach: „Was der Coach gerade sieht“ mit 3 Punkten. 30 Tests mit deinen echten Daten. |

Getestet: 757 Unit- und Server-Tests, 117 E2E-Tests (Chromium und WebKit), Layout 320-430 px und 130 % Zoom hell/dunkel. Erst in der Test-App mit einer Kopie deiner Daten, dann in der echten App (vorher gesichert). Version 2.3.0.

Beim nächsten Öffnen lädt die App einmal neu und zeigt Woche 6 als „Block 2, Woche 1“. Läuft live seit 14.10. (Sicherung vorher in data-export/). Der Code liegt im Zweig entwicklung; hochladen zu GitHub (main) war hier nicht erlaubt und ist für die App nicht nötig.

## Freigabe (13.10.2026)

**Deine echte App hat jetzt diese Adresse: https://coach-app-efc7.pages.dev**
Die Adresse hängt nicht vom App-Namen ab. Wählst du später einen neuen Namen, musst du nicht noch einmal umziehen.

**iPhone umziehen (ca. 5 Minuten):**
1. Öffne auf dem iPhone in Safari **https://coach-app-efc7.pages.dev**. Tippe auf Teilen → „Zum Home-Bildschirm“ → „Hinzufügen“.
2. Öffne die neue App vom Home-Bildschirm. Tippe auf „Server zum ersten Mal einrichten“, gib den **Einrichtungscode** ein und tippe auf „Einrichten“. Der Code steht in `ZUGANG.local.md` ganz oben unter „echte App“. Danach lädt die App deine Daten (Stand 13.10., 16:01 Uhr).
3. Kurz prüfen: „Heute“ zeigt „Krank seit Mi 07.10.“, der Plan zeigt W1–W5, und unter „Fortschritt“ stehen deine Werte.
4. Mehr → Einstellungen → Mitteilungen → „Mitteilungen erlauben“, dann „Test senden“. Auf der neuen Adresse muss das iPhone Mitteilungen einmal neu erlauben.
5. Nur wenn du intervals.icu nutzt: Mehr → Verbindungen → intervals.icu → API-Schlüssel und Athleten-ID eintragen. Beides findest du in intervals.icu unter Settings → Developer.
6. Lösch das alte Icon vom Home-Bildschirm und schreib mir **„iPhone ist umgezogen“**. **Erledigt (13.10.):** `main` ist zusammengeführt, die alte Adresse leitet auf die neue weiter und räumt dabei den alten Offline-Speicher auf.

Hast du nach 16:01 Uhr noch etwas in der **alten** App eingetragen, sag es mir. Ich hole es dann nach. Die alte App bleibt 4 Wochen unverändert als Rückfall (alter Server, alte Datenbank, altes Icon).

### Was in Auftrag 6 passiert ist

| Punkt | Stand | Was |
|---|---|---|
| **1** Bestätigen statt sofort ändern | erledigt | Ein Tipp ins Wochenraster ändert nur die Anzeige. Geänderte Felder sind gestrichelt markiert, unten stehen „X Änderungen übernehmen“ und „Verwerfen“. „Übernehmen“ zeigt zuerst, was sich diese und nächste Woche im Plan ändert (z. B. „Laufen von Di auf Sa“), erst „Übernehmen“ im Fenster speichert. Wer den Bildschirm mit offenen Änderungen verlässt, wird gefragt. Das gilt auch für Sätze, Können und Räder sowie im Profil für Sportarten, Stunden, Stil und Ziele (Ziele passen den Plan jetzt überhaupt erst an). Name, Gewicht und Sprache speichern weiter sofort. Neuer E2E-Test: versehentlicher Tipp → Verwerfen → Plan und Regeln unverändert. |
| **2** Namenssuche | erledigt | [NAMEN.md](NAMEN.md): 40 Ideen geprüft (Domains .com/.app/.de, App Store, Google Play, Marken DPMA/EUIPO/USPTO/WIPO in den Klassen 9/41/42/44, Websuche, TikTok), dazu die 10 besten freien Namen. **Empfehlung: Tempendo**. Der Name in der App ist unverändert. |
| **3** Neutrale Adresse | erledigt | Pages `coach-app-efc7`, Server `coach-api-efc7`, Datenbank `coach-db-efc7`. Der App-Name steht nur in `shared/brand.ts`. `scripts/release.md`, `scripts/deploy.mjs production` und die CI sind angepasst. |
| **4** Letzte Prüfung | erledigt | Typecheck, 612 Unit- und Server-Tests, 105 E2E-Tests (Chromium und WebKit) grün. Die Kopie deiner echten Daten war vorher **nie** gelaufen. Jetzt ist sie gelaufen, und dabei kam ein echter Fehler heraus: Die Umstellung brach an deiner echten Datenbank ab (Tabelle `error_log` fehlte). Der Fehler ist behoben und per Test abgesichert. In der Test-App sind deine Daten vollständig angekommen, Art für Art gezählt: 49 Einheiten (21 erledigt), 42 Tage Werte, Krankheitsphase seit 07.10., 2 Meilensteine, 3 Tage Essen, Plan, Einstellungen. Papa ist unverändert. |
| **4** Durchlauf mit deinen Daten | erledigt | Heute, Plan, Coach (5 Sätze), Berücksichtigungen, Verbindungen und Fehler melden durchgespielt. Dabei 3 Fehler gefunden und mit Tests behoben (siehe unten). |
| **5** Freigabe | erledigt | Frische Kopie (16:01 Uhr) in die neue Datenbank, Zahlen wieder Art für Art gleich (50 Einheiten, 43 Tage Werte, …). Die echte Datenbank wurde nur gelesen. Neue Schlüssel gesetzt, Server und App deployt, `/api/health` meldet `production`. Die alte App läuft unverändert. Nach „iPhone ist umgezogen“ ist `entwicklung` nach `main` übernommen; die alte GitHub-Pages-Adresse zeigt „Die App ist umgezogen“ und leitet weiter. Alter Server und alte Datenbank bleiben 4 Wochen unverändert. |

**Im Durchlauf gefunden und behoben (jeweils erst mit Test nachgestellt):**
- „Kann ich morgen schon wieder schwimmen?“ während deiner Krankheit: Der Coach fragte, was er mit der Schwimmeinheit machen soll. Jetzt antwortet er zur Krankheit (seit wann, kein Training bei Fieber, ab 24 h symptomfrei „Wieder gesund“).
- Abends bot „Ich habe Mittwoch keine Zeit“ noch „heute“ als Ausweichtag an. Ab 18 Uhr nicht mehr.
- Ein unsichtbares Steuerzeichen im Code führte dazu, dass ein „Schwellentest“ nicht als harte Einheit galt. Ein neuer Test prüft jetzt alle Quelltexte auf solche Zeichen.

**Was du wissen solltest:**
- **Mitteilungs-Schlüssel nicht übernommen:** Der alte Schlüssel liegt nur bei Cloudflare, und Cloudflare gibt solche Schlüssel nicht wieder heraus; eine Kopie gab es nirgends. Er hätte auch nicht geholfen, weil Mitteilungen je Adresse gelten. Deshalb Schritt 4 oben (ein Tipp).
- **intervals.icu** musst du aus demselben Grund einmal neu eintragen (Schritt 5).
- **Kostenlos-Grenze:** Cloudflare erlaubt kostenlos nur 5 Zeitpläne pro Konto. Der neue und der Test-Server haben deshalb je einen statt zwei; das nächtliche Backup läuft im 5-Minuten-Lauf um 02:00 UTC mit. Es wurde nichts gekauft.
- **Dein Plan endet am 18.10.** In der App ist dein Ziel als „Allgemeine Fitness“ eingetragen, und für Fußball fehlen die Tage. Plant die App die Folgewochen selbst (z. B. nach „Übernehmen“ in den Berücksichtigungen), fehlt deshalb Fußball. Die Vorschau zeigt dir das vorher. Besser: Neuen Block wie bisher einspielen, oder vorher unter Profil das Ziel anpassen und den Fragebogen mit Fußball-Tagen ausfüllen.
- Die Test-App heißt weiter `stamio-test`, weil Papa sie nutzt.
- In der neuen App habe ich mich **nicht** mit deinem echten Einrichtungscode angemeldet; den ersten echten Login machst du in Schritt 2. Den gleichen Ablauf habe ich vorher lokal mit einer Kopie deiner Daten durchgespielt.

Weitere Dokumente: [ENTSCHEIDUNGEN.md](ENTSCHEIDUNGEN.md) (Nr. 72-81) · [NAMEN.md](NAMEN.md) · [scripts/release.md](scripts/release.md)

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

## Oura und Dropbox (14.10.)
- Schlüssel für Oura und Dropbox sind in der echten App gesetzt.
- Neu: Eine neue Verbindung ändert nichts Vergangenes. Tage vor dem Verbinden bleiben, wie sie waren; am Tag des Verbindens werden nur leere Werte gefüllt; Einheiten zählen ab dem Verbinden. Werte von Hand überschreibt keine Uhr mehr (Entscheidung 102).
- Oura war schon vorher verbunden und hatte 28 alte Tage ergänzt (u. a. Ruhepuls 8.10. 80 → 86, Schlaf 12.10. 7,2 → 7,1 h). Diese Tage sind wieder genau wie vorher (Backup `data-export/prod-vor-verbindungsschutz.sql`). Heute bleibt mit den Oura-Werten.
- KI-Coach für Gespräche jetzt mit Sonnet 5.5 statt Opus 5.5: etwa 3-4 Cent pro Frage, 1,50-9 $ im Monat (FUER-JONAH.md, Entscheidung 103).

## Auftrag 8: Plan individuell, mehr Umfang (14.10.)
- **Ursache:** Umfang aus der CTL (zu niedrig, weil viele Einheiten fehlten), dazu −15 % wegen der Erkältung und der 70-%-Deckel. Woche 4 war wegen der Erkältung komplett „ausgelassen“.
- **Neue Regel für alle:** Start auf Höhe der letzten Aufbauwoche; erledigt zählt nur, wenn abgehakt und ohne Krankheit; CTL nur als Grenze, wenn sie vollständig ist. Nach Krankheit in Stufen (72 %, 90 %, 100 %). Kein 70-%-Deckel. Steigerung am eigenen Training gemessen.
- **Dein Plan ab 19.10.** (Woche 5 unverändert): fester Wochenaufbau wie vorgegeben, Umfang 6,3 / 7,3 / 8,2 / 5,8 (Erholung) / 8,8 / 9,3 / 9,6 / 6,3 h (Erholung + Tests), danach im gleichen Muster (Woche 14-16: 10,1-10,6 h). Langer Lauf 65 → 75 → 85 → 90 → 95 → höchstens 100 min, Sweet Spot ab Woche 8 (3×8, 3×12, 2×20), Koppellauf ab Woche 10, Steigerungsläufe ab Woche 8.
- **Tests:** Lauf So 25.10., Kraul-Check Di 27.10., Rad Mi 28.10.; wieder 8., 9. und 13.12., dann alle 8 Wochen. Werte werden automatisch übernommen (Lauf, Rad mit/ohne Watt, Schwimmen; ab 400 m Kraul am Stück CSS-Test).
- **Anzeige:** Unter jeder Woche „Umfang X h (±Y % zur letzten Aufbauwoche)“.
- **Sicherheit:** Ampel kürzt einzelne Tage, der Coach schlägt leichtere Wochen vor, der Grundplan bleibt. Keine harte Regel verletzt (Schwimmbad nur Di/Sa/So, morgens höchstens 40 min, keine Beine am Spieltag oder davor).
- **Hinweis:** Morgens optional Rad geht nur als Hinweis (Rad ist laut deinem Raster Mo, Di, Do verboten). Die Wochen liegen meist 0,1-0,4 h unter deiner Tabelle, weil der Donnerstagslauf bei 50 min und das Rad am Mittwoch bei 90 min bleiben und Laufen höchstens +10 % pro Woche steigt.
- Getestet: 795 Unit- und Server-Tests, 121 E2E-Tests. Erst stamio-test mit Kopie deiner Daten, dann echte App (Sicherung `data-export/prod-vor-auftrag8.sql`). Version 2.4.0.

## Auftrag 9: Langfristige Planung (14.10.)
- **Zyklen statt Dauer-Grundlage (für alle):** Auf jedes Ziel hin Grundlage → Aufbau → wettkampfspezifisch → Tapering → Wettkampf, nach B-Zielen 1 Woche Erholung, dann der nächste Zyklus. Grundlage höchstens 18 Wochen am Stück; sehr lange Wege bekommen Zwischenzyklen.
- **Platzhalter** für Ziele ohne Datum (nach Distanz, Saison, Form und Abstand zum A-Ziel), überall als „Platzhalter“ markiert. Bei dir: Sprint 13.6.27, Olympisch 29.8.27, Halb-Ironman 18.6.28, Ironman 15.9.29. Echtes Datum beim Ziel eintragen → „Übernehmen“ → neu geplant.
- **Lange Einheiten wachsen mit dem Ziel:** Obergrenzen je Distanz (Sprint/Olympisch Lauf 100 min, Halb 2 h, Ironman 2:45 h; Rad 3 h / 4 h / 5 h), Winter Rad 2:30 h (drinnen 2 h), unter 18 vorsichtiger, nie Marathondistanz, langer Lauf höchstens +10 min pro Woche. Schwimmen wird mit Können und Ziel länger (bis 90 min). Koppeltraining ab dem Aufbau.
- **Dein Plan:** bis Februar Grundlage (bis 9,7 h, langer Lauf 100 min, Rad 2:30 h), ab März Aufbau (10,2 h, Rad bis 3 h), ab Mai spezifisch (Rad-Schwelle, Wettkampftempo, längere Koppelläufe), Sprint 13.6., dann Olympisch. Im Winter bleibt der Umfang gleich, weil dein Wochenaufbau und die Wintergrenze voll ausgeschöpft sind.
- **Schwimmen:** Stufen nach Strecke am Stück (25 → 50 → 100 → 200 → 400 m → Ausdauer) mit Pull Buoy und weniger Brust je Stufe. Eingetragen: 25 m Kraul, 50 m mit Pull Buoy. Neue Bestwerte (Feld, Uhr, Kraul-Check oder Satz im Coach wie „ich schaffe jetzt 100 m Kraul am Stück“) stufen sofort alle kommenden Schwimmeinheiten hoch. Ab 400 m CSS-Tests.
- **Zonen:** Nach Tests und bei klaren Trends aus der Uhr bekommen alle kommenden Einheiten die neuen Vorgaben, der Coach zeigt ein Beispiel vorher/nachher.
- **Zeitleiste** oben im Plan mit Phasen, Zielen und „Jetzt“.
- Geprüft mit 10 Test-Personen (4 neu: Marathon-Anfänger, Rad-Event, Olympisch-Erfahrene, Langdistanz-Profi): 1033 Unit- und Server-Tests, 123 E2E-Tests inkl. Layout. Erst stamio-test mit deinen Daten, dann echte App (Sicherung `data-export/prod-vor-auftrag9.sql`). Version 2.5.0.

## Auftrag 10: Wochenkopf und Feinschliff (14.10.)
- **Fehler im Plan-Tab behoben:** Die rechte Spalte im Wochenkopf („3/11 · 6,8 h“) durfte schrumpfen und ihr Text lief aus der Karte. Jetzt schrumpft sie nie, die Steigerung steht klein in einer eigenen Zeile links („+9 % zur letzten Aufbauwoche“).
- **Warum der Test es nicht fand:** Er prüfte nur die aktuelle Woche und nur Element-Kästen, nicht Text, der über seinen Kasten hinausläuft. Jetzt prüft er alle Wochen eines echten langen Plans (Einstieg, Tests, Erholung, Platzhalter, Zeitleiste) und überlaufenden Text. Dabei auch die Prognose-Zeitspanne im Fortschritt behoben.
- **Abwechslung (für alle):** Rad Sweet Spot/Kraftausdauer → Schwelle/Over-Unders → VO2max bzw. Wettkampftempo je Ziel; Lauf Hügelsprints/Fahrtspiel → Schwelle → Wettkampftempo (bei dir im langen Lauf am Sonntag, weil Do zwischen Mi-Rad und Fr-Spiel liegt); lange Ausfahrt und Schwimmen mit wechselndem Schwerpunkt, kürzere Pausen = mehr Meter. Höchstens 3 gleiche Schlüsseleinheiten in Folge.
- **Nach Wettkämpfen:** Sprint 3, Olympisch 5, Mittel 10, Lang 14 lockere Tage.
- Geprüft mit allen 10 Test-Personen und dem festen Wochenaufbau: keine 4 gleichen Wochen in Folge, passende Intensität je Phase, keine harte Regel verletzt. 1091 Unit- und Server-Tests, 133 E2E-Tests. Erst stamio-test, dann echte App (Sicherung `data-export/prod-vor-auftrag10b.sql`). Version 2.6.0.
