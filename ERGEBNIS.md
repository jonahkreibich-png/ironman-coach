# Auftrag 24: Liquid-Leiste wie iOS 26, Prognose mit Entwicklung, nur eigene Sportarten (30.10.)

**Stand:** Fertig und live (Version 3.12.0). Erst Test-Umgebung mit einer frischen Kopie deiner Daten, dann echte App. Beide waren vorher gesichert, und alle 3 Konten laden an einer Kopie der echten Daten fehlerfrei. Du musst nichts tun: App öffnen und „Aktualisieren“ tippen.

## 1. Tab-Leiste
**Was war falsch**
- **Zwei Linsen:** Der aktive Tab hatte im Glas-Design eine eigene Fläche, die Zieh-Linse kam dazu.
- **Ruckeln nach dem Loslassen:** Der neue Tab wurde sofort gebaut, während die Animation im selben Takt lief.

**Jetzt**
- **Genau ein Element:** Es markiert in Ruhe den aktiven Tab und wird beim Drücken zur vergrößerten Linse.
- **Feder:** leichtes Überschwingen (etwa 4 %), Dehnung in Bewegungsrichtung je nach Tempo (bis 24 %), beim Abbremsen wieder rund. Beim Drücken 1,2× größer, beim Loslassen weiches Einrasten am nächsten Tab mit kleinem Nachfedern. Antippen gleitet mit derselben Feder.
- **Flüssig:** nur transform und opacity. Gleiten und Einrasten laufen als Web-Animation im Compositor weiter, auch während der neue Tab gebaut wird. Den baut die App erst zwei Bilder nach dem Start der Animation (beim Finger; ein Mausklick am PC öffnet sofort).
- **„Bewegung reduzieren“:** keine Feder, keine Vergrößerung, direkter Wechsel.

**Messung in WebKit** (Safari-Engine, ohne Grafikkarte)

| Fall | ms pro Bild |
|---|---|
| ohne Linse | 16,1 |
| Ziehen, erste Geste | 20,5 (vorher 33) |
| Ziehen, danach | 15,8–16,0 (60 fps) |

- Rechenzeit der Linse: 0,12 ms pro Bild im Mittel, höchstens 1 ms.
- Aufbau des neuen Tabs: 43 ms. Die Linse gleitet währenddessen weiter (im Test geprüft).

**Videos** (WebKit, zum Vergleich): `docs/tabbar-vorher-webkit.webm`, `docs/tabbar-neu-webkit.webm`, `docs/tabbar-neu-webkit-zeitlupe.webm` (4× langsamer). WebM statt GIF, weil das vorhandene Werkzeug kein GIF erzeugen kann.

## 2. Prognose: heute ≠ Wettkampftag
**Ursache bei Papa:** Die Rechnung verglich den heutigen Stand mit dem von vor 70 Tagen. Damals gab es noch keine eigenen Einheiten, also verglich sie mit Standardwerten. Das sah aus wie „langsamer geworden“ und drückte die Hochrechnung. Dazu bekam, wer rechnerisch schon an seiner Grenze ist (bei Papa das Rad, ab 45), null oder sogar weniger. Die Wechsel blieben immer gleich. Ergebnis: Rad 1:28:22 → 1:28:05 und Wechsel 3:24 → 3:24, also praktisch gleich.

**Regel jetzt (für alle)**
- **Eigener Trend** zählt nur aus eigenen Daten: Vergleich mit 12, 8 oder 5 Wochen zurück, je mindestens 3 Einheiten damals und heute. Je mehr Daten, desto mehr zählt er (höchstens 70 %).
- **Sonst typische Entwicklung:** nach Niveau (Anfänger mehr), Alter, Sportart (Schwimmtechnik bei Anfängern am meisten), geplantem Umfang und Abstand zum Wettkampf. Ohne eigenen Trend ist der Bereich breiter.
- **Wer den Plan durchzieht, wird immer etwas besser.** Auch die Wechsel werden durch Koppeltraining schneller, Brustschwimmer werden in Brust schneller.
- **Gleich** sind beide Werte nur in der Woche vor dem Rennen.
- **Schlechter am Wettkampftag** nur bei einer Pause (2 Wochen keine Einheit oder krank), immer mit Begründung, z. B. „Laufen: seit etwa 4 Wochen keine Einheit … deshalb am Wettkampftag langsamer als heute“.
- **„Warum?“** nennt je Sportart „Hochrechnung aus typischer Entwicklung“ oder „aus deinem Trend der letzten X Wochen (zählt zu Y %)“.

**Echte Konten (frische Kopie von heute)**

| Konto | Ziel | heute | Wettkampftag vorher (3.11) | Wettkampftag jetzt |
|---|---|---|---|---|
| Papa | Triathlon 18.7.27 | 3:17:33 | 3:08:48 (Rad und Wechsel gleich wie heute) | **3:08:43** (Rad 1:27:52, Wechsel 3:11) |
| Papa | Halbmarathon 4.4.27 | 2:09:02 | 2:07:27 | **2:07:13** |
| Mama | Schwimmen 11.7.27 (Platzhalter) | 47:01 | 43:47 | **43:35** |
| du | Halbmarathon 4.4.27 | 2:07:30 | 1:58:16 | **1:57:37** |
| du | Sprint 13.6.27 (Platzhalter) | 1:35:52 | 1:29:05 | **1:28:40** |
| du | Olympisch 29.8.27 (Platzhalter) | 3:15:11 | 2:57:45 | **2:57:09** |
| du | Halb-Ironman 18.6.28 (Platzhalter) | 6:48:50 | 5:54:49 | **5:54:19** (ca. 5:30–6:30 h) |
| du | Ironman 15.9.29 | 14:39:44 | 11:55:13 | **11:54:38** (ca. 11–13:30 h) |

Bei allen gilt „Hochrechnung aus typischer Entwicklung“: Für einen Trend gibt es noch zu wenige eigene Daten von vor 5–12 Wochen. Du und Papa seid gerade als krank eingetragen; bei Zielen in mehreren Monaten zählt das nicht (längst aufgeholt).

**Alle Test-Personen** (ohne eigene Daten; S = Schwimmen, R = Rad, L = Laufen)

| Test-Person | Sportarten | Ziel | heute | in 2 Wochen | am Termin | in 3 Jahren |
|---|---|---|---|---|---|---|
| jugend-langdistanz | SRL | Langdistanz | 16:14:24 | 16:09:45 | ca. 11–15:30 h (2028-07-16) | ca. 11–15 h |
| jugend-langdistanz | SRL | Stadt-Sprint | 1:45:22 | 1:45:06 | 1:44:39 (2026-11-08) | ca. 1:10–1:40 h |
| vater-rad-lauf | RL | Radmarathon 150 km | 4:08:44 | 4:08:33 | 3:58:27 (2027-03-21) | ca. 3:30–4:30 h |
| vater-rad-lauf | RL | Silvesterlauf 10 km | 59:07 | 59:05 | 58:45 (2026-12-31) | ca. 49 min – 1:04 h |
| laeuferin-hm | L | Halbmarathon | 2:00:18 | 2:00:12 | 1:59:30 (2026-12-20) | ca. 1:40–2:10 h |
| laeuferin-hm | L | 10-km-Rennen | 54:31 | 54:28 | 54:22 (2026-11-14) | ca. 44–59 min |
| einsteiger-sprint | SRL | Erster Sprint-Triathlon | 1:58:40 | 1:58:31 | 1:55:55 (2027-04-18) | ca. 1:30–2:05 h |
| erfahren-md-marathon | SRL | Mitteldistanz | 5:54:42 | 5:54:25 | 5:44:21 (2027-06-27) | ca. 5–6:30 h |
| erfahren-md-marathon | SRL | Frühjahrsmarathon | 3:40:05 | 3:39:55 | 3:37:26 (2027-04-11) | ca. 3–4 h |
| vater-regeln | SRL | Olympische Distanz | 3:13:32 | 3:12:37 | 3:08:29 (2027-06-20) | ca. 2:45–3:35 h |
| marathon-anfaenger | L | Erster Marathon | 6:38:27 | 6:36:48 | 4:59:02 (2027-10-10) | ca. 3:30–5 h |
| marathon-anfaenger | L | Halbmarathon | 2:59:33 | 2:58:49 | – | ca. 1:35–2:25 h |
| rad-event | R | Alpen-Radmarathon 180 km | 3:50:13 | 3:50:00 | 3:43:30 (2027-07-04) | ca. 3–4 h |
| olympisch-erfahren | SRL | Olympische Distanz | 2:56:59 | 2:56:50 | 2:52:32 (2027-07-11) | ca. 2:30–3:20 h |
| olympisch-erfahren | SRL | Sprint-Triathlon | 1:26:59 | 1:26:55 | 1:25:04 (2027-06-06) | ca. 1:15–1:35 h |
| olympisch-erfahren | SRL | Stadtlauf 10 km | 51:13 | 51:10 | 50:28 (2027-04-18) | ca. 44–58 min |
| langdistanz-profi | SRL | Ironman | 12:10:43 | 12:09:41 | 11:29:39 (2027-08-29) | ca. 9:30–13 h |
| langdistanz-profi | SRL | Mitteldistanz | 5:48:48 | 5:48:18 | – | ca. 4:30–6 h |
| anfaenger-ohne-kraul | SRL | Erster Sprint | 2:05:52 | 2:05:38 | 1:59:08 (2027-07-04) | ca. 1:30–2:05 h |
| laeufer-ohne-rad | L | Halbmarathon | 1:47:02 | 1:46:49 | 1:43:16 (2027-04-11) | ca. 1:25–1:50 h |
| teamsport-ohne-spiele | LR | Stadtlauf | 1:05:20 | 1:05:12 | 1:01:58 (2027-05-16) | ca. 47 min – 1:04 h |
| fuenfzig-wenig-zeit | SRL | Olympisch | 3:41:44 | 3:41:28 | 3:29:41 (2027-08-22) | ca. 2:55–3:55 h |
| triathlet-50m-freiwasser | SRL | Mitteldistanz | 6:08:43 | 6:08:22 | 5:56:32 (2027-06-27) | ca. 5–6:30 h |
| triathlet-50m-freiwasser | SRL | Olympisch | 2:54:56 | 2:54:45 | 2:50:20 (2027-05-30) | ca. 2:25–3:15 h |

In 2 Wochen ist es überall etwas schneller (Sekunden), am Termin deutlich, in 3 Jahren am meisten. Feste Tests prüfen außerdem: 8 Tage vorher praktisch gleich, Pause vor einem nahen Rennen langsamer mit Begründung, Trend mit 12 Wochen Daten zählt, Einsteiger entwickeln sich mehr als Erfahrene, Junge mehr als Ältere, mehr Umfang bringt mehr.

## 3. Nur deine Sportarten
- Prognose nur für Ziele, deren Sportarten du gewählt hast. Passt ein Ziel nicht dazu, gibt es keine Prognose. Stattdessen steht beim Ziel im Profil: „Dein Ziel enthält Laufen, das trainierst du bisher nicht – Ziel ändern oder Laufen hinzufügen?“, mit beiden Knöpfen. Im Fortschritt steht eine Zeile mit „Zum Profil“.
- Scores zeigt die App nur noch für gewählte Sportarten. Vorher kamen die Sportarten des Ziels dazu.
- Papa und Mama: Alle ihre Ziele passen zu ihren Sportarten. Bei Mama (Schwimmen, Rad, Kraft) kommt Laufen nirgends vor: keine Prognose, kein Score, kein Tipp, kein Test.
- Getestet: nur eine Sportart, 2 von 3 Triathlon-Sportarten, nur Rad, nur Schwimmen, nur Laufen, Fitness-Ziel ohne Wettkampf. Keine fremde Sportart in Zeit, Teilen, „Was am meisten bringt“, Tests, Annahmen oder Scores.

## Tests
- Typecheck ✓
- 2.626 Unit-Tests ✓ (neu 34: Feder, heute ≠ Wettkampftag, Papa-Fall, Abstand 8 Tage / 2 Wochen / 3 Jahre, Niveau, Alter, Umfang, Trend, Pause und krank, alle Test-Personen, Sportarten-Prüfung)
- Build ✓
- 501 Browser-Tests in Chromium und WebKit ✓ (115 wie bisher übersprungen). Neu:
  - Leiste: Antippen mit Maus und Finger, Halten und Ziehen über alle Tabs und zurück, schnelles Wischen, Loslassen zwischen zwei Tabs (rastet am nächsten ein), Tastatur, „Bewegung reduzieren“, Bildrate. In jedem Bild geprüft: nie zwei Linsen.
  - Prognose: Hinweis statt Prognose, kein Lauf-Score, „Warum?“, heute ≠ Wettkampftag.
- Nebenbei gefunden und behoben: Im Fragebogen kommen die Ziele vor den Sportarten, deshalb fehlte dort die Einordnung „realistisch“. Grobe Bereiche über die Stundengrenze heißen jetzt „49 min – 1:04 h“ statt „49–1:04 h“.

## Offen
- Die Leiste habe ich in WebKit automatisch getestet, nicht auf einem echten iPhone. Haptik gibt es im Web nicht.
- Die typischen Fortschrittsraten sind Erfahrungswerte. Sobald es 5–12 Wochen eigene Daten gibt, zählt der eigene Trend mit, nach Wettkämpfen zusätzlich der persönliche Korrekturfaktor.

Frühere Aufträge:

# Auftrag 23: Prognosen für alle Ziele, Wunschzeit, Fortschritt einklappbar, Tab-Leiste mit Glas-Linse (30.10.)

**Stand:** Fertig und live (Version 3.11.0): erst Test-Umgebung mit einer frischen Kopie deiner Daten, dann echte App (beide vorher gesichert, alle 3 Konten an einer Kopie der echten Daten fehlerfrei geladen, mit Prognosen für jedes Ziel). Du musst nichts tun – App öffnen und „Aktualisieren“ tippen.

## Deine Prognosen vorher / nachher
| Ziel | vorher (am Wettkampftag) | jetzt |
|---|---|---|
| Halbmarathon 4.4.27 | 2:05:53 (1:53–2:25) | **1:58** (1:52–2:07), Sicherheit mittel |
| Ironman 15.9.29 | 13:54:54 (12:31–16:01) | **ca. 11–13 h**, wenn du den Plan durchziehst (wahrscheinlich 11:55), Sicherheit niedrig |

Ironman 2029 je Disziplin: Schwimmen 1:18 (heute 1:54), Rad 6:34 (heute 7:15), Laufen 3:55 (heute 5:21).
Deine Wunschzeit 1:50 im Halbmarathon: **ambitioniert** (knapp schneller als das schnelle Ende). Am meisten bringt eine schnellere Lauf-Schwelle (1× pro Woche Schwellenlauf).
Dazu kommen die Platzhalter-Ziele (Sprint 13.6.27, Olympisch 29.8.27, Halb-Ironman 18.6.28), jede mit eigener Prognose.

## Was war falsch
- **Lange Zeiträume:** Die alte Rechnung nahm 10 Wochen Trend, flachte nach 16 Wochen ab und rechnete danach +2–4 % pro Jahr. Dazu galtest du wegen „11 Jahre Erfahrung“ (zählt Fußball mit) als erfahren. Ergebnis: Schwimmen in 3 Jahren nur 2:41 → 2:21/100 m, obwohl du gerade Kraulen lernst.
- **Zwei Rechnungen für die Wunschzeit:** Das Profil nannte 1:50 „realistisch (1:49–2:11)“, der Fortschritt rechnete 2:06. Jetzt gibt es nur noch eine Rechnung.
- **Geplante lange Läufe übersehen:** Die Prognose suchte den längsten „nicht harten“ Lauf, aber lange Läufe zählen in der App als hart. So wurde dein 105-min-Lauf am 28.2. ignoriert (gerechnet mit 50 min).
- **Wunschzeit veränderte den Plan:** Sie verschob die Schwerpunkte, die Dauer des Wettkampfs im Plan, und „Übernehmen“ plante immer neu (auch der Coach-Chat).

## So rechnet die Prognose jetzt bei langen Zeiträumen
- Jede Sportart nähert sich einer **persönlichen Grenze**. Die hängt vom geplanten Umfang in dieser Sportart, vom Alter und vom Geschlecht ab. Pro Jahr schließt sich ein fester Teil des Abstands: Laufen 25 %, Rad 28 %, Schwimmen 40 % (Technik). **Jugendliche** ×1,25, ab 30 weniger, ab 50 deutlich weniger. Wer weit weg ist (Einsteiger), macht große Sprünge, wer nah dran ist, kleine. Das Niveau kommt aus deinen gemessenen Werten, nicht aus den Jahren.
- Wer nur Brust schwimmt, lernt mit dem Plan Kraulen (gerechnet ab etwa einem halben Jahr).
- Lange Einheiten und Koppeltraining wachsen schrittweise mit („wenn du den Plan durchziehst“).
- In den ersten Monaten zählt zur Hälfte dein eigener Trend der letzten 10 Wochen.
- **Bereich:** wird mit dem Abstand breiter (Datenlage, Zeit, wie stark man auf Training anspricht). Über 1 Jahr nur noch grob („ca. 11–13 h“), Sicherheit „niedrig“.
- Die Prognose rechnet sich weiter bei jeder Einheit, jedem Test und jedem Wettkampf neu. „Zuletzt aktualisiert“ nennt den Tag und was sie bewegt hat (z. B. „Lauf-Schwelle 5:26 → 5:21/km“). „Warum?“ zeigt die Entwicklung je Sportart.

## Vergleich mit typischen Zeiten (Männer, 30 Jahre, heute)
| | Einsteiger | solide | stark | typische Bereiche |
|---|---|---|---|---|
| Halbmarathon | 2:18 | 1:50 | 1:28 | 2:05–2:35 / 1:40–1:58 / 1:18–1:35 |
| Olympisch | 3:11 | 2:38 | 2:15 | 2:55–3:35 / 2:25–2:55 / 2:00–2:25 |
| 70.3 | 6:47 | 5:31 | 4:43 | 6:00–7:45 / 5:00–6:10 / 4:20–5:05 |
| Ironman | 14:45 | 11:57 | 9:55 | 13:00–16:30 / 10:45–12:45 / 9:15–10:45 |

Ironman in 3, 6, 12, 24, 36 Monaten:
- Einsteiger, 17 Jahre: 13:58 · 13:22 · 12:43 · 12:11 · 11:52
- Einsteiger, 30 Jahre: 14:04 · 13:33 · 12:58 · 12:29 · 12:10
- Einsteiger, 50 Jahre: 14:12 · 13:48 · 13:24 · 13:10 · 13:00
- Solide, 30 Jahre: 11:45 · 11:30 · 11:19 · 11:10 · 11:04
- Stark, 50 Jahre: bleibt bei etwa 9:55 (nah an der eigenen Grenze, altersbedingt leicht langsamer)

Alles liegt in den typischen Bereichen, kein Wert zu schnell oder zu langsam (feste Tests).

## Neu in der App
- **Fortschritt:** eine Prognose für jedes Ziel, das nächste zuerst. Platzhalter-Termine sind als „Platzhalter-Datum“ gekennzeichnet. Laufziele zeigen auch die anderen Distanzen heute und am Renntag.
- **Wunschzeit:** je Disziplin „nötig vs. Prognose“, Einordnung (realistisch / ambitioniert / sehr unwahrscheinlich), größter Hebel, Pacing für die Wunschzeit mit Warnung, wenn sie über deiner Leistung liegt. **Der Plan bleibt gleich.** Ausrichten nur per Knopf „Plan auf Wunschzeit ausrichten“ (nur Triathlon, mit Vorschau). Das ändert nur die Reihenfolge der Schwerpunkte, alle Sicherheitsregeln bleiben.
- **Einklappbar:** Leistung, Trends, Prognosen (jede einzeln), Umfang, Meilensteine. Die App merkt sich den Zustand. Eingeklappt steht das Wichtigste in der Zeile (z. B. „Halbmarathon: ca. 1:52–2:07“).
- **Tab-Leiste:** Halten (ab 0,2 s) oder über die Leiste wischen zeigt eine vergrößerte Glas-Linse. Sie federt nach, folgt dem Finger und hebt den Tab darunter hervor. Loslassen öffnet den Tab. Antippen bleibt sofort. Bei „Bewegung reduzieren“ springt sie ohne Animation. Hell und dunkel, verdeckt nichts.

## Tests
Typecheck ✓ · 2.592 Unit-Tests ✓ (neu 37: typische Zeiten je Niveau, Entwicklung 3/6/12/24/36 Monate nach Niveau, Alter und Umfang, Kraulen lernen, deine Werte, Platzhalter und Reihenfolge, „zuletzt aktualisiert“, Wunschzeit-Einordnung und Hebel, Pacing-Warnung, Plan bleibt bei Wunschzeit gleich, geplante lange Läufe) · Build ✓ · 485 Browser-Tests in Chromium und WebKit ✓ (113 wie bisher übersprungen; neu: Prognose je Ziel, Einklappen bleibt nach Neuladen, Wunschzeit speichern ohne Planänderung, Linse halten/wischen/loslassen/antippen, „Bewegung reduzieren“, Bildrate, hell/dunkel, große Schrift).
Echte Daten (Kopie von heute): Umstellung 649 → 649, alle 3 Konten laden fehlerfrei. Die Release-Prüfung rechnet ab jetzt auch die Prognose für jedes Ziel jedes Kontos.
Beim Veröffentlichen lief die Cloudflare-Anmeldung während des 30-minütigen Testlaufs ab. Das Skript hielt vor der ersten Sicherung an, es wurde nichts verändert. Nach dem Erneuern liefen die übrigen Schritte für denselben, schon geprüften Stand.

## Offen
- Die Glas-Linse habe ich in WebKit (der Safari-Engine) automatisch getestet, nicht auf einem echten iPhone. In WebKit ohne Grafikkarte läuft sie ab der zweiten Geste mit 60 fps (16 ms je Bild, wie ohne Linse; die App selbst braucht unter 0,1 ms). Die allererste Geste nach dem Öffnen braucht dort 22–33 ms, weil der Browser die Ebene zum ersten Mal zeichnet. Auf dem iPhone macht das die Grafikkarte.
- Die Entwicklungskurven sind Erfahrungswerte, keine Studie. Nach deinen ersten Wettkämpfen gleicht der persönliche Korrekturfaktor sie an.
- „Plan auf Wunschzeit ausrichten“ wirkt nur bei Triathlon-Zielen (Reihenfolge der Schwerpunkte). Laufpläne richten sich ohnehin nach dem Ziel.

Frühere Aufträge:

# Auftrag 22: Intervalle erfassen und auswerten, Fehler dauerhaft verhindern (30.10.)

**Stand:** Fertig und live (Version 3.10.0): erst Test-Umgebung mit einer frischen Kopie deiner Daten, dann echte App (Sicherungen beider Umgebungen vorher geprüft, Rückweg-Zeitpunkt der Datenbank festgehalten). Du musst nichts tun – App öffnen und „Aktualisieren“ tippen.

## 1. Intervalle (neu)
- Unter den Werten jeder Intervall-Einheit (Laufen, Rad, Schwimmen, Koppel) steht der Bereich **„Intervalle“**: die geplante Liste mit den Soll-Werten grau im Feld (zählen nie als gemacht). Je Intervall Dauer bzw. Strecke, Ø/max. Puls, Pace/Watt/km/h bzw. Pace pro 100 m, Kadenz, Züge pro Bahn, RPE, Notiz; je Pause Dauer und Puls am Ende. Hinzufügen, löschen, verschieben, „wie vorheriges“, „abgebrochen“; Enter springt zum nächsten Feld.
- **Automatisch:** Runden der Uhr (HealthFit/FIT), Abschnitte von intervals.icu, sonst harte Abschnitte aus dem Puls-/Tempo-/Watt-Verlauf. 1-km-Auto-Runden sind keine Intervalle. Hand gewinnt; „Uhrwerte verwenden“ holt sie zurück.
- **Anzeige:** Ø der Intervalle (nur harte Teile), Ø der Pausen, Balken je Intervall: im Ziel / zu hart / zu locker / kürzer / nicht gemacht. Gesamtwerte der Einheit bleiben wie bisher.
- **Coach:** im Ziel?, gleichmäßig oder abfallend, Pulsanstieg (Ermüdung), Erholung in den Pausen, Vergleich mit derselben Einheit vor 2-4 Wochen („gleiche Watt bei 5 Schlägen weniger“), dann: nächste Stufe / wiederholen / leichter, Zonen-Hinweis. Nächste Stufe nur mit passenden Ist-Werten. Scores zählen Intervalle mit Puls stark (Hand und Uhr nach Datenqualität).
- **Deine Einheit 28.10. „Rad-Intervalle 2×10 min Sweet Spot (Rolle)“** (nur Puls, aus dem gespeicherten Verlauf erkannt): Intervall 1: 10:00 min, Ø 149, max. 157 · Pause 3:20, Puls fällt auf 128 (−29) · Intervall 2: 10:25 min, Ø 150, max. 158. Bewertung: beide im Zielbereich (Puls), gleichmäßig (Puls +1), gute Erholung. Die Abschnitte trägt der nächtliche Daten-Check für ältere Aufzeichnungen nach.

## 2. Täglicher Daten-Check (alle Nutzer, nachts nach der Sicherung)
Prüft Werte, doppelte Einheiten und Meldungen, Trainingsregeln, Stufen gegen Ist-Werte, verwaiste Anpassungen. Repariert nur eindeutig Doppeltes; Rest steht gruppiert im Posteingang (ohne Gesundheitswerte). Erster Lauf auf der Kopie von gestern:

| Konto | Befund | Was passiert |
|---|---|---|
| du | 10 doppelte Coach-Meldungen | werden gelöscht |
| du | Teamsport 19.10.: 0 km bei 60 min (Uhr ohne GPS) | Ursache behoben: 0 km = „nicht gemessen“, zählt nicht mehr |
| du | 51 Anpassungen zu Einheiten, die es nach dem neuen Plan (27.10.) nicht mehr gibt | wirken nicht, nur gemeldet |
| Konto 2 | alter Plan (18.10.): 5× Ruhetage, 6× Lauf-Qualität vor dem Ziel, 1× Kraft in der Wettkampfwoche | nur gemeldet; neu geplant: 0 Verstöße |
| Konto 5 | alter Plan (17.10.): Kraft in der Wettkampfwoche | nur gemeldet; neu geplant: 0 Verstöße |

## 3. Gefundene und behobene Fehler
| Wo gefunden | Fehler | behoben |
|---|---|---|
| Zeit | Server rechnete für alle mit deutscher Zeit (Morgen-Anpassung, „heute“, Mitteilungen); Nutzer anderer Länder/auf Reisen falsch | Zeitzone je Nutzer vom Gerät ✓ |
| Zeit | Meldungen und Coach-Verlauf nach Mitternacht mit Vortag (UTC-Datum), Wochentag im Chat-Verlauf bis 2 Uhr falsch | Ortsdatum ✓ |
| Zeit | Zeitumstellung März/Oktober, So/Mo-Wechsel | geprüft, rechnete schon richtig; feste Tests ✓ |
| Sync | iPhone offline + PC an derselben Einheit, oder Uhr-Import während der Eingabe: eine Änderung ging verloren | feldweise zusammenführen ✓ |
| Zufallstests | Ziel mit kaputtem Datum ließ den Plan-Generator abstürzen | Datum geprüft ✓ |
| Zufallstests | Jugendliche: Woche 6,1 h statt höchstens 6 h | Kürzung wiederholt und am Ende ✓ |
| Zufallstests | Daten-Check stürzte bei beschädigten Einträgen ab | übersprungen und gemeldet ✓ |
| Langzeit-Simulation | Stufe zurück wurde von „Umfang ±x %“ derselben Woche wieder überschrieben | Umfang wirkt auf die angepasste Einheit ✓ |
| Langzeit-Simulation | nach Neuplanung zwei Stufen höher; lockere Formen (Steigerungen) ließen sich nicht zurücksetzen | höchstens eine Stufe weiter ✓ |
| Langzeit-Simulation | Wettkampf zählte als „längster lockerer Lauf“ (Score +11) | ausgenommen ✓ |
| Langzeit-Simulation | „2× Schwimmen“ kippte durch +2 min einer Stufen-Anpassung | 5 min Puffer ✓ |
| Prüfung | Lauf-Stufen wurden am Rad-Schwellenpuls gemessen | richtige Schwelle ✓ |
| Bedienbarkeit | iPhone-Einstellung „Größerer Text“ wirkte nicht (feste Pixel); Prognose ragte bei großer Schrift heraus | Schrift folgt dem iPhone (bis doppelt) ✓ |
| Bedienbarkeit | 6 Farbpaare im hellen Modus unter dem Mindest-Kontrast (z. B. Hinweis-Pillen, weißer Text auf Orange) | etwas dunkler, alle ≥ 4,5:1 ✓ |

Außerdem: Eingaben mit Grenzen (z. B. Puls 30-230, Komma oder Punkt) und Rückfrage („200 km in 30 min? Meintest du 20 km?“), gleiche Grenzen beim Import. Vor jedem Release: Kopie aller echten Daten umstellen und alle Nutzer laden lassen (gestern: alle 3 Konten fehlerfrei), Rückweg über Datenbank-Zeitpunkt + Sicherung.

## Tests
Typecheck ✓ · 2.555 Unit-/Server-Tests ✓ (neu u. a.: Intervalle aus FIT-Runden, ohne Runden, von Hand, abgebrochen, mehr als geplant, Schwimm-Sets, Koppel, Auto-Lap-Lauf; Zeitumstellung März/Oktober; iPhone+PC gleichzeitig, offline, Import während der Eingabe; Daten-Check; Release-Prüfung; Kontrast; 1.000 Zufallsfälle; Langzeit-Simulation 36 Nutzer mit Intervallen, 0 Befunde) · Build ✓ · 471 Browser-Tests in Chromium und WebKit ✓ (113 bewusst übersprungen wie bisher; neu: Intervall-Eingabe, große Schrift, VoiceOver-Namen, leerer Nutzer, 5 Grenzfälle). Mit allen echten Daten (Kopie von heute): Umstellung ohne Verlust (648 → 648), alle 3 Konten laden fehlerfrei. Echte App nach dem Deploy: keine Server-Fehler.

## Offen
- Alte Pläne von Konto 2 und 5 verletzen Regeln. Neu planen behebt es (geprüft); automatisch ändere ich fremde Pläne nicht.
- Die 51 verwaisten Anpassungen bei dir bleiben stehen (wirken nicht).
- Der Einrichtungscode für die Test-Umgebung in ZUGANG.local.md stimmt nicht mehr; deshalb habe ich die Test-Umgebung lesend über die Datenbank geprüft (keine Fehler). Den Daten-Check kannst du als Betreiber jederzeit selbst starten: Posteingang → „Daten-Check jetzt ausführen“ (sonst läuft er jede Nacht).
- VoiceOver habe ich automatisch geprüft (jedes Bedienelement hat einen Namen), nicht mit einem echten iPhone.

# Auftrag 21: mehr Werte, mehr Daten, Coach-Fehler, Jetzt abrufen, Langzeit-Simulation (28.10.)

**Stand:** Fertig und live (Version 3.9.0): erst Test-Umgebung mit deinen Daten geprüft, dann echte App (Sicherung vorher in data-export, geprüft). Du musst nichts tun – App öffnen und „Aktualisieren“ tippen.

## 0. Was von Codex kam
Codex hat seit 24.10. Version 3.7.1–3.8.0 gebaut (Plan C: Dashboard im Plan, Trainingsvorlagen, sicheres Speichern, Langzeit-Simulation mit 10 Profilen, Coach-/Schwimm-Fixes), aber nichts committet. 3.8.0 lief schon live (dein Freigabe-Skript am 28.10.). Alle 2.398 Unit-Tests waren grün → unverändert als eigener Commit übernommen. Kaputt war: doppelte Schwimm-Meldungen, Pull-Buoy-Wert, interner KI-Platzhalter (unten behoben).

## Was jetzt neu bzw. behoben ist
1. **Weitere Werte** (aufklappbar, optional, automatisch von Uhr/intervals.icu, von Hand änderbar): Laufen Höhenmeter, Schrittlänge, Bodenkontaktzeit, Leistung, Temperatur, Untergrund, Schuh · Rad Normalized Power, Höhenmeter, Temperatur, Verpflegung (g/ml), „drinnen (einfache Rolle)“ · Schwimmen Ø/max. Puls, Pace Brust, SWOLF, Beckenlänge, Hilfsmittel · Teamsport Distanz, Sprints. Höhenmeter/Temperatur von Hand rechnet der Score jetzt heraus; Laufband zählt schwächer; NP wird aus der Aufzeichnung berechnet.
2. **Scores mit mehr Daten:** alle Einheiten des letzten Jahres, ältere mit weniger Gewicht (keine harte 3-/6-Wochen-Grenze mehr), Hand = Uhr (nur Datenqualität zählt). „Warum?“ nennt z. B. „27 Läufe zählen insgesamt, davon 9 in den letzten 6 Wochen“. **Historie:** einmalig 12 Monate von intervals.icu bzw. HealthFit-Dropbox – nur als Aufzeichnungen für Scores, nichts im Plan, Handeinträge bleiben, nichts doppelt.
3. **Schwimmen:** Hilfsmittel an jeder Einheit (Symbol + Wort); Kickbrett und Pull Buoy je etwa jede 2. Einheit, nur vorhandene. **2:50 statt 2:25:** Anpassungen (z. B. neue Stufe) behielten den alten Tempo-Kontext → werden jetzt mit dem aktuellen Tempo neu gerechnet (bei dir 27.10.: 2:25). Tempo je Lage (Kraul/Brust) aus echten Werten (Uhr je Bahn, „Ø Pace Brust“, gemischte Einheiten herausgerechnet). **Pull Buoy:** Kraul und Pull Buoy laufen über einen Weg; „bestätigt“ = 2 Nachweise (2 Einheiten oder deine Angabe + 1 Einheit). Deine 100 m mit Pull Buoy vom 27.10. werden als Bestwert gemeldet und zählen nach der 2. Einheit (Kraul: 100 m = deine Angabe + 27.10.). **Doppelte Meldungen:** jede Meldung höchstens einmal je Anlass, für alle Meldungsarten; deine 9 Duplikate werden beim nächsten Öffnen gelöscht.
4. **„Jetzt abrufen“** bei jeder Verbindung (auch intervals.icu) und in jeder Einheit: „Abgerufen 18:42 – Lauf gefunden und eingetragen“ / „noch keine neue Aufzeichnung“. Höchstens einmal pro Minute; Anbieter-Grenzen in Worten. Garmin, COROS, Suunto, Wahoo, Polar: Weg über intervals.icu steht unter Verbindungen.
5. **Coach:** kein „Trainingsangabe (Begründung nicht für die KI freigegeben)“ mehr (Ursache: Oura-Schutz ersetzte alle Titel); Grund beim Verschieben freiwillig; Tauschen = ein Vorschlag „Tauschen: A (Di 28.10.) ↔ B (Do 30.10.)“; jeder Vorschlag zeigt was/von/nach mit „Bestätigen“/„Ablehnen“; feste Prüfung hinter jeder Antwort (interne Texte, Wochentag aus dem Datum, Artikel wie „den Schwimmtraining“); Kraft-Bewertung ohne Textbaustein. Test-Paket: über 200 Gespräche automatisch geprüft. In der Test-Umgebung mit deinen Daten gefunden: nach dem Update standen alte Bewertungen als „Korrigiert: … geänderten Werten“ da, obwohl nichts geändert war → „Korrigiert“ gibt es jetzt nur bei geänderten Werten.
6. **Rolle:** drinnen nie km/h; einfache Rolle: Puls + Gefühl (RPE), Smart-Trainer: Watt.
7. **Viele Nutzer:** data-export behält 5 neueste Sicherungen je Umgebung (Rest komprimiert, 722 → 290 MB, nie in Git). Fehler aller Nutzer gruppiert im Betreiber-Posteingang (ohne Gesundheitsdaten, auch Server-Fehler). Wachstumsrechnung 100/1.000 Nutzer in STORE-PLAN.md (Abschnitt 7): Engpässe D1-Größe, gelesene Zeilen, Rechenzeit → 5 kostenlose Lösungen schon umgesetzt, Rest mit Reihenfolge beschrieben.

## 8. Langzeit-Simulation
36 erfundene Nutzer, je 13–26 Wochen (zusammen 692 Wochen): 2.493 Einheiten genau, 764 kürzer, 567 ausgelassen, 239 extra, 135 Korrekturen, 1.384 Coach-Gespräche, Krankheit, Urlaub, Tests, Wettkämpfe, Uhr ab Woche 4. Nach jeder Woche geprüft: Trainingsregeln, Scores, Stufen, Hilfsmittel, Coach-Texte, Prognose, Fehler. Endstand: **0 Befunde**, als dauerhafter Test (tests/unit/longterm21.test.ts).

| Fehlerart | betroffene Nutzer | Ursache | behoben |
|---|---|---|---|
| Score springt nach einem Test (Rad 24 → 57) | 1 | Tests zählten ungeprüft voll, auch mit unmöglichem Wert (Dauer korrigiert, Strecke nicht) | Test > 28 % neben der Erwartung zählt erst nach Bestätigung ✓ |
| Kraft-Score bis 101 („Elite“) bei 2×/Woche | 18 (alle mit Kraft) | mein Jahres-Fenster aus Punkt 2: Einheiten eines Jahres ÷ 6 Wochen | Rate gleitend gewichtet ✓ |
| Score steigt am 1. Januar ohne Training | 1 sichtbar (alle über 35/unter 18) | Alter nur aus dem Geburtsjahr → Sprung am 1.1. | gleitendes Alter ✓ |
| „Langer Lauf +15 min“ nach gekürzter Woche | 23 | vom Coach gekürzte Woche galt nicht als reduzierte Woche | gilt jetzt als reduziert ✓ |
| Schwimm-Score fällt trotz Fortschritt | 2 | Tempo aus Zeit/Metern einer Technik-Einheit (Übungen, Pausen) zählte als Leistung | Technik-/Lern-Einheiten ohne Leistungstempo ✓ |
| (Prüfskript) falscher Wochentag, Pausen-Woche | 36 / 3 | Fehler in meinem Prüfskript (Jahreswechsel), nicht in der App | Skript berichtigt ✓ |

Gesamtzahl je Fehlerart: erster Lauf 7 Fehlerarten bei 36 Nutzern, nach den Fixes 0.

**Beispiel-Verläufe** (Score je Sportart, geplante/erledigte Minuten, Kraul-Stufe):

**17 Jahre, Langdistanz-Ziel, Fußball, Kraul-Anfänger, mit Fortschritt (13 Wochen)**

| Woche | Schwimmen | Rad | Laufen | Kraft | Plan min | erledigt min* | Kraul am Stück (Stufe) |
|---|---|---|---|---|---|---|---|
| 1 | 14 | 24 | 34 | 1 | 259 | 401 | 50 m (Stufe 3) |
| 4 | 17 | 24 | 35 | 24 | 167 | 401 | 100 m (Stufe 4) |
| 7 | 20 | 24 | 37 | 32 | 169 | 368 | 100 m (Stufe 4) |
| 10 | 24 | 24 | 39 | 36 | 176 | 461 | 400 m (normal) |
| 13 | 24 | 24 | 39 | 36 | 154 | 343 | 400 m (normal) |

**ca. 50, Rad und Laufen, Kraft 2×, 11 Tage Urlaub in Woche 8–9 (18 Wochen)**

| Woche | Rad | Laufen | Kraft | Plan min | erledigt min* | Kraul am Stück (Stufe) |
|---|---|---|---|---|---|---|
| 1 | 48 | 41 | 8 | 308 | 236 | – |
| 4 | 50 | 45 | 49 | 268 | 266 | – |
| 7 | 51 | 45 | 63 | 267 | 215 | – |
| 10 | 51 | 44 | 49 | 252 | 110 | – |
| 13 | 52 | 46 | 55 | 262 | 276 | – |
| 16 | 54 | 47 | 58 | 285 | 191 | – |
| 18 | 54 | 49 | 63 | 216 | 237 | – |

**27, Sprint-Triathlon, Teamsport, lernt Kraulen, Pause in Woche 8–9 (26 Wochen)**

| Woche | Schwimmen | Rad | Laufen | Plan min | erledigt min* | Kraul am Stück (Stufe) |
|---|---|---|---|---|---|---|
| 1 | 14 | 27 | 34 | 148 | 393 | 25 m (Stufe 2) |
| 4 | 16 | 28 | 32 | 127 | 206 | 25 m (Stufe 2) |
| 7 | 19 | 28 | 31 | 135 | 261 | 50 m (Stufe 3) |
| 10 | 22 | 27 | 30 | 132 | 144 | 100 m (Stufe 4) |
| 13 | 26 | 28 | 31 | 113 | 205 | 200 m (normal) |
| 16 | 26 | 28 | 31 | 109 | 192 | 400 m (normal) |
| 19 | 26 | 29 | 31 | 130 | 131 | 400 m (normal) |
| 22 | 26 | 29 | 33 | 106 | 244 | 400 m (normal) |
| 25 | 26 | 30 | 38 | 114 | 286 | 400 m (normal) |
| 26 | 26 | 31 | 38 | 111 | 173 | 400 m (normal) |

*erledigt inkl. Teamsport und Extra-Einheiten; Plan ohne feste Termine wie Teamsport.


## Tests
Typecheck ✓ · 2.477 Unit-/Server-Tests ✓ (darunter Langzeit-Simulation 36 Nutzer, 200+ Coach-Gespräche, neue Tests zu jedem Fehler) · Build ✓ · 453 Browser-Tests in Chromium und WebKit ✓ (113 bewusst übersprungen wie bisher). In der Test-Umgebung mit deiner Datenkopie: 9 doppelte Schwimm-Hinweise vom Server auf 1 reduziert, neue Schwimm-Meldung korrekt, keine Server-Fehler.


# Freigabe erteilt, Produktionssicherung blockiert – 28.10.2026

Jonah hat nach erfolgreicher Testbereitstellung 7d138192 die Produktionsveroeffentlichung beauftragt. Gespeichertes Gesamtprotokoll geprueft: 2398 Unit-/Servertests und 449 Browserpruefungen bestanden. Testsicherung erneut lokal validiert.

Produktionssicherung versucht; Wrangler kann api.cloudflare.com beziehungsweise dash.cloudflare.com aus dieser Sitzung nicht per DNS aufloesen. Kein Produktionsdeploy. Der vorhandene vollstaendige Freigabehelfer muss in normaler PowerShell laufen; Befehl in FUER-JONAH.md. Freigabe liegt vor.

Vorheriger Stand:

# Dropbox-Testfehler korrigiert – 28.10.2026

Testende lief vor abgeschlossenem Status-Neuladen; API-Antwort konnte bereits freigegeben sein. Bestehender Test wartet jetzt auf den vollstaendigen Fehlerablauf und beendet Handler geordnet. Alle bisherigen Assertions bleiben erhalten, Produktcode unveraendert.

Dropbox zehnmal bestanden; gesamte Datei 3 bestanden/1 bestehender Skip, Typecheck/Build bestanden. Isolierter Browsertransport, kein neuer vollstaendiger Standardlauf und kein Deploy. Vorhandenen Testseiten-Helfer ausserhalb der Sitzung erneut starten. Details: docs/dropbox-testfix-2026-10-28.md.

Vorheriger Stand:

# Coach-Auftrag lokal umgesetzt – 28.10.2026

Tatsaechliche Kraftuebungen/Bereiche haben Vorrang vor dem geplanten Titel. Kraul mit und ohne Pull Buoy wird getrennt und aus denselben Nachweisen ausgewertet. Schwimmhinweise werden zusammengefasst; abgelehnte Anlaesse bleiben erledigt, ueberholte Hinweise gekennzeichnet. Direkte Sportwahlfragen erhalten eine kurze Antwort; Beschwerden bleiben vorrangig.

Scorequellen und Schutz manueller/absolvierter Einheiten korrigiert. Reine Profilscores heissen Schaetzwert; keine neue Skala und keine erfundene Genauigkeit. Ein einmaliger 100-m-Rekord kann weiterhin eine erst mit zwei Einheiten bestaetigte Stufe von 50 m haben.

107 Browserpruefungen plus 10 nach endgueltiger Uebernahme, 632 gezielte Unit-/Serverpruefungen und zuletzt 214 Serverpruefungen bestanden. Typecheck/Build bestanden. Der breite Lauf hatte 2325 bestandene Tests und den anschliessend behobenen roten Race-Test; die regulaere HTTP-API-Suite bleibt blockiert. Kein vollstaendiges Standardgruen. Details und Protokolle: docs/coach-analyse-2026-10-28.md. Keine Produktionsdaten oder Deployments veraendert. Neuer Coach-Auftrag besitzt noch keine Produktionsfreigabe. Fruehere Freigabehinweise unten beziehen sich auf vorherige Auftraege.

Vorherige Ergebnisse:

# Layoutfehler vor Freigabe behoben (27.10.2026)

Alle 14 gemeldeten Fehler kamen vom neuen Dashboard-Schalter: Pfeil und Titel passten bei 320/300 CSS-Pixeln in WebKit nicht in ihren Platz. SVG-Pfeil mit fester Breite und passend umbrechender Titel beheben die Ursache. Keine Speicher- oder Datenbankaenderung.

69 gezielte Browserpruefungen bestanden, darunter alle 51 bestehenden WebKit-Layoutfaelle; elf Unitpruefungen, Typecheck und Build bestanden. Keine bestehenden Layoutassertions abgeschwaecht. Noch nicht veroeffentlicht: lokale HTTP-Probe bleibt EACCES; bestehender vollstaendiger Freigabehelfer muss ausserhalb dieser Sitzung laufen. Jonahs Freigabe liegt vor. Details: docs/dashboard-layoutfix-2026-10-27.md.

# Lokal fertig, noch nicht veroeffentlicht: 3.8.0 (27.10.2026)

Dashboard einklappbar, kryptische Istkurzform entfernt; Extraeinheiten direkt mit sportartspezifischen Werten, Kraft ohne Kilometer. Fehlgeschlagene Speicherungen behalten bei Wiederholung ihre neuen Eintraege. Formularabschluss verliert keinen neuen Entwurf.

111 gezielte Browserpruefungen bestanden; Typecheck/Build und 2301 Unit-/Servertests bestanden. Eine weitere API-Suite bleibt wegen gesperrtem lokalen HTTP-Zugriff blockiert. Der Releasehelfer hat deshalb vor Backup und Deployment abgebrochen. Jonahs Freigabe liegt vor; den verbleibenden Befehl zeigt FUER-JONAH.md. Details: docs/dashboard-extra-2026-10-27.md.

# Lexikon-Testfehler korrigiert - 27.10.2026

Die zwei Fehler aus Jonahs 419/113/2-Lauf wurden reproduziert. Der Test erwartete noch den alten direkten Kraftvorlagen-Menuepunkt. Er prueft jetzt den echten Weg Mehr -> Trainingsvorlagen -> bestehende Kraftvorlagen. Alle Lexikonpruefungen bleiben erhalten; gespeicherte Kraftvorlage zusaetzlich auf unveraenderten Inhalt geprueft.

Sechs gezielte Browserpruefungen in Chromium/WebKit bestanden, ebenso Typecheck und Build. Kein Produktcode veraendert, keine Veroeffentlichung. Den vorhandenen Teststarter in normaler PowerShell erneut starten; Ablauf und Standardtest-Gates unveraendert. Details: docs/lexikon-regression-2026-10-27.md.

Vorheriger Stand:

# Testseiten-Start vorbereitet - 27.10.2026

C mit erhaltenem Abhaken ist lokal eingebaut. Neu: scripts/plan-c-test.mjs und PLAN-C-TESTEN.cmd fuehren ausschliesslich Testsicherung und Testbereitstellung nach vollstaendigen Standardtests aus. Fehler verhindern folgende Schritte. 24 Pruefungen des Ablaufs bestanden; echter Windows-Start mit --plan ohne Netzwerk/Deploy geprueft.

Keine Test- oder Produktionsveroeffentlichung dieses Auftrags ausgefuehrt. Die Sitzung blockiert lokalen HTTP-Zugriff; Wrangler konnte OAuth nicht erneuern, weil Cloudflare Auth nicht erreichbar ist. Deshalb muss der vorbereitete Befehl in normaler PowerShell laufen; siehe FUER-JONAH.md. Ergebnis als einfaches PLAN-C-STATUS.txt statt Markdown-Dateilink.

Vorheriger Stand:

# Variante C eingebaut - 27.10.2026

Der Plan zeigt jetzt das ausgewaehlte Dashboard mit geplanter Zeit, erfassten Istminuten und Sportverteilung. Haken zum Abschliessen, Ruecknahme und nachtraegliche Istkorrekturen bleiben erhalten; fuer alle vier Sportarten getestet. Tageskarten, Wochenwahl, Vorlagen, Verschieben und Anpassungen bleiben erreichbar.

51 Plan-/Vorlagenfaelle, 22 Speicherfaelle und 67 gezielte Tests bestanden. Typecheck/Build und drei Browserpruefungen nach Uebernahme in den Originalordner erfolgreich. Gesamtlauf wegen HTTP-API-Setup nicht vollstaendig gruen; Details und vollstaendige Resultate: docs/dashboard-c-2026-10-27.md. Noch nicht veroeffentlicht.

Fruehere Staende:

# Plan und Trainingsvorlagen vorbereitet - 27.10.2026

Vorlagen fuer Schwimmen, Rad, Laufen und Kraft koennen bestehende Einheiten mit Vorschau ersetzen/ergaenzen oder neue Einheiten anlegen. Wochenuebergreifendes Verschieben/Tauschen, Summen, Zusatztrainings und Klappen korrigiert; Istwerte und abgeschlossene Historie geschuetzt. Drei bedienbare Designvorschauen liegen unter docs/previews/plan26/index.html. Empfehlung: A. Endgueltige Gestaltung wartet auf Jonahs Auswahl.

2.225 Tests mit zwei Workern bestanden (63 uebersprungen; HTTP-API-Suite separat blockiert). Darin 64 gezielte Tests; 36 neue Browserfaelle bestanden; zehn Testprofile mit 2.970 Aktionen konsistent. Drei Vorschauen mit 556 Assertions geprueft. Vollstaendige Resultate, Ursachen und Testgrenzen: docs/plan-qa-2026-10-26.md. Regulaerer HTTP-Gesamtlauf hier nicht bestaetigt. Keine Veroeffentlichung; echte App bleibt Version 3.7.2.

Fruehere Auftraege:

# Version 3.7.2 veroeffentlicht und geprueft

Die echte App ist aktualisiert: https://coach-app-efc7.pages.dev . Jonah meldete den erfolgreichen Abschluss des Veroeffentlichungsskripts. Den erfolgreichen Test- und Produktionsdeploy habe ich unabhaengig bei Cloudflare bestaetigt; der letzte lokale Browserlauf ist ebenfalls erfolgreich. Beide SQL-Sicherungen fuer 3.7.2 liegen unter data-export und wurden erneut lokal in Memory wiederhergestellt und auf Integritaet geprueft. Status: docs/release-3.7.2-status.json.

App neu oeffnen und eine angebotene Aktualisierung bestaetigen. Keine weiteren Terminalbefehle erforderlich.

Die folgenden Abschnitte dokumentieren fruehere Zwischenstaende.

# Aktuell: Start abgesichert, Veroeffentlichung noch angehalten

Der letzte normale Release-Lauf meldete 384 bestandene, 113 uebersprungene und einen fehlgeschlagenen WebKit-Fall (leerer App-Start bei n21-run-10k). Genaue Ursache unbestaetigt; vorher sechs Wiederholungen ohne Fehler. Start jetzt sichtbar und als loading/ready/error markiert; Test wartet auf echte Bereitschaft und erfasst Diagnosen. 16 Unit-Tests, 34 Speicher-/verwandte Browserfaelle und alle 15 vorgesehenen WebKit-Nutzer bestanden; Typecheck und Build erfolgreich. Normale HTTP-Gesamtpruefung bleibt erforderlich. Keine Veroeffentlichung; Jonahs Freigabe bleibt gueltig. Details: docs/startup-qa-2026-10-25.json.

Vorherige Staende:

# Veroeffentlichung 3.7.2: freigegeben, technisch blockiert

Jonah hat 385 bestandene und 113 uebersprungene Browserfaelle gemeldet und die Veroeffentlichung freigegeben. Upload hier am Netzwerk gescheitert: Wrangler kann OAuth nicht erneuern; der ueber Cloudflare erzeugte Testsicherungs-Export laesst sich wegen ENOTFOUND nicht herunterladen und validieren. Kein Code hochgeladen. Produktion weiterhin unveraendert (Cloudflare-Deployment vom 24.10.2026 geprueft). Keine weitere Freigabe erforderlich. Konkreter Befehl in FUER-JONAH.md; Status in docs/release-3.7.2-status.json.

# Aktueller Auftrag: Datensicherheit – 25.10.2026

Version 3.7.2 ist lokal vorbereitet, noch nicht veroeffentlicht. Speicher-/Lesefehler, Backup-Wiederherstellung, Tab-Abgleich und verschobene Einheiten wurden ueberarbeitet. Echte Trainingsdaten und Produktion wurden in diesem Auftrag nicht veraendert.

Bericht: docs/storage-report-2026-10-25.md. Exakte Testergebnisse: docs/storage-test-results-2026-10-25.json. Zuletzt: 120 gezielte Unit-/Worker-Tests und 28 Browserfaelle bestanden; vier synthetische Nutzer mit 2.160 Neustarts konsistent. Der normale HTTP-Gesamtlauf und der native Chrome-Download sind hier noch nicht bestaetigt. Die Browserpruefung nutzte einen isolierten Transport; zwei Chrome-Exporte erfassen die Datei am Web-Share-Rand. Keine Veroeffentlichung.

Die folgenden Abschnitte dokumentieren den vorherigen Auftrag.

# Ergebnis

## Aktuell: Version 3.7.1 veröffentlicht und geprüft

Die echte App ist aktualisiert: https://coach-app-efc7.pages.dev . Erfolgreicher Skriptabschluss von Jonah gemeldet; Test- und Produktionsdeployment zusätzlich bei Cloudflare bestätigt. Beide SQL-Sicherungen liegen unter data-export und sind durch erneutes Einlesen geprüft.

App neu öffnen und bei „Neue Version“ auf „Aktualisieren“ tippen. Die folgenden Abschnitte sind ältere Zwischenstände.


## Aktuell: Version 3.7.1 zur Veröffentlichung vorbereitet

Jonah hat die Veröffentlichung freigegeben. Wegen gesperrter Sicherungsdownloads, lokaler Server-/App-Zugriffe und nicht erneuerbarer lokaler Wrangler-Anmeldung wurde hier kein neuer Code veröffentlicht. Die bestehenden Cloudflare-Deployments sind unverändert.

Ein Startskript ist fertig: scripts/veroeffentlichen.mjs. Es prüft zuerst alle Tests, erstellt und validiert Sicherungen, veröffentlicht und prüft die Testumgebung und danach die echte App. 15 neue Sicherheits-/Ablaufprüfungen bestanden; aktueller Gesamtlauf 2.182 bestanden, keine unbehandelten Fehler, API-Setup nur hier blockiert. Test-/Produktionsbuild und Worker-Trockenlauf erfolgreich. Den einen erforderlichen PowerShell-Befehl enthält FUER-JONAH.md; Einzelheiten in docs/release-3.7.1.md.


## Aktuell: Testdatenfehler in den vier Ampel-Browserfällen korrigiert

Die Browserfälle erwarteten bei einem Erwachsenenprofil mit 6,5 h fälschlich Gelb; nach der bestehenden Regel ergibt das Grün. Gemeinsame synthetische Fixture jetzt mit 6 h. Neue Regression vor Korrektur fehlgeschlagen, danach bestanden; zehn gezielte Ampel-/Fixture-Prüfungen grün. Vollständiger Wiederholungslauf: 2.167 bestanden, keine unbehandelten Fehler, API-Setup nur hier am lokalen Serverzugriff blockiert. Typecheck und Build erfolgreich.

Jonah bestätigte nach der Korrektur 4 passed. Zusammen mit den zuvor gemeldeten 361 Erfolgen sind 365 Browserfälle über zwei Läufe bestätigt; 113 übersprungen. Kein neuer vollständiger gemeinsamer Lauf und keine Veröffentlichung. Details: docs/readiness-e2e-fixture-2026-10-24.md.


## Nachtrag: Worker-Timeouts behoben und erneut geprüft

Die vollständige parallele Wiederholung meldet 2.165 bestandene Fälle und **keine unbehandelten Fehler / keine RPC-Timeouts**. Drei neue Scheduling-Regressionen; native I/O-Pause nach jedem Test und jeder simulierten Woche. Versehentlich riesige Testnamen gekürzt. Details: docs/test-runner-2026-10-24.md.

Typecheck und Build erfolgreich. Die API-Datei bleibt nur in dieser Sitzung wegen gesperrtem lokalem Serverzugriff im Setup blockiert; der Gesamtlauf endet deshalb weiterhin mit Exit 1. Browsernachweis weiter offen. Keine Veröffentlichung. Die folgenden Zwischenstände sind ältere Läufe.


## Neuer Systemtest vom 24.10.2026 – lokal, noch nicht veröffentlicht

Ampel/Coach vereinheitlicht, Chat wartet auf aktuelle Synchronisierung, vergangene Trainings gegen spätes Kürzen geschützt und Planblock-Abstände korrigiert. Außerdem Sync-Rollback, manuelle Messkorrekturen, Fehlerprotokolle und Scorefilter verbessert. Details: [Prüfbericht](docs/qa-report-2026-10-24.md).

**Geprüft:** 10 künstliche Profile × 4/12/24/52 Wochen = 40 Verläufe, 920 virtuelle Wochen. Letzter Gesamtlauf: 2.162 Fälle bestanden, kein ausgeführter Fall fehlgeschlagen; 6 übersprungen. Typecheck und Build erfolgreich. Eine API-Datei scheitert im Setup am lokalen Serverzugriff; deshalb bleibt der Gesamtlauf Exit 1. 478 Browserfälle gesammelt, wegen lokalem EACCES nicht ausgeführt. Keine vollständig grüne Freigabe.

5.000 Trainings/15.000 Nachrichten: gezielter lokaler Auswertungs-Median 814 → 447 ms, gleiche Scorefilter-Ergebnisse im Snapshot. Keine Messung auf dem Handy.

Echte App und Daten wurden nicht verändert. Für den fehlenden lokalen API-/Browsernachweis siehe FUER-JONAH.md. Die folgenden Ergebnisse betreffen frühere Aufträge und deren damalige Veröffentlichungen.


## Auftrag 20: Scores zuverlässig, kleine Plan-Korrekturen (24.10.)

**Stand:** Fertig, getestet und live (Version 3.7.0): erst Test-Umgebung mit deinen Daten geprüft, dann echte App (Sicherung vorher in data-export). Dein Plan gilt ab morgen (25.10.). Tests: alle Unit-Tests grün, Browser-Tests 359 bestanden (Chromium und WebKit).

### 1. Scores
**Ursache Rad-Score 82:** Deine Rolle (Kuipers, ohne Wattmessung) zeigte geschätzte Watt (204-215 W bei Puls ~130). Daraus rechnete die App eine FTP von 381 W (5,2 W/kg). Jetzt zählen Watt nur von Wattmesser oder Smart-Trainer, die Rollen-Geschwindigkeit nie. In deinem Profil steht „einfache Rolle“.

**Dein Rad-Score: 82 → 44** (± 7, vorläufig, also etwa 37-51). Er stützt sich auf deinen Startwert und die zwei Fahrten draußen (23,4-23,5 km/h Gravel bei Puls 135-142). Mehr geben die Daten nicht her. Der Radtest am 28.10. macht ihn genau. Laufen 40, Schwimmen 28 (vorläufig), Kraft 55.

Neu für alle:
- Jede Einheit zählt nach Qualität: Rolle ohne Watt nur Dauer/Puls, Laufband weniger, GPS-Fehler gar nicht, sehr niedriger Puls nur vorsichtig.
- Jeder Score startet vorsichtig und heißt „vorläufig“, bis 5 brauchbare Einheiten oder ein Test da sind.
- Ausreißer zählen erst voll, wenn ein zweiter ähnlicher Wert kommt. Ohne Test höchstens etwa ±3 Punkte pro Woche, Tests dürfen mehr.
- Ohne Test kein Score weit über deinem Niveau (kein Rad-Score 80 für Rad-Neulinge).
- „Warum?“ sagt je Einheit: gezählt, gedämpft, begrenzt oder ignoriert (mit Grund). Der Coach meldet einmal: „Rad-Score neu berechnet: Rollen-Speed zählt nicht mehr“.

### 2. Plan-Korrekturen (für alle)
- **Schwimmen:** Dauer = Meter × dein Tempo (Uhr: etwa 2:25/100 m) + Pausen + Technik. Deine 1.200 m: **51-53 min statt 73-75 min**.
- **Donnerstag (Grundlage):** im Wechsel „Lauf mit Steigerungen“ und „Lauf mit Hügelsprints“.
- **Koppellauf:** ab Aufbau etwa jede 3. Woche, 10-15 min, Sonntag danach locker und kürzer.
- **Fußball & Co.** zählen bei der Lauf-Häufigkeit halb (Lexikon: „Mindest-Häufigkeit“).
- Dein Plan bis 2029 geprüft: 0 Regelverstöße, Umfang und Intensität ohne Fehler.

### 3. Fehlerjagd
50 neue Test-Nutzer (Rolle ohne Watt, Smart-Trainer, wenige Daten, Ausreißer, Pause, Test, Laufband, GPS-Fehler, ohne Puls, Wattmesser × 5 Ziele). Die alte Rechnung hatte dort 165 Score-Funde, die neue 0. Dazu behoben: gleiche Sportart So/Mo nach dem Ruhetag, Lauf-Geh-Einheiten verdoppelten sich beim Neuplanen, Hügelsprints in 20-min-Läufen, Umfangsbremse nach Test-Wochen, Schwimmen nach Wettkampf 1 min zu lang, falsche Aussage „34 Schläge weniger Puls“. Alles als dauerhafte Tests.

## Auftrag 19: Plan-Regeln, Einheiten-Bibliothek, neue Scores, großer Test (23.10.)

**Stand:** Alles fertig, getestet und live (Plan-Tab nach deiner Wahl C, Version 3.6.1).

### 1. Dein Plan vorher/nachher (gilt ab 24.10.)
Wochenraster wie gewünscht (Mo Fußball · Di Schwimmen + Kraft Ganzkörper 30 min · Mi Rad-Intervalle, jede 2. Woche Ruhetag mit Sweet Spot in der Samstags-Ausfahrt · Do Lauf, ab Februar Schwelle/HM-Tempo · Fr früh lockeres Rad auf der Rolle, abends Spiel · Sa Schwimmen + lange Ausfahrt, Koppel jede 3. Woche · So langer Lauf, Tempo-Teil jede 2. Woche ab Februar · Erholungswoche Mi und So frei). Geprüft bis zum Ende (Ironman 2029, 196 Wochen inkl. Server-Verlängerung): **Regelverstöße vorher 22 (13× zu wenig Läufe, 6× kein Ruhetag, 3× Tempo im langen Lauf zu oft), nachher 0**; Umfang und Intensität ohne Fehler.

| Woche | Phase | eigene Stunden | Läufe | Ruhetage | hart (eigene+Spiel) | langer Lauf (min) | lange Ausfahrt (min) |
|---|---|---|---|---|---|---|---|
| 6 (19.10.) | Grundlage | 6.3 → 6.4 | 2 | 0 | 0+1 | 75 → 70 | 50 |
| 7 (26.10.) | Grundlage | 6.2 → 6.6 | 1 → 2 | 1 | 1+1 | 75 → 80 | 70 → 65 |
| 8 (02.11.) | Grundlage | 6.8 → 7.4 | 1 → 2 | 1 → 0 | 1+1 | 85 → 90 | 85 → 70 |
| 9 (09.11.) | Grundlage (Erh.) | 4.7 → 3.7 | 2 → 1 | 1 → 2 | 0+1 | 55 → 40 | 40 |
| 10 (16.11.) | Grundlage | 7.2 → 7.7 | 1 → 2 | 1 → 0 | 1+1 | 95 → 100 | 90 → 70 |
| 11 (23.11.) | Grundlage | 7.7 → 7.3 | 1 → 2 | 1 | 1+1 | 105 → 100 | 95 → 80 |
| 12 (30.11.) | Grundlage | 7.9 → 8 | 1 → 2 | 1 → 0 | 1+1 | 105 | 110 → 80 |
| 13 (07.12.) | Grundlage (Erh.) | 5.9 → 4.1 | 1 | 1 → 2 | 1+1 → 0+1 | 70 → 40 | 70 → 50 |
| 14 (14.12.) | Grundlage | 6.5 → 7.6 | 1 → 2 | 1 → 0 | 2+1 | 55 | 90 |
| 15 (21.12.) | Grundlage | 7.9 → 7.5 | 1 → 2 | 1 | 1+1 | 105 | 125 → 90 |
| 16 (28.12.) | Aufbau | 7.9 → 8.2 | 1 → 2 | 1 → 0 | 1+1 | 105 | 130 → 105 |
| 17 (04.01.) | Aufbau (Erh.) | 5.6 → 4.1 | 2 → 1 | 1 → 2 | 0+1 | 70 → 40 | 80 → 65 |
| 18 (11.01.) | Aufbau | 8.3 → 8.6 | 1 → 2 | 1 → 0 | 1+1 | 105 | 140 → 115 |
| 19 (18.01.) | Aufbau | 8.6 → 8.2 | 1 → 2 | 1 | 1+1 | 105 | 150 → 130 |
| 20 (25.01.) | Aufbau | 8.6 → 9.4 | 1 → 2 | 1 → 0 | 1+1 | 105 | 150 → 140 |
| 21 (01.02.) | Aufbau (Erh.) | 6.3 → 4.6 | 1 | 1 → 2 | 1+1 → 0+1 | 70 → 40 | 90 → 85 |
| 22 (08.02.) | spezifisch | 6.5 → 7.7 | 1 → 2 | 1 → 0 | 2+1 | 55 | 90 |
| 23 (15.02.) | spezifisch | 7.3 → 7.9 | 1 → 2 | 1 | 2+1 → 1+1 | 105 → 100 | 90 → 105 |
| 24 (22.02.) | spezifisch | 7.3 → 8.9 | 1 → 2 | 1 → 0 | 2+1 | 105 (Tempo) | 90 |
| 25 (01.03.) | spezifisch (Erh.) | 5.9 → 4.1 | 2 → 1 | 1 → 2 | 0+1 | 70 → 40 | 90 → 55 |
| 26 (08.03.) | spezifisch | 7.3 → 9.1 | 1 → 2 | 1 → 0 | 2+1 | 105 (Tempo) | 90 |
| 27 (15.03.) | spezifisch | 7 → 8.1 | 1 → 2 | 1 | 2+1 → 1+1 | 105 → 100 | 75 → 105 |
| 28 (22.03.) | Tapering | 5.4 → 6.1 | 1 → 2 | 1 → 0 | 2+1 | 65 (Tempo) | 70 → 65 |
| 29 (29.03.) | Wettkampf | 2.3 → 2.8 | 0 → 1 | 2 → 1 | 0+2 | 0 → 25 | 50 → 30 |
| 30 (05.04.) | Grundlage (Erh.) | 5 → 4.1 | 1 | 1 → 2 | 0+1 | 40 | 60 |
| 31 (12.04.) | Aufbau | 5.9 → 7.2 | 1 → 2 | 1 → 0 | 2+1 | 55 | 75 |

Lauf-Qualität bis zum Halbmarathon: Grundlage Steigerungen, ab Februar jede Woche eine (im Wechsel Do und So, nie beide). Schwimmen neu jede Woche ein kurzer harter Teil (vorher 0).

### 1b/1c. Qualität und Bibliothek
Neue Einheiten-Bibliothek (52 Formen, Mehr → Lexikon → Einheiten, mit Bild). Stufen steigen nur, wenn die letzte laut Daten geklappt hat. Gelände-Frage („Hügel, Laufbahn, Laufband“) mit Ersatz.

Harte Einheiten pro normaler Woche (Schnitt, nur wer die Sportart macht):

| Phase | Laufen vorher → nachher | Rad | Schwimmen |
|---|---|---|---|
| Grundlage | 0,2 → 0,2 (dazu Steigerungen/Hügelsprints) | 0,5 → 0,6 | 0 → 0,7 |
| Aufbau | 0,6 → 0,5 | 0,6 → 0,6 | 0,3 → 0,6 |
| spezifisch | 0,6 → 0,6 | 0,6 → 0,5 | 0,3 → 0,5 |
| Tapering | 0,7 → 0,6 | 0,9 → 0,8 | 0,2 → 0,7 |
| **Du** (bis HM) | Grundlage 0,1, spezifisch 1,0 | 0,9-1,0 | 0 → 0,9-1,0 |

Welche Formen je Ziel, Niveau und Phase (Auszug; alle 52 Kombinationen in test-results/auftrag19-bibliothek.json):

| Ziel | Niveau | Phase | Laufen | Rad | Schwimmen |
|---|---|---|---|---|---|
| 10 km | Einsteiger | Grundlage | Steigerungen, Tempowechsel-Lauf (Fahrtspiel), Lauf-ABC + Steigerungen, Progressionslauf | – | – |
| 10 km | Einsteiger | Aufbau | Schwellen-Intervalle, Tempowechsel-Lauf (Fahrtspiel), 30/30 | – | – |
| 10 km | Einsteiger | spezifisch | Tempowechsel-Lauf (Fahrtspiel), Schwellen-Intervalle | – | – |
| 10 km | Fortgeschritten | Grundlage | Steigerungen, Tempowechsel-Lauf (Fahrtspiel), Lauf-ABC + Steigerungen, Progressionslauf | – | – |
| 10 km | Fortgeschritten | Aufbau | Schwellen-Intervalle, VO2max-Intervalle, Lauf-Pyramide, Tempowechsel-Lauf (Fahrtspiel) | – | – |
| 10 km | Fortgeschritten | spezifisch | Wettkampftempo-Blöcke, VO2max-Intervalle, Schwellen-Intervalle, Tempowechsel-Lauf (Fahrtspiel) | – | – |
| Halbmarathon | Einsteiger | Grundlage | Steigerungen, Tempowechsel-Lauf (Fahrtspiel), Lauf-ABC + Steigerungen, Progressionslauf | – | – |
| Halbmarathon | Einsteiger | Aufbau | Schwellen-Intervalle, 30/30 | – | – |
| Halbmarathon | Einsteiger | spezifisch | Schwellen-Intervalle | – | – |
| Halbmarathon | Fortgeschritten | Grundlage | Steigerungen, Tempowechsel-Lauf (Fahrtspiel), Lauf-ABC + Steigerungen, Progressionslauf | – | – |
| Halbmarathon | Fortgeschritten | Aufbau | Schwellen-Intervalle, VO2max-Intervalle, 30/30 | – | – |
| Halbmarathon | Fortgeschritten | spezifisch | Wettkampftempo-Blöcke, Schwellen-Intervalle | – | – |
| Olympisch | Einsteiger | Grundlage | Steigerungen, Tempowechsel-Lauf (Fahrtspiel), Lauf-ABC + Steigerungen, Progressionslauf | Sweet Spot, Sprints | Kurze schnelle Stücke |
| Olympisch | Einsteiger | Aufbau | Schwellen-Intervalle, 30/30 | Sweet Spot | CSS-Intervalle, Schwellen-Sets, Kurze schnelle Stücke |
| Olympisch | Einsteiger | spezifisch | Tempowechsel-Lauf (Fahrtspiel), Schwellen-Intervalle | Sweet Spot | CSS-Intervalle, Schwellen-Sets, Kurze schnelle Stücke |
| Olympisch | Fortgeschritten | Grundlage | Steigerungen, Tempowechsel-Lauf (Fahrtspiel), Lauf-ABC + Steigerungen, Progressionslauf | Sweet Spot, Kraftausdauer (niedrige Kadenz), Sprints | Kurze schnelle Stücke, Pyramide |
| Olympisch | Fortgeschritten | Aufbau | Schwellen-Intervalle, VO2max-Intervalle, 30/30 | Sweet Spot, Schwelle, Over-Unders, VO2max, Kraftausdauer (niedrige Kadenz) | CSS-Intervalle, Schwellen-Sets, Absteigend / negativ, Kurze schnelle Stücke, Pyramide |
| Olympisch | Fortgeschritten | spezifisch | Wettkampftempo-Blöcke, VO2max-Intervalle, Schwellen-Intervalle, Tempowechsel-Lauf (Fahrtspiel) | VO2max, Schwelle, Over-Unders, Zeitfahr-Simulation, Sweet Spot | CSS-Intervalle, Geteilte Strecke, Wettkampfstart, Schwellen-Sets, Absteigend / negativ |
| Langdistanz | Einsteiger | Grundlage | Steigerungen, Tempowechsel-Lauf (Fahrtspiel), Lauf-ABC + Steigerungen, Progressionslauf | Sweet Spot, Sprints | Kurze schnelle Stücke |
| Langdistanz | Einsteiger | Aufbau | Schwellen-Intervalle, 30/30 | Sweet Spot | CSS-Intervalle, Schwellen-Sets, Kurze schnelle Stücke |
| Langdistanz | Einsteiger | spezifisch | Schwellen-Intervalle | Sweet Spot | CSS-Intervalle, Schwellen-Sets, Kurze schnelle Stücke |
| Langdistanz | Fortgeschritten | Grundlage | Steigerungen, Tempowechsel-Lauf (Fahrtspiel), Lauf-ABC + Steigerungen, Progressionslauf | Sweet Spot, Kraftausdauer (niedrige Kadenz), Sprints | Kurze schnelle Stücke, Pyramide |
| Langdistanz | Fortgeschritten | Aufbau | Schwellen-Intervalle, Tempodauerlauf, 30/30 | Sweet Spot, Schwelle, Over-Unders, VO2max, Kraftausdauer (niedrige Kadenz) | CSS-Intervalle, Schwellen-Sets, Absteigend / negativ, Kurze schnelle Stücke, Pyramide |
| Langdistanz | Fortgeschritten | spezifisch | Wettkampftempo-Blöcke, Schwellen-Intervalle | Lange Ausfahrt mit Renntempo-Blöcken, Sweet Spot, Schwelle, Over-Unders | CSS-Intervalle, Geteilte Strecke, Wettkampfstart, Schwellen-Sets, Absteigend / negativ |
| Fitness | Einsteiger | Grundlage | Steigerungen, Tempowechsel-Lauf (Fahrtspiel), Lauf-ABC + Steigerungen, Progressionslauf | Sweet Spot, Sprints | – |
| Fitness | Einsteiger | Aufbau | Tempowechsel-Lauf (Fahrtspiel), Progressionslauf, 30/30, Schwellen-Intervalle | Sweet Spot | – |
| Fitness | Einsteiger | spezifisch | Progressionslauf, Schwellen-Intervalle, Tempowechsel-Lauf (Fahrtspiel) | Sweet Spot | – |
| Fitness | Fortgeschritten | Grundlage | Steigerungen, Tempowechsel-Lauf (Fahrtspiel), Lauf-ABC + Steigerungen, Progressionslauf | Sweet Spot, Kraftausdauer (niedrige Kadenz), Sprints | – |
| Fitness | Fortgeschritten | Aufbau | Tempowechsel-Lauf (Fahrtspiel), Progressionslauf, 30/30, Schwellen-Intervalle | Sweet Spot, Schwelle, Over-Unders, VO2max, Kraftausdauer (niedrige Kadenz) | – |
| Fitness | Fortgeschritten | spezifisch | Progressionslauf, Schwellen-Intervalle, Tempowechsel-Lauf (Fahrtspiel) | VO2max, Schwelle, Over-Unders, Sweet Spot | – |

Unter 18 (Halbmarathon, Aufbau): Schwellen-Intervalle, Tempowechsel-Lauf (Fahrtspiel) – nie Zone 5.

### 2. Scores neu (5 Sätze)
Jeder Score ist jetzt eine laufende Schätzung wie bei einem Kalman-Filter: jede Einheit ist eine Messung mit eigener Genauigkeit (Test am genauesten, dann harte Einheit mit Puls/Watt, dann lockere mit Puls, am ungenauesten nur Gefühl). Fehlende Werte ändern nichts am Wert, nur die Unsicherheit wächst; ohne Training sinkt der Wert langsam (ab 10 Tagen etwa 1 % pro Woche, mit anderem Ausdauertraining halb so viel), Krankheit macht Messungen unsicherer. Neben dem Score steht der Bereich („± 2, gut belegt“ oder „± 6, wenig Daten“), und „Warum?“ zeigt die letzten 3-5 Einheiten mit + oder − und Grund. Die feste Skala und die drei Marken (nötig, Etappenziel, Wunschzeit) bleiben; der Verlauf ist mit der neuen Rechnung berechnet, und 4 Wochen lang steht dabei, was die alte ergeben hätte. **Beispiel:** 14 lockere Läufe mit Puls ergeben 48 (± 2); ein 30-min-Lauftest danach hebt auf 51 („+3 … Test, zählt stark“), ein gleich schneller lockerer Lauf bewegt ihn kaum („±0 … wie erwartet“), 4 Wochen Pause senken auf 45.

### 3. Plan-Tab: Variante C (deine Wahl, 24.10.)
Oben ein Balken pro Tag (Höhe = Minuten, Farbe = Sportart, Blitz = hart), darunter jeder Tag als Zeile. Heute ist aufgeklappt, ein Tipp klappt einen anderen Tag auf, nochmal zu. **Unter jeder Einheit steht kurz, was du machen sollst**, z. B. „15 min einlaufen · 3×8 min an der Schwelle, 2 min locker dazwischen · 10 min auslaufen“ (Schwimmen mit Metern, Kraft mit Übungen). Liste und Raster sind entfernt. Getestet auf 320/390/430 px, hell und dunkel.

### Krank oder verletzt (deine Frage, 24.10.)
Gab es schon, aber versteckt: „Ich bin krank“ lag auf Heute unter „Warum?“, Schmerzen gingen nur per Chat. Jetzt steht auf Heute sichtbar **„Krank oder verletzt?“** mit zwei Knöpfen:
- **Ich bin krank:** Krankheitsphase ab heute, alle Einheiten fallen aus, bis du „Wieder gesund“ tippst; danach Wiedereinstieg in Stufen (wie bei deiner Erkältung).
- **Schmerzen / verletzt:** Der Coach fragt „Wo?“ (Knie, Achillessehne, Wade, Schienbein, Fuß, Hüfte, Rücken, Schulter, woanders) und „Wie stark?“. Leicht: weiter, aber schonender planen. Mittel (4-6): statt Laufen Rad oder Schwimmen gleich lang, schonender planen. Stark (7-10): Läufe und Hartes der nächsten Tage fallen weg, ärztlich anschauen lassen. Du bestätigst mit einem Tipp, rückgängig geht auch.

### 4. Großer Test
54 neue Test-Nutzer (alle Ziele; Uhr, von Hand, Watt, nur Puls; mit/ohne Teamsport; wenig/viel Zeit; 14-70 J.; dazu „wie Jonah“ und zwei Laufziele hintereinander), komplett: Fragebogen → Plan → 3 Wochen mit erledigten, abweichenden, ausgelassenen und Extra-Einheiten und Korrekturen → Coach → Scores/Trend/Prognose → Profil ändern → Verlängerung bis zum Ende. Dazu in der App (Chromium + WebKit): kein seitliches Scrollen, keine Konsolen-Fehler, keine Betreiber-Infos, nur gewählte Sportarten, Bereich beim Score. Alles dauerhafte Tests.

| Regel (gleiche 54 Nutzer, heutige Prüfung) | vorher (Nutzer) | nachher |
|---|---|---|
| Mindest-Häufigkeit je Sportart | 83 (15) | 0 |
| Ruhetage | 19 (1) | 0 |
| Tempo im langen Lauf nur jede 2. Woche | 10 (4) | 0 |
| Intensität im langen Lauf | 10 (4) | 0 |
| Laufumfang +10 % | 8 (7) | 0 |
| Umfang +10 % | 1 (1) | 0 |
| fehlende Qualität in einer Phase | 1 (1) | 0 |
| **Summe** | **132** | **0** |

Dabei gefunden und an der Ursache behoben: Hügelsprints wurden beim mehrfachen Kürzen zu „5 min Zone 3“; Qualitätslauf länger als das Können; Tapering ohne kurzen Reiz bei Wochenend-Läufern; Schwellen-Einheit mit 2 Stücken ließ sich nicht kürzen; vor Laufzielen bei unter 18-Jährigen Tempowechsel statt Schwelle; kein freier Tag für den Qualitätslauf genutzt; Ruhe nach dem Ironman fehlte in verlängerten Plänen; Schwimm-Score fiel durch ein kurzes Kraul-Stück; „Fehler erledigt“ in derselben Millisekunde.

**Selbst-Review als neuer Nutzer, Top 10:**
1. ✓ „Warum?“ sagte „±0 … schwächer als erwartet“ – Richtung passt jetzt zur Zahl.
2. ✓ „Warum?“ wiederholte die Sportart („Schwimmen: … Schwimmen“) – weg.
3. ✓ Heute: „ATL/CTL 1,44“ → „etwa 44 % mehr als gewohnt“.
4. ✓ Heute: „Zuletzt: Langer Lauf 50 min · 34 min“ → Titel ohne Plan-Minuten.
5. Offen: Fortschritt ist sehr lang (über 20 Trend-Karten) – Vorschlag: Trends eingeklappt, nur die 3 wichtigsten offen.
6. Offen: Hinweis-Meldungen unten („Schwimmen: bitte prüfen“) verdecken kurz die Wochenleiste auf Heute.
7. Offen: Coach-Karte auf Heute schneidet den Text ab, ohne „mehr“.
8. Offen: Bild der Einheit (Lexikon/Einheit) ohne Beschriftung der Zonen.
9. Offen: „Neu berechnet …“ steht 4 Wochen ganz oben im „Warum?“ – reicht vielleicht einmal.
10. ✓ Plan-Tab: Variante C mit Kurzbeschreibung; Krank/verletzt sichtbar auf Heute.

### Veröffentlicht
**Live in der echten App (Version 3.6.0)** seit 24.10., 0:20 Uhr, vorher in stamio-test mit einer frischen Kopie deiner Daten geprüft. Sicherung: `data-export/prod-vor-auftrag19-final.sql`. In der echten App geändert: nur dein Plan ab heute, Profil (Wochenraster), eine Coach-Nachricht „Plan angepasst“ und die Sperre gegen alte App-Versionen (Plan/Profil erst ab 3.6.0). Alle 357 Datensätze sind erhalten. Tests: Typen, 1974 Unit-Tests, Build, 350 Browser-Tests (Chromium + WebKit) grün. **Update 3.6.1 (24.10.):** Plan-Tab C mit Kurzbeschreibung und „Krank oder verletzt?“ auf Heute, erst in stamio-test, dann in der echten App; keine Daten verändert. Beim Bearbeiten des Plans sind alle Tage aufgeklappt.

## Auftrag 18: Trainingsregeln, ehrlicher Coach, Plan-Tab, großer Test (23.10.)

**Live in der echten App (Version 3.5.0)**, vorher in stamio-test mit einer Kopie deiner Daten geprüft. Sicherungen: `data-export/prod-2026-10-23.sql`, `prod-vor-release18.sql`. In der echten App geändert: nur dein Plan ab heute, Profil (Stand Auftrag 17 + Schwimm-Tempo), Einstellungen, eine Coach-Nachricht „Plan angepasst“ und die Sperre gegen alte App-Versionen. Alle 354 Datensätze sind erhalten.

**1. Coach nennt Ursachen nur mit Daten.** „Wenig Schlaf erklärt den höheren Puls“ kommt nur noch, wenn Schlaf und Puls für diesen Tag da sind und der Puls bei gleichem Tempo mindestens 5 Schläge über deinem 6-Wochen-Schnitt liegt (Hitze nur mit gemessenen ab 25 °C). Sonst neutral: „Du hast nur 5,5 h geschlafen, mach heute lieber locker.“ Ein Prüfer streicht unbelegte Ursachen vor jeder Anzeige (Regel-Coach und KI). 15 feste Tests (wenig Schlaf ohne Puls, mit normalem, mit erhöhtem Puls, Hitze ohne Temperatur, Müdigkeit ohne Belastungsgefühl …).

**2. Trainingswissen als feste Regeln** (Generator und Plan-Check, Quellen in [docs/TRAININGSREGELN.md](docs/TRAININGSREGELN.md)): Ruhetag (unter 18/Einsteiger 2), nach langem Tag kein langer/harter Lauf, höchstens 2 Sportarten pro Tag, harte Tage nie nebeneinander und nicht vor Spiel/Wettkampf, Lauf-Qualität in den 7 Wochen vor einem Laufziel, Wettkampfwoche ohne Kraft (Spiel kurz davor → Woche leichter + Hinweis), danach locker, lange Einheiten passend zum Ziel und +10 min/Woche, Beine-Kraft nie vor Spiel/Wettkampf/langem Lauf.

**3. Plan-Tab:** Wochenleiste bleibt bei der gewählten Woche (mittig), öffnet bei der aktuellen, Knopf „Heute“. Kurze Chips (Woche, Datum, Phasen-Punkt, Symbole Erholung/Test/Wettkampf). Pro Woche eine Zeile (Phase, Ziel, Stunden) und 7 Tage als Liste mit Symbol, Titel, Dauer, Blitz für hart, „Ruhetag“; Details beim Antippen. Zeitleiste zeigt die gewählte Woche. Geprüft: alle Wochen bei 320-430 px, hell und dunkel, Chromium und WebKit.

**4. Großer Test:** 69 Nutzer (14-75 J., alle Ziele und Sportarten, mit/ohne Teamsport, wenig/viel Zeit, dazu: Jugendlicher mit Fußball + Halbmarathon, Triathlet mit Koppel-Wochen, 10 km in 6 Wochen, Wettkampf am Tag nach dem Spiel). Jeder ganze Plan gegen alle Regeln, Coach-Texte gegen Punkt 1. Bleibt als Test.

| Regel | Verstöße vorher (Nutzer) | nachher |
|---|---|---|
| Ruhetag | 292 (14) | 0 |
| Kraft Beine nicht vor Spiel/Wettkampf/langem Lauf | 168 (20) | 0 |
| Wettkampfwoche ohne Kraft und Hartes | 35 (28) | 0 |
| Lange Einheit höchstens +10 min/Woche | 22 (11) | 0 |
| Nach langem Tag kein langer/harter Lauf | 15 (6) | 0 |
| Lauf-Qualität vor dem Laufziel | 14 (7) | 0 |
| Harte Einheit mit Ein-/Auslaufen | 7 (4) | 0 |
| Locker nach dem Wettkampf | 2 (1) | 0 |
| Erholungswoche ohne Intervalle | 2 (1) | 0 |
| übrige Regeln (Jugend-Stunden, 2 Sportarten, harte Einheiten, Abstand, Spieltag-Kraft, Tests, Dreifach-Tage) | 0 | 0 |
| **Summe** | **557 (43 von 69 Nutzern)** | **0** |

„Vorher“ = Stand Auftrag 17 (gleiche Nutzer, neue Prüfung). Gefunden und behoben: Generalprobe vor Triathlons war nie aktiv (Fehler), doppelter Spiel-Hinweis, Ruhetag wechselte von Woche zu Woche, kein Platz für Tempolauf (jetzt ehrlicher Hinweis), die Sperre gegen alte App-Versionen hätte nie gegriffen (App schickte einen Zeitstempel statt der Version).

**5. Kraft und Erholungswochen:** Kraft am Spieltag nur Oberkörper/Rumpf, höchstens 30 min, nicht direkt vor dem Spiel; keine in der Wettkampfwoche. Erholungswochen ohne Intervalle (Tests erlaubt), Test nicht am Tag nach einem Spiel.

**6. Zusätzliches Wissen** (nur Fehlendes, markiert in TRAININGSREGELN.md): Schmerz-Skala (ab 4/10 Lauf → lockeres Rad, Arzt/Physio), Wiedereinstieg nach Pause, Hals-Regel bei Erkältung, verpasste Woche wird wiederholt, Hinweise in Einheiten (Verpflegung ab 80 min, Essen danach, Hitze/Kälte/Regen, Lauf-ABC), Schlaf 8-10 h unter 18, Saison-Hinweis, Generalprobe vor Triathlon, freiwillig Laufschuh-km und Zyklus, Lexikon „Training verstehen“ (Übungen wie 6-3-6, Abschlag), Coach beantwortet „Warum habe ich heute frei?“, KI bekommt die Regeln als Kontext.

**Dein Plan** (ab heute, Vergangenes bleibt): vorher 79 Regelverstöße (u. a. 25 Wochen ohne Ruhetag, 17× langer Lauf nach langem Tag, 15 Tage mit 3 Sportarten), nachher 0. Neu: Donnerstag Ruhetag; Samstag Schwimmen + lange Ausfahrt ohne Koppel; Sonntag langer Lauf, ab Februar mit Halbmarathon-Tempo (dann Samstag kürzer); Wettkampfwoche ohne Kraft, leichter, Hinweis zum Spiel am Freitag; danach eine Woche locker. Weil Laufen nur Do/Sa/So geht, bleibt bis zum Halbmarathon ein eigener Lauf pro Woche (plus 2× Fußball).

| Woche | Phase | eigene h | Einheiten | hart (eigene+Spiel) | Ruhetage | Doppel/Dreifach | langer Lauf | lange Ausfahrt |
|---|---|---|---|---|---|---|---|---|
| 6 (19.10.) | Grundlage | 6.4 → 6.3 | 8 → 8 | 1+1 → 0+1 | 0 → 0 | 3/0 → 3/0 | 55 → 75 | 75 → 50 |
| 7 (26.10.) | Grundlage | 7.4 → 6.2 | 8 → 7 | 1+1 → 1+1 | 0 → 1 | 3/0 → 3/0 | 65 → 75 | 105 → 70 |
| 8 (02.11.) | Grundlage | 8.3 → 6.8 | 8 → 7 | 2+1 → 1+1 | 0 → 1 | 3/0 → 3/0 | 75 → 85 | 115 → 85 |
| 9 (09.11.) | Grundlage (Erh.) | 5.8 → 4.7 | 8 → 7 | 0+1 → 0+1 | 0 → 1 | 3/0 → 3/0 | 50 → 55 | 75 → 40 |
| 10 (16.11.) | Grundlage | 8.9 → 7.2 | 9 → 7 | 2+1 → 1+1 | 0 → 1 | 3/0 → 3/0 | 85 → 95 | 135 → 90 |
| 11 (23.11.) | Grundlage | 9.5 → 7.7 | 9 → 7 | 2+1 → 1+1 | 0 → 1 | 3/0 → 3/0 | 90 → 105 | 145 → 95 |
| 12 (30.11.) | Grundlage | 9.6 → 7.9 | 9 → 7 | 2+1 → 1+1 | 0 → 1 | 3/0 → 3/0 | 95 → 105 | 150 → 110 |
| 13 (07.12.) | Grundlage (Erh.) | 6.5 → 5.9 | 8 → 7 | 2+1 → 1+1 | 0 → 1 | 3/0 → 3/0 | 55 → 70 | 90 → 70 |
| 14 (14.12.) | Grundlage | 9.9 → 6.5 | 9 → 7 | 2+1 → 2+1 | 0 → 1 | 3/0 → 3/0 | 105 → 55 | 150 → 90 |
| 15 (21.12.) | Grundlage | 10 → 7.9 | 9 → 7 | 2+1 → 1+1 | 0 → 1 | 3/0 → 3/0 | 115 → 105 | 150 → 125 |
| 16 (28.12.) | Aufbau | 10.1 → 7.9 | 9 → 7 | 2+1 → 1+1 | 0 → 1 | 3/0 → 3/0 | 120 → 105 | 150 → 130 |
| 17 (04.01.) | Aufbau (Erh.) | 6.7 → 5.6 | 8 → 7 | 0+1 → 0+1 | 0 → 1 | 3/0 → 3/0 | 80 → 70 | 90 → 80 |
| 18 (11.01.) | Aufbau | 10.1 → 8.3 | 9 → 7 | 2+1 → 1+1 | 0 → 1 | 3/0 → 3/0 | 120 → 105 | 150 → 140 |
| 19 (18.01.) | Aufbau | 10.1 → 8.6 | 9 → 7 | 2+1 → 1+1 | 0 → 1 | 3/0 → 3/0 | 120 → 105 | 150 → 150 |
| 20 (25.01.) | Aufbau | 10.1 → 8.6 | 9 → 7 | 2+1 → 1+1 | 0 → 1 | 3/0 → 3/0 | 120 → 105 | 150 → 150 |
| 21 (01.02.) | Aufbau (Erh.) | 6.6 → 6.3 | 8 → 7 | 2+1 → 1+1 | 0 → 1 | 3/0 → 3/0 | 55 → 70 | 90 → 90 |
| 22 (08.02.) | spezifisch | 10.2 → 6.5 | 9 → 7 | 2+1 → 2+1 | 0 → 1 | 3/0 → 3/0 | 120 → 55 | 150 → 90 |
| 23 (15.02.) | spezifisch | 10.2 → 7.3 | 9 → 7 | 2+1 → 2+1 | 0 → 1 | 3/0 → 3/0 | 120 → 105 | 150 → 90 |
| 24 (22.02.) | spezifisch | 10.2 → 7.3 | 9 → 7 | 2+1 → 2+1 | 0 → 1 | 3/0 → 3/0 | 120 → 105 | 150 → 90 |
| 25 (01.03.) | spezifisch (Erh.) | 6.8 → 5.9 | 8 → 7 | 0+1 → 0+1 | 0 → 1 | 3/0 → 3/0 | 80 → 70 | 90 → 90 |
| 26 (08.03.) | spezifisch | 10.5 → 7.3 | 9 → 7 | 2+1 → 2+1 | 0 → 1 | 3/0 → 3/0 | 120 → 105 | 165 → 90 |
| 27 (15.03.) | spezifisch | 10.7 → 7 | 9 → 7 | 2+1 → 2+1 | 0 → 1 | 3/0 → 3/0 | 120 → 105 | 180 → 75 |
| 28 (22.03.) | Tapering | 7.4 → 5.4 | 8 → 7 | 1+1 → 2+1 | 0 → 1 | 3/0 → 3/0 | 70 → 65 | 110 → 70 |
| 29 (29.03.) | Wettkampf | 5.3 → 2.3 | 8 → 4 | 0+2 → 0+2 | 0 → 2 | 3/0 → 1/0 | 40 → 0 | 70 → 50 |
| 30 (05.04.) | Grundlage (Erh.) | 6.9 → 5 | 8 → 7 | 2+1 → 0+1 | 0 → 1 | 3/0 → 3/0 | 55 → 40 | 110 → 60 |
| 31 (12.04.) | Aufbau | 10.3 → 5.9 | 9 → 7 | 2+1 → 2+1 | 0 → 1 | 3/0 → 3/0 | 100 → 55 | 180 → 75 |

„Doppel/Dreifach“ zählt Koppeltraining als einen Termin; Tage mit 3 Sportarten: vorher 15, nachher 0.

**Getestet:** typecheck, Unit-Tests, Build, Browser-Tests (Chromium + WebKit). **Nicht getestet:** echte KI-Antworten mit dem neuen Ursachen-Prüfer (nur nachgebaute), dein iPhone selbst.

## Auftrag 17: Soll/Ist, Schwimmen, Plan-Balance, Übersicht, großer Test (22.10.)

**Live in der echten App (Version 3.4.0)**, vorher in stamio-test mit einer Kopie deiner Daten geprüft. Sicherungen: `data-export/prod-vor-release17.sql`, `prod-2026-10-22.sql`, `test-vor-kopie-2026-10-22-*.sql`. In der echten App geändert: nur dein Plan ab heute, Profil (Kraul 50 m), Einstellungen, eine Coach-Nachricht „Plan angepasst“ und alte Schwimm-Anpassungen (als rückgängig markiert). Alle 286 Datensätze sind erhalten; dein Lauf von heute früh bleibt, wie er ist.

**Von Codex übernommen:** Belastungsrechnung, Kraftvorlagen, Fortschritts-Diagramme, Trends, Ergebnis-Werte, Score-Änderungen, Soll/Ist-Grundlage, Lexikon-Anfang. **Entfernt:** Codex' Planungs-Änderungen (12 Tests rot, Tests gelockert) und Diagnose-Dateien. Der Plan-Audit mit deinen Daten liegt nur in `data-export/` (nicht im Git). Eine AGENTS.md gibt es nicht.

**Fehler, Ursache, Lösung**
- **„100 m geschafft“, obwohl 50 m eingetragen:** Das Können nahm den größeren Wert aus Eingabe (50 m) und Uhr (100 m „am Stück“, die Uhr zählt Brust und Kraul zusammen). Daraus wurde Stufe 5 und im Profil 100 m. Jetzt: deine Eingabe geht vor, die Uhr zählt nur reines Kraul, geplante Werte sind nie ein Nachweis. Nächste Stufe erst nach 2 Einheiten, zweimal nicht geschafft → eine Stufe leichter. Korrekturen rechnen Stufe, Bestwerte, Scores und kommende Einheiten neu, der Coach schreibt „Korrigiert: …“. Fester Test: geplant 100 / gemacht 50 → nie „100 m geschafft“, keine Stufe 100, kein Bestwert 100.
- **Coach behauptet Unbelegtes:** Neuer Prüfer vor jeder Anzeige (Regel-Coach, kostenlose KI, Claude). Unbelegte Sätze fallen weg bzw. die KI-Antwort fällt auf den Regel-Coach zurück. Die KI bekommt SOLL und IST getrennt, deine Ausrüstung und dein belegtes Können.
- **Aus dem großen Test:** „kann nicht kraulen“ mit alter Meterangabe wurde zu „Bestätigt: 400 m“ → alte Angabe gilt nicht mehr, Kraul-Art steigt nur mit Nachweis. Schulter-Hinweis nannte Paddles, die es nicht gab → bei empfindlicher Schulter gar keine Paddles. Harte Einheiten wurden beim Kürzen bis 19 min klein → nie unter 25 min.
- **Kopier-Skript Test-Umgebung** brach ab, seit es mehrere Konten gibt → vergleicht jetzt nur Nutzer 1.

**Plan-Logik (für alle):** höchstens 2 eigene harte Einheiten pro Woche plus Spiel (Einsteiger 0-1, sehr Erfahrene bis 3, unter 18 höchstens 2 harte Tage inkl. Spiel); keine Dreifach-Tage; Koppellauf nur im Aufbau/spezifisch alle 2-3 Wochen, kurz; langer Lauf locker, Tempo-Teil nur in den letzten 8 Wochen vor einem Laufziel, jede 2. Woche, nie neben harten Lauf-Intervallen; langer Lauf passend zum Ziel (Halbmarathon ≤ 105 min); Steigerung höchstens +10 % auf das wirklich Erledigte; Teamsport zählt voll; Kraft im Aufbau 2 × 25-30 min; höchstens ein harter Test pro Erholungswoche, keine Tests nach Wettkämpfen; unrealistisches Ziel → Hinweis mit Zwischenziel. Schwimmen: Hilfsmittel gezielt (je Einheit ein Schwerpunkt), Meter und Pausen aus deinem Tempo. Klare Namen aus einer zentralen Liste („Lauf-Intervalle 6×1 min zügig“ statt „Fahrtspiel“), jede Einheit mit Ein-/Auslaufen und „Warum“.

**Übersicht:** Fachbegriffe stehen nur noch unter Mehr → Lexikon (nach Themen, mit Suche, inkl. aller Einheiten). In Werte, Belastung und Fortschritt führt ein unterstrichener Begriff dorthin; die Erklärtexte dort sind weg. Sicherheitshinweise bleiben.

**Dein Plan** (ab heute, Vergangenes und Erledigtes bleibt; Schwimmen zurück auf 50-m-Stücke; Di Schwimmen + Kraft unten (leicht), Mi Rad-Qualität, Do lockerer Lauf mit Steigerungen, Fr Kraft oben + Spiel, Sa Schwimmen + lange Ausfahrt, So langer Lauf, Mo Fußball-Training; Erholung alle 4 Wochen). Der Plan startet bei dem, was du zuletzt wirklich gemacht hast (≈ 6,9 h), und steigt dann:

| Woche | Phase | eigene h | hart (eigene+Spiel) | langer Lauf | lange Ausfahrt |
|---|---|---|---|---|---|
| 6 (19.10.) | Grundlage | 6.4 → 6.2 | 1+1 → 0+1 | 55 → 75 | 75 → 50 |
| 7 (26.10.) | Grundlage | 7.4 → 7 | 1+1 → 1+1 | 65 → 75 | 105 → 70 |
| 8 (02.11.) | Grundlage | 8.3 → 7.6 | 2+1 → 1+1 | 75 → 85 | 115 → 85 |
| 9 (09.11.) | Grundlage (Erh.) | 5.8 → 5.5 | 0+1 → 0+1 | 50 → 55 | 75 → 55 |
| 10 (16.11.) | Grundlage | 8.9 → 8.1 | 2+1 → 1+1 | 85 → 95 | 135 → 90 |
| 11 (23.11.) | Grundlage | 9.5 → 8.5 | 2+1 → 1+1 | 90 → 105 | 145 → 95 |
| 12 (30.11.) | Grundlage | 9.6 → 8.8 | 2+1 → 1+1 | 95 → 105 | 150 → 110 |
| 13 (07.12.) | Grundlage (Erh.) | 6.4 → 6.1 | 2+1 → 1+1 | 55 → 70 | 90 → 70 |
| 14 (14.12.) | Grundlage | 9.9 → 8.1 | 2+1 → 2+1 | 105 → 55 | 150 → 125 |
| 15 (21.12.) | Grundlage | 10 → 8.6 | 2+1 → 1+1 | 115 → 105 | 150 → 125 |
| 16 (28.12.) | Aufbau | 10.1 → 8.6 | 2+1 → 1+1 | 120 → 105 | 150 → 125 |
| 17 (04.01.) | Aufbau (Erh.) | 6.7 → 6.5 | 0+1 → 0+1 | 80 → 70 | 90 → 75 |
| 18 (11.01.) | Aufbau | 10.1 → 9.1 | 2+1 → 1+1 | 120 → 105 | 150 → 135 |
| 19 (18.01.) | Aufbau | 10.1 → 9.4 | 2+1 → 1+1 | 120 → 105 | 150 → 150 |
| 20 (25.01.) | Aufbau | 10.1 → 9.6 | 2+1 → 1+1 | 120 → 105 | 150 → 150 |
| 21 (01.02.) | Aufbau (Erh.) | 6.6 → 6.5 | 2+1 → 1+1 | 55 → 70 | 90 → 90 |
| 22 (08.02.) | spezifisch | 10.2 → 8.6 | 2+1 → 2+1 | 120 → 55 | 150 → 150 |
| 23 (15.02.) | spezifisch | 10.2 → 9.6 | 2+1 → 2+1 | 120 → 105 | 150 → 150 |
| 24 (22.02.) | spezifisch | 10.2 → 9.4 | 2+1 → 1+1 | 120 → 105 | 150 → 150 |
| 25 (01.03.) | spezifisch (Erh.) | 6.8 → 6.6 | 0+1 → 0+1 | 80 → 70 | 90 → 90 |
| 26 (08.03.) | spezifisch | 10.5 → 9.6 | 2+1 → 1+1 | 120 → 105 | 165 → 160 |
| 27 (15.03.) | spezifisch | 10.7 → 9.1 | 2+1 → 2+1 | 120 → 105 | 180 → 160 |
| 28 (22.03.) | Tapering | 7.1 → 5.5 | 1+1 → 1+1 | 70 → 65 | 110 → 70 |
| 29 (29.03.) | Wettkampf | 5 → 4.4 | 0+2 → 0+2 | 40 → 30 | 70 → 60 |

Dreifach-Tage: vorher 0, nachher 0. Ruhetage: 0 (Mo Training, Di-So eigene Einheiten wie vorgegeben). Doppel-Tage: 3 pro Woche (Di, Fr, Sa). Wochen 14 und 22: Lauftest statt langem Lauf. Tempo im langen Lauf ab Februar jede 2. Woche (zählt dann als harte Einheit).

**Großer Test (nur Test-Umgebung, erfundene Nutzer):** 65 Nutzer (14-75 J., Einsteiger bis Erfahrene, alle Ziele und Sportart-Kombinationen, mit/ohne Teamsport, Kraul ja/etwas/nein, verschiedene Hilfsmittel, wenig/viel Zeit, dazu Kraul 25 m, Kraul 50 m, Triathlet + Fußball, Auslasser/Korrigierer, widersprüchliche Angaben). Je Nutzer: Fragebogen → Plan → 3 Wochen mit weniger als geplant, ausgelassenen und Extra-Einheiten → Korrekturen (72) → Coach-Fragen → Scores/Prognose → Profil ändern. Automatisch geprüft: Soll ≠ Ist, nur gewählte Sportarten, keine Dreifach-Tage, harte Einheiten pro Woche, Abstand, Umfang, realistische Meter/Zeit, nur vorhandene Hilfsmittel, Kraul-Stücke ≤ Können, Namen, Stufe ≤ Eingetragenem. Ergebnis: 3 Fehlerarten gefunden (oben) und behoben, danach 0 Befunde. Bildschirme (11 je Nutzer) für die 5 neuen und jeden fünften der übrigen in Chromium und WebKit: nichts ragt heraus, keine Konsolen-Fehler, keine Betreiber-Infos, keine fremden Daten.

**Getestet:** typecheck, 1.729 Unit-Tests, Build, 299 Browser-Tests (Chromium + WebKit). Dein Plan zuerst an einer Kopie in stamio-test, danach deine echten Daten in der echten App angezeigt: keine Fehler, nichts ragt heraus, „Korrigiert: 50 m“ im Coach, keine 100-m-Stücke mehr.
**Nicht getestet:** echte KI-Antworten mit dem neuen Prüfer (nur mit nachgebauten Antworten); dein iPhone selbst.
**Offen:** Die nächste Kraul-Stufe kommt erst, wenn du 100 m in 2 Einheiten einträgst. Ein fester Ruhetag fehlt in deiner Woche (so vorgegeben); sag Bescheid, wenn du einen willst.

## Verbesserungsauftrag vom 20.10.2026 – veröffentlicht

**Abschluss 20.10., 17:35: Echte App veröffentlicht.** Jonah hat die Produktionsveröffentlichung freigegeben und aus seinem normalen Terminal ausgeführt. Vorher wurde `data-export/prod-vor-update-2026-10-20.sql` erfolgreich gespeichert (8.080.482 Bytes). Cloudflare bestätigt Pages-Deployment `703d2e04-950b-400c-870e-3df0fb25869e` am 20.10. um 17:34 Uhr mit Status `success` sowie Worker-Deployment `ee696b9d-d5b3-4738-8f03-c1ec38101ab7` mit Version `a21ae81f-d3d8-4bcb-91ab-73a010c256d9` bei 100 %. Adresse: https://coach-app-efc7.pages.dev. Die folgenden datierten Abschnitte sind Zwischenstände des Ablaufs. Deployment und Sicherung sind bestätigt; ein zusätzlicher angemeldeter Produktionstest aus dieser Sitzung wurde nicht ausgeführt. Kein Datenbankumzug und keine neue Migration; keine Zusammenführung nach main in dieser Sitzung.

**Produktionsfreigabe 20.10., 17:18:** Jonah hat ausdrücklich freigegeben. Die vorhandene Produktions-App `coach-app-efc7` und Datenbank `coach-db-efc7` wurden über Cloudflare bestätigt. Alle sechs lokalen Migrationen (0001–0006) sind bereits in Produktion angewendet; die reine Abfrage hat nichts geschrieben. Kein erneuter Datenbankumzug und keine neue Datenbank erforderlich. Nächster Schritt ist eine frische Sicherung der vorhandenen Produktionsdatenbank, danach `scripts/deploy.mjs production`. Lokaler Upload weiterhin nur aus Jonahs normalem Terminal möglich; Veröffentlichung noch nicht ausgeführt.

**Stand 20.10., 17:10: Testversion veröffentlicht.** Jonah hat nach erneuter Wrangler-Anmeldung das Testdeployment ohne Fehler ausgeführt. Cloudflare bestätigt Pages-Deployment `ab16e0c2-2038-4241-b825-eb5274318164` am 20.10.2026 um 17:09 Uhr mit Status `success` auf `stamio-test.pages.dev` und Worker-Deployment `7f0ddd0a-8bb3-4711-a2ad-7130396e7591` auf `stamio-api-test` (100 %). Die direkte HTTP-/Health-Abfrage war über das hier verfügbare Webwerkzeug nicht möglich; Deploymentstatus wurde über die authentifizierte API geprüft. Die echte App ist unverändert. Ihre Veröffentlichung benötigt die bestehende ausdrückliche Freigabe nach `scripts/release.md`. Ältere Zwischenstände unten dokumentieren den behobenen Weg bis hierher.

**Nachprüfung 20.10., 16:58:** Wiederholung der vier fehlgeschlagenen Browsertests laut Jonah: **4 bestanden**. Die lokale Playwright-Datei bestätigt `status: passed` und keine fehlgeschlagenen Tests. Der vorherige Gesamtlauf hatte 255 bestandene und 113 übersprungene Browsertests. Cloudflare-Konto und Testprojekt `stamio-test` sind über den Connector lesbar bestätigt. Das Projekt verwendet Direktuploads; die lokale Shell hat weiterhin keinen ausgehenden Netzwerkzugriff. Testdeployment deshalb als nächster Schritt im normalen Terminal über `node scripts/deploy.mjs test`; noch kein Deployment durchgeführt.

**Nachprüfung 20.10., 16:55:** Jonah hat `npm.cmd run test:all` im normalen Terminal ausgeführt. Browserergebnis: 255 bestanden, 113 übersprungen, 4 fehlgeschlagen. Alle vier gespeicherten Fehlerberichte zeigen dieselbe Ursache in den zwei neuen Testdateien: Der Selektor für `sheet-close` trifft Hintergrund und Schließen-Schaltflächen gleichzeitig (Playwright strict mode). Die Tests wählen jetzt ausdrücklich den Button „Schließen“ im Dialog. Typecheck und Diff-Prüfung erfolgreich; der erneute Browserlauf steht noch aus. Spätere Testschritte sind damit noch nicht verifiziert. Keine Veröffentlichung.

- **Belastung:** Tagesendanker wurden am Ankertag nochmals belastet; ohne lokale Einheiten fehlte der Verlauf. Alte Importwerte blieben in der Planung bis sieben Tage stehen. Das ist korrigiert. Eine zentrale Rechnung versorgt Werte, Fortschritt, Gesamtform, Einheiten und Planung. Verknüpfte Duplikate zählen einmal, mehrere echte Einheiten werden addiert, Entwürfe ausgeschlossen. Negative Eingaben sind abgefangen.
- **Handwerte:** Unter Mehr → Werte sind CTL, ATL, TSB und ATL/CTL datiert speicherbar. Quellen, Änderungsverlauf, Rückgängig und Rückkehr zur Automatik sind eingebaut. Widersprüchliche separate TSB-/Quotientenwerte werden gekennzeichnet. Neuere Importe gehen beim Rückgängigmachen nicht verloren.
- **Scores:** Eine Intervallrunde ist keine zusätzliche unabhängige Leistungsmessung mehr. Effizienz zählt nicht doppelt, Profilwerte sind Rückfallwerte, fehlende Schwimmdaten bleiben unbekannt. Die zuletzt belegte Fähigkeit bleibt an Ruhetagen stabil, ihre Sicherheit sinkt mit dem Alter. Neue Leistungsdaten können den Score erhöhen oder senken. Die bisherige Skala bleibt bestehen.
- **Kraftvorlagen:** Erstellen, Bearbeiten, Duplizieren, Löschen, Reihenfolge, Sätze, Wiederholungen/Dauer, Gewichte und Pausen. Vorlagen lassen sich aus Einheiten speichern, übernehmen und als unabhängiges Training starten. Entwürfe zählen erst nach Abschluss – auch im Coach. Der neue Datensatztyp nutzt den vorhandenen nutzergetrennten Sync; keine SQL-Migration und keine Änderung echter Daten.
- **Fortschritt:** Diagramme sind aus Werte entfernt. Fortschritt zeigt Zeit- und Gruppenfilter, Diagrammvorschauen mit Datumsachsen und getrennten Metriken, einschließlich ATL/CTL und des bisherigen Temperaturverlaufs. Fehlende Messungen und größere Lücken unterbrechen die Linien. Aktuelle Werte und Eingaben bleiben unter Mehr → Werte.

**Formeln und Grenzen:** [Belastungsmodell](docs/load-model.md), [Fitnessmodell](docs/fitness-model.md). CTL/ATL verwenden standardmäßig 42/7 Tage, TSB ist hier ausdrücklich der Tagesendunterschied. Puls-/RPE-Lasten und sportliche Scores bleiben Schätzmodelle, keine validierte Leistungsdiagnostik. Ohne historische Messungen entstehen keine erfundenen Trainingseinheiten.

**Tatsächlich geprüft:** TypeScript erfolgreich; Produktionsbuild erfolgreich; `git diff --check` erfolgreich. Gesamtsuite: **1.584 Tests bestanden, 6 übersprungen; 63 Testdateien bestanden, 2 übersprungen. Eine weitere Testsuite ist blockiert:** `server/test/api.test.ts` startet ihre Mockserver, kann sie wegen `connect EACCES` auf localhost aber nicht erreichen. Dasselbe Zugriffsproblem verhindert `npm run e2e`; es wurden deshalb keine erfolgreichen Browserabläufe behauptet. Playwright erkennt mit `--list` 372 Tests in 15 Dateien. Neue Regressionen wurden vor den jeweiligen Korrekturen fehlschlagend ausgeführt. Sync-Rundreise, Löschung, Anmeldung und Nutzertrennung der neuen Daten wurden direkt gegen den Worker-Code geprüft.

**Review:** Eine unabhängige Codeprüfung fand Undo- und Entwurfsfehler; diese sind mit Regressionstests korrigiert. Der begrenzte Sicherheitsreview fand in den geänderten Pfaden keine neu eingeführten Schlüssel oder Nutzertrennungsfehler. Das ist kein vollständiges Sicherheitsaudit.

**Noch offen:** Browser-/API-Netzwerktests und Testdeployment benötigen eine Umgebung mit erlaubten lokalen Verbindungen und erreichbarem Cloudflare. `scripts/check-secrets.mjs` konnte den Cloudflare-Zugang wegen Netzwerksperre nicht erneuern; keine Schlüssel wurden verändert. Daher kein Deployment, kein Merge und keine Produktionsfreigabe. Der Build warnt weiterhin vor einem großen JavaScript-Paket (ca. 868 kB, gzip 301 kB). Ein Lint-Befehl ist im Projekt nicht definiert.

**Weitere Grenzen und sinnvolle nächste Schritte:** Historische Profiländerungen sind nicht vollständig versioniert; undatierte alte Schwellen können historische Schätzungen beeinflussen. Ohne neue Messung bleibt eine alte Fähigkeitsschätzung bestehen, mit sinkender Sicherheit. Gleichzeitige Änderungen desselben Tages auf zwei Geräten unterliegen weiter dem bestehenden Datensatzkonfliktmodell. Eine optionale Anzeige vorheriger Leistungen direkt im Krafteditor ist noch nicht ergänzt. Für spätere Verbesserungen bieten sich datierte Schwellentests, feldweise Sync-Konflikte und Aufteilung des großen App-Pakets an.

## Auftrag 16: Trainingsbewertung und kostenlose KI (18.10.)

Live in der echten App (Version 3.3.0), vorher in stamio-test. Sicherungen: `data-export/prod-vor-auftrag16.sql`, `prod-vor-release16.sql`, `test-vor-auftrag16.sql`. In der echten App geändert: neue Tabelle für den KI-Verbrauch und deine zwei falschen Bewertungen (Lauf heute, Schwimmen gestern), neu geschrieben.

**1 Lockerer langer Lauf als Intervall bewertet:** Ursache: Die Bewertung zählte jeden langen Lauf als harte Einheit und sprach deshalb von Intervallen („prüf die Runden“). Zusätzlich hätten bei anderen Läufen Puls-Anstieg oder ein schnellerer Schluss automatische Runden zu Intervallen gemacht. Jetzt:
- Intervalle nur, wenn sich hart und locker deutlich abwechseln. Gleich lange Runden der Uhr (z. B. jeder Kilometer) sind ein Dauerlauf.
- Sind nur automatische Runden da, schaut die App in den Verlauf. Dort erkennt sie echte Intervalle, Fahrtspiel und Hügel, auch Hügel ohne Wattmessung über den Puls.
- Die Art kommt aus dem Plan, die Messung bestätigt oder widerspricht: „Gleichmäßig gelaufen …, genau richtig für einen lockeren langen Lauf“, „Du bist ab km 8 deutlich schneller geworden (5:5x statt 6:5x/km)“, „Geplant war ein lockerer langer Lauf. Deine Daten zeigen 7 Tempowechsel …“, „5 von 5 Intervallen, je etwa 4 min wie geplant“.

Geprüft mit deinem Lauf von heute und echten FIT-Dateien (Garmin, Edge, COROS), dazu mit nachgebauten Läufen: automatische Runden, Intervalle mit Runden von Hand, nur automatischen Runden und ganz ohne Runden, Fahrtspiel, Hügel mit und ohne Watt, welliger Dauerlauf, Tempolauf und Rad.

**2 Kostenlose KI (Cloudflare Workers AI):** Der Coach beantwortet Fragen jetzt mit einer KI, kostenlos und ohne Schlüssel. Er bekommt eine kurze Zusammenfassung (Profil, Ziel, Phase, heute, nächste 8 Tage, letzte 7 Tage, Ampel) und Werkzeuge (Training bewerten, Tag erklären, Analyse, Plan ändern). Die Regeln:
- Zahlen und Regeln kommen aus der App. Planänderungen sind nur Vorschläge mit „Annehmen“, auch bei Claude.
- Oura-Werte gehen nie an die KI.
- Bei Schmerzen rät die KI zum Arzt, bei Medikamenten antwortet die App selbst. Unter 18 gelten Schutzregeln.
- Ein Wächter prüft jede Antwort. Erfundene Puls-, Tempo- oder Wattwerte und behauptete Änderungen ohne Vorschlag führen zum Regel-Coach.
- Reihenfolge: Claude (nur mit Schlüssel) → Workers AI → Regel-Coach. Der Regel-Coach antwortet auch, wenn das Kontingent leer ist oder ein Fehler kommt.
- Fair verteilt: höchstens 30 Fragen pro Person und Tag. Den Verbrauch siehst du unter Mehr → Daten und Geräte.
- Die Antwort erscheint Wort für Wort. Jeder sieht einmal die Karte „KI-Antworten im Coach (kostenlos)“ mit „Einverstanden / Nein, ohne KI“, unter 16 mit Eltern-Häkchen. Abschaltbar in den Einstellungen.

Live geprüft mit einem neuen Nutzer in stamio-test (Chromium, WebKit) und in der echten App: Karte, Konto, echte KI-Antworten, Vorschlag „Teamtraining entfällt“. Danach wieder gelöscht.

**Modellvergleich** (30 Fragen mit deinen echten Daten, gleicher Stand):

| Modell | Neurons pro Frage | Zeit | Deutsch und Inhalt | Werkzeuge |
|---|---|---|---|---|
| Gemma 4 26B (gewählt) | 22 | 1,7 s | sehr gut, sachlich richtig | anfangs schwach, mit Server-Hilfe gut |
| Qwen3 30B | 17 | 0,7 s | einfach, Fachfehler (Entkopplung, Kraul-Atmung) | 0 von 4 Änderungen, behauptete 6-mal Vorschläge ohne Werkzeug |
| Mistral Small 3.1 | 117 | 1,9 s | gut, erfindet aber Einheiten, gibt teils rohen Code aus | 3 von 4 Änderungen |

**Regel-Coach gegen KI** (60 Fragen: 30 mit deinen Daten, 30 mit Papas Daten; Training heute/gestern/Woche, Tagesplan, 9 Planänderungen, Wissen, Schmerzen, Krankheit, Medikamente, Unsinn):

| | passend | teilweise | daneben | Neurons pro Frage |
|---|---|---|---|---|
| Regel-Coach | 23 | 8 | 29 | 0 |
| KI (Gemma) | 55 | 4 | 0 | Ø 27 (15-73) |

Einmal hat der Wächter auf den Regel-Coach umgeschaltet (Verschieben ohne Werkzeug), das ist so gewollt. Der Regel-Coach versteht vor allem Wissensfragen, „warum“-Fragen und Unsinn nicht. Seine zwei echten Fehler aus dem Vergleich sind behoben: „Gedicht über Pizza“ wurde als „krank“ erkannt, „10 min kürzer“ als „auf 10 min“.

**Kostenlos möglich:** etwa 27 Neurons pro Frage, das sind rund 370 Fragen am Tag für das ganze Konto (10.000 Neurons, Neustart 2 Uhr nachts). Die echte App nimmt höchstens 9.500, die Test-Umgebung 1.500. Bei 30 Fragen pro Person reicht das für etwa 10 sehr aktive Nutzer am Tag. Heute ist das Kontingent durch den Modellvergleich schon zu etwa 90 % verbraucht. Bis 2 Uhr nachts antwortet deshalb öfter der Regel-Coach.

Tests: 1544 Unit- und Server-Tests (neu: Erkennung, Bewertung, KI mit nachgebautem Modell), 251 Browser-Tests. Entscheidungen 187-197.

## Auftrag 15: Mamas Fehler und großer Test mit 60 Nutzern (18.10.)

Live in der echten App (Version 3.2.0), vorher in stamio-test. Sicherungen: `data-export/prod-vor-auftrag15.sql`, `prod-vor-auftrag15b.sql`, `prod-vor-papa15.sql`, `test-vor-auftrag15.sql`. Geändert wurde in der echten App nur Papas Plan (ab heute neu, Erledigtes bleibt). Jonahs Plan erfüllt alle neuen Regeln und blieb unverändert.

**1 Nur gewählte Sportarten:** Ursache war die Ziel-Vorlage „Allgemeine Fitness“: Sie fügte immer Laufen, Rad und Schwimmen hinzu, egal was gewählt war, und setzte nach 12 Wochen einen „Wettkampf“ als Lauf. Jetzt gilt fest: nur gewählte Sportarten, Teamsport nur, wenn angegeben – auch bei Tests, Koppel, Ersatz-Einheiten, Coach und KI. Fitness hat keinen Wettkampf mehr. Mama nutzt die App ohne Konto, ihre Daten liegen nur auf ihrem iPhone: Beim nächsten Öffnen erkennt die App die Läufe und plant ab heute neu, ohne Neuanfang. Der Plan-Check meldet und entfernt jede nicht gewählte Sportart.

**2 Verbinden für alle:** Mama hatte kein Konto, deshalb „Verbindungen laufen über deinen Server“. Jetzt: „Verbinden“ → die App legt ein privates Konto an (Daten des Geräts kommen mit) → Anmeldung beim Dienst → „Erlauben“. Keine Einladung nötig, Schutz gegen Missbrauch (3 neue Konten pro Tag und Adresse, höchstens 300 Nutzer). Normale Nutzer sehen kein Server/API/Secret/Schlüssel mehr (außer intervals.icu, dort mit 5 Schritten). Server-Schlüssel nur für dich. Oura erlaubt im Entwicklermodus nur wenige Nutzer: ist die Grenze erreicht, steht „gerade nicht verfügbar“; die Freigabe steht in FUER-JONAH.md. Getestet mit einem neuen Nutzer in stamio-test und in der echten App (Konto → Dropbox-Anmeldung, danach gelöscht).

**3 Datum im Fragebogen:** Safari auf dem iPhone gibt Datumsfeldern eine eigene Mindestbreite. Jetzt passen sie sich der Spalte an. Der Layout-Test stellt diese iPhone-Breite nach und prüft alle Eingabefelder auf allen Fragebogen-Seiten (320-430 px).

**4 Gleiche Sportart nicht hintereinander:** Der Generator verteilt jede Sportart über die Woche, auch über So → Mo. Geht es nicht anders (Zeit, Schwimmbad, feste Termine), wird verschoben oder getauscht, sonst ist eine Einheit locker und kurz und sagt in „Warum“, weshalb. Kraft nicht zweimal hintereinander für dieselben Muskeln, nie zwei harte Tage hintereinander. Der Plan-Check prüft das bei jedem Plan.

**5 Großer Test:** 60 erfundene Nutzer (14-75 Jahre, alle 15 Sportart-Kombinationen, Fitness, Abnehmen ohne Gewichtsziel für Jugendliche, 5 km bis Langdistanz, Rad, Schwimmen, Teamsport mit/ohne Spiele, wenig/viel Zeit, Kraul ja/etwas/nein, Hilfsmittel, 25/50-m-Becken, Verletzungen, Krankheit). Jeder komplett: Fragebogen → Plan → 3 Wochen (erledigt, ausgelassen, Extra) → Coach-Fragen → Profil ändern → Scores, Prognose, Ampel → alle Bildschirme im Browser. Gleicher Test vorher (alter Stand) und nachher:

| Fehlerart | betroffene Test-Nutzer (von 60) | behoben |
|---|---|---|
| Nicht gewählte Sportart im Plan | 21 | ja |
| Gleiche Sportart an Folgetagen ohne Begründung | 48 | ja |
| Zwei harte Tage hintereinander | 0 | – (jetzt auch So → Mo geprüft) |
| Erholungswoche kaum leichter als die Woche davor | 43 | ja |
| Umfang springt zu stark (z. B. Lauf-Geh-Einheit mehr = +50 %) | 14 | ja |
| Unrealistisch: Kraul-Check länger als das Können, 30-min-Lauftest für Einsteiger, Rad-Intervalle länger als die längste Fahrt | 7 | ja |
| Intensität passt nicht zur Phase | 19 | 16 ja, 3 nein* |
| Widersprüchliche Texte („locker“ + Zone 3) | 0 | – |
| Fachbegriffe ohne Erklärung (Schwelle, Sweet Spot, HFV, CSS …) | 60 | ja |
| Coach versteht „plan mir eine Einheit Laufen“ bei Nicht-Läufern nicht | 43 | ja |
| Coach nennt nicht gewählte Sportart (z. B. „Laufzonen geschätzt“) | 21 | ja |
| Coach: „Ich will abnehmen“ bei Erwachsenen mit Hinweis auf Eltern | 45 | ja |
| Betreiber-/Server-Begriffe bei normalen Nutzern | 60 | ja |
| Datumsfeld ragt heraus (iPhone) | alle auf dem iPhone | ja |
| Ragt aus dem Bildschirm, Konsolenfehler, Ampel-Farbe ≠ Wert, Score/Prognose ungültig, Neuplanung verliert Erledigtes | 0 | – |

*Bekannte Grenze: 3 Nutzer mit sehr wenigen freien Tagen plus Spielen (z. B. nur Mo/Fr/So frei, Spiel am Samstag) haben in einer Phase keinen Tag für eine harte Einheit; das Spiel ist dort der harte Reiz.

Alle Fehlerarten sind als Regel im Plan-Check bzw. als dauerhafte Tests drin. Tests: 1484 Unit-/Server-Tests, 243 Browser-Tests (Chromium und WebKit). Entscheidungen 172-186.

## Fehlersuche (17.10. abends)

Warum dein Training nicht ankommt: Die App holt alle FIT-Dateien ab, aber in deiner ganzen Dropbox liegt nur eine (Rad indoor, 16.10.). HealthFit exportiert deine Trainings nicht nach Dropbox. Was du tun musst, steht in FUER-JONAH.md, Abschnitt B. Die App sucht jetzt selbst in der ganzen Dropbox nach FIT-Dateien, wechselt bei Bedarf den Ordner und zeigt unter Verbindungen, was sie findet und wann die letzte Datei kam.

Behoben:
- Dropbox: Wurde der Ordner neu aufgelistet, kamen schon übernommene Dateien erneut in die Warteschlange. Jetzt merkt sich die App übernommene Dateien. Ein alter Fehlercode blieb nach Erfolg stehen, das ist weg.
- Coach: Warnung „Müdigkeit 483 % über deiner Fitness“ bei neuen Nutzern (Papa) kommt erst ab etwas Trainingsverlauf.
- Coach: Papas Extra-Lauf hieß „geplant war Zone 2“, obwohl nichts geplant war; jetzt „harte Einheit, zählt als harter Tag“.
- Coach: Dein „Fussballspiel“ galt als lockere Einheit („Gefühl 7/10 ist hoch“); jetzt zählt es als Spiel und harter Tag, auch im Plan.
- „Puls 0-150 bpm“ heißt jetzt „unter 150 bpm“.
- Die Meldung „Lockerer Lauf entfällt (Wettkampf)“ (dein Sprint im Juni 2027, richtig so) steht nicht mehr unter „Nicht alles passte“.

Keine weiteren Fehler im Protokoll der letzten 7 Tage (nur die alten Dropbox-Meldungen vom 16.10.). Papas intervals.icu läuft (sein Schwimmen vom 17.10. ist da). Tests: 1397 Unit/Server, 158 Browser.

## Auftrag 14: Ampel, Fehler melden, Dropbox, Schwimmen, Intensität (17.10.)

Live in der echten App (Version 3.1.0), vorher in stamio-test. Sicherungen: `data-export/prod-vor-auftrag14.sql`, `prod-vor-auftrag14b.sql`, `test-vor-auftrag14.sql`. Geändert wurden nur Papas und dein Plan (neu berechnet ab heute, Vergangenes und Erledigtes bleibt) plus je eine Coach-Nachricht „Plan korrigiert“.

**1 Ampel:** Ursache bei Papa: Morgens kam erst nur der Ruhepuls, der Server schrieb „grün 100/100“. Später kam der Schlaf (5,3 h), die App rechnete gelb 70, zeigte aber den alten Satz. Jetzt gibt es einen Wert (0-100) aus HFV, Ruhepuls, Schlaf, Krankheit, Belastung (Form und ACWR, erst ab etwas Trainingsverlauf) und neu Gefühl/Muskelkater (Morgen-Eingabe oder intervals.icu), je gegen die persönliche Basis. Farbe kommt nur aus dem Wert (ab 70 grün, 45-69 gelb, unter 45 rot); Ring, Wort, Satz und Farbe sind gleich, die Morgen-Nachricht wird bei neuen Werten erneuert. Unter „Warum?“ hat jeder Einzelwert seine Farbe. Ohne Morgenwerte (oder nur einem Wert): „Ampel unsicher – keine Morgenwerte“. „Lockerer Lauf mit Hügelsprints“ ist jetzt Zone 2 (kurze Stücke ändern die Grundzone nicht); alle Einheiten aller Test-Personen ohne Widerspruch Titel/Zone.

**2 Fehler melden:** Status neu → in Arbeit → erledigt oder verworfen, per Knopf oder Wischen (links erledigt, rechts in Arbeit). Erledigte stehen zugeklappt unter „Erledigt“, „neu“ zählt nur Offene. Melder sehen den Status, auch bei eigenen Meldungen. Gleiche Fehler sind eine Zeile („9× Dropbox: …“, kurzer Text, „Erledigt“). Die lange Dropbox-Meldung steht nicht mehr bei den Testern, sondern als „Hinweis für dich als Betreiber“; Tester sehen bei Verbindungen nur „noch nicht fertig eingerichtet, du musst nichts tun“.

**3 HealthFit/Dropbox:** Die echte App liest Dropbox schon seit 16.10., 17:53 Uhr: Der Server kann `/Apps` durchsuchen (geht nur mit „Full Dropbox“), fand `/Apps/HealthFitExporter` und hat eine echte FIT-Datei übernommen (Rad indoor 16.10., 30 min). Mit dir zusammen App key und App secret aus der Zwischenablage gesetzt (Test und echt, ohne Anzeige; das Skript zeigt jetzt nur noch die Länge). Verbindungstest: Zugang absichtlich ablaufen lassen, um 16:05 Uhr hat sich der Server mit den neuen Schlüsseln frisch angemeldet, Status verbunden, kein Fehler. Alte Tokens: keine (die eine Verbindung gehört schon zur neuen App, in der Test-Umgebung gibt es keine). Im Ordner liegt bisher nur die eine FIT-Datei vom 16.10., sie ist übernommen; neue Trainings kommen spätestens 15 min nach dem Export.

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
