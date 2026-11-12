# Auftrag 34: Komplett-Prüfung, alles fixen, Tab-Leiste wie iOS 26 (11./12.11.)

**Stand:** Version **3.22.0**, **veröffentlicht** (12.11., erst Test-App, dann echte App, vorher beide gesichert; Start-Test mit Kopien eurer Daten: alle drei starten fehlerfrei; 10 Minuten ohne Startfehler). Keine Nutzerdaten direkt verändert: Die Plan-Pflege läuft ab morgen früh als normale Änderung mit Mitteilung und Rückgängig. Was du am iPhone tun kannst: FUER-JONAH.md.

## So wurde geprüft
- **16 Testnutzer** (alle Ziele vom 5 km bis Langdistanz, Rad-Event, Schwimmziel; Uhr / von Hand / Wattmesser / nur Puls; 14–66 Jahre; mit und ohne Teamsport; krank und wieder gesund; Männer, Frauen, ohne Angabe), je **14 Tage** Coach (Morgen, Bewertung, Analyse, Woche): 531 Coach-Nachrichten gelesen.
- **Alle 25 Bildschirme** (Heute, Plan, Coach, Fortschritt, Mehr und alle Unterseiten, alle Aufklapper offen, Einheit geöffnet) in **WebKit (iPhone)** und **Chromium**, hell und dunkel, große Schrift, Deutsch und Englisch.
- **Echte App nur gelesen:** Fehlerprotokoll, Daten-Check aller Nutzer, Coach-Nachrichten der letzten 10 Tage (Kopie der Datenbank vom 11.11.).

## Funde und Status
| # | Schwere | Fund | Ursache | Status |
|---|---|---|---|---|
| 1 | hoch | Daten-Check: „Erholungswoche zu niedrig/hoch“ (Nutzer 1: 46–49 %, 2: 78–79 %, 5: 79–83 %), dazu Ruhetage, Kraft in der Wettkampfwoche, Tempolauf vor dem Halbmarathon, langer Lauf +25 min, nach langem Tag, nach dem Wettkampf | Pläne aus älteren Fassungen des Plan-Generators; neue Regeln griffen erst beim nächsten Neu-Planen | **behoben:** Plan-Pflege passt ältere Pläne gezielt an (als normale Änderung mit Mitteilung und Rückgängig). Kopie der echten Daten: Nutzer 1 **6 → 0**, Nutzer 2 **15 → 0**, Nutzer 5 **5 → 0** Verstöße |
| 2 | hoch | Rad Indoor 224–225 W zählten wie gemessen | Watt von Hand eingetragen, Rolle ohne Wattmessung | **behoben:** „ca. 225 W (geschätzt, ohne Wattmessung)“, nie für Vergleiche, Bestwerte, Watt-Trends |
| 3 | mittel | Erholungswoche auffüllen machte eine lange Ausfahrt bis +80 % länger (85 → 130 min) | Grenze +35 % galt je Durchgang statt insgesamt | **behoben** (auch für neue Pläne) |
| 4 | mittel | „Bei Frauen auch auf Zyklus-Veränderungen achten“ an Männer | fester Text | **behoben:** nach Geschlecht im Profil, auch für die KI |
| 5 | mittel | Analyse-Hinweise jede Woche fast gleich („Aerobe Effizienz sinkt“, „Kraul am Stück …“) | jede neue Woche = neue Mitteilung | **behoben:** nur bei neuer Erkenntnis oder deutlicher Änderung (Simulation: 120 → 100 Analyse-Mitteilungen) |
| 6 | mittel | „Kraul am Stück wird länger“ bei 75 m, Bestwert 100 m | Trend aus Mittelwerten, ohne Blick auf den Bestwert | **behoben:** nur, wenn der Bestwert erreicht ist |
| 7 | mittel | „Morgenwerte … nur 6 h geschlafen. Mach heute lieber locker.“ an jeder Bewertung | Hinweis bei jeder Einheit des Tages | **behoben:** höchstens einmal am Tag, nur bei harter Einheit oder wenn der Puls dazu passt (Simulation: 21 → 1) |
| 8 | mittel | 51 „verwaiste Anpassungen“ (Nutzer 1) | Neu-Planen ließ alte Änderungen stehen | **behoben:** werden stillgelegt bzw. nachts sicher entfernt |
| 9 | mittel | „Widersprüchliche Werte: Intervall cad (swim)“ (Nutzer 2) | Grenze für Kadenz ab 20, Schwimmen hat 16 Züge/min | **behoben:** Grenzen je Sportart |
| 10 | mittel | „neuer Bestwert (vorher 6:41)“ bei 6:41; „neuer Bestwert“ und „schwächer“ im selben Text | Rundung; Trend ohne Rücksicht auf den Bestwert | **behoben** (selbst gefunden) |
| 11 | leicht | Briefing „Langer Lauf 60 min (60 min)“ | Dauer immer in Klammern | **behoben** (Simulation: 60 → 0 Stellen) |
| 12 | leicht | Wochenrückblick „Umfang 0 %“, „Stufe bleibt: … nachgewiesen: Stufe bleibt“ | Bausteine aneinandergehängt | **behoben** (32 → 0) |
| 13 | leicht | „Ruhepuls an 1 von 5 Tagen über normal (… zuletzt 52)“ als Grund für Müdigkeit | einzelner Wert mitgenannt | **behoben** (selbst gefunden) |
| 14 | leicht | ~80 sichtbare Texte ohne Umlaute („pruefen“, „Aenderung“, „fuer“) | ältere Programmteile | **behoben** |
| 15 | leicht | „Daten und Geräte“ zeigte rohe Daten (JSON) bei einem Speicher-Konflikt | Anzeige für Entwickler | **behoben:** lesbar, Details zum Aufklappen |
| 16 | leicht | „Tippe auf den Verlauf …“ unter jedem Diagramm (bis 11×) | Text je Diagramm | **behoben:** einmal oben |
| 17 | – | Englisch großteils Deutsch | nur „beta“ (64 von ~650 Texten) | **bewusst nicht:** vollständige Übersetzung wäre eine neue Funktion |
| 18 | – | Fehlerprotokoll: Startfehler „e.today“ (1./3.11.), D1-Netzfehler (Okt.), Dropbox-Hinweise (14.10.) | alte Version / kurze Cloudflare-Störung / Einrichtung | **schon erledigt** (3.16.0) bzw. kein Code-Fehler |
| 19 | mittel | Erster Release-Versuch am 12.11.: Prüfung danach meldete Startfehler, echte App wurde automatisch auf 3.21 zurückgerollt | Cloudflare lieferte kurz neue Startseite mit alten Dateien; die Prüfung vorher umging den Zwischenspeicher | **behoben:** Prüfung lädt wie der Browser und wartet; danach neu veröffentlicht |
| – | – | Überlauf, Abstürze, Konsolenfehler | – | **nichts gefunden** (4 Varianten, alle Bildschirme) |

## Coach-Texte vorher → nachher
- **Warnzeichen (Mann):** „… genug essen. *Bei Frauen auch auf Zyklus-Veränderungen achten.* Lass das bitte ärztlich abklären …“ → „… genug essen. Lass das bitte ärztlich abklären …“ (Frau: „Achte auch auf Veränderungen deines Zyklus.“)
- **Briefing:** „Heute: Langer Lauf 60 min (60 min) und Kraft Ganzkörper 25 min (25 min).“ → „Heute: Langer Lauf 60 min und Kraft Ganzkörper 25 min.“
- **Wochenrückblick:** „Woche 9: Umfang 0 %: Erholungswoche aus dem Plan bleibt bestehen. Lernstufen: Stufe bleibt: 100 m Kraul am Stück nachgewiesen: Stufe bleibt.“ → „Woche 9 ist eine Erholungswoche mit weniger Umfang, wie geplant. Kraul-Stufe bleibt (100 m Kraul am Stück nachgewiesen).“
- **Wochenrückblick:** „Woche 5: Umfang -20 %: Diese Woche 1,1 h eigenes Training erledigt: nächste Woche höchstens etwa 10 % mehr.“ → „Woche 5: 20 % weniger Umfang. Grund: Du hast diese Woche 1,1 h trainiert, mehr als etwa 10 % darüber wäre zu viel auf einmal.“
- **Bewertung Rad Indoor:** „30 min, 225 W, Puls 136. … 🔧 Morgenwerte heute: du hast nur 6 h geschlafen. Mach heute lieber locker.“ → „30 min, ca. 225 W (geschätzt, ohne Wattmessung), Puls 136. 👍 Puls Ø 136 in Zone 1: schön locker.“
- **Schwimmen:** „Kraul am Stück wird länger – Gestern 75 m …, dein Bestwert sind 100 m. Über die letzten Einheiten geht es nach oben.“ (täglich wiederholt) → keine Meldung; erst wieder bei 100 m oder mehr.

## Tab-Leiste wie iOS 26
Videos Bild für Bild verglichen (Chrome liest die iPhone-Videos, 50–60 Bilder/s). Neu: Vergleichsaufnahme in **WebKit, iPhone-Größe, Touch** nebeneinander mit dem iOS-Video: `docs/vergleich/vergleich-tableiste-meine-app-3-22-webkit-touch.webm` (lokal, nicht in Git); Einzelbilder: `docs/tabbar-ios26/vergleich-bilder-meine-app-3-22-webkit-touch.png`.

| | iOS 26 Fitness (Video) | Stamio 3.21 (iPhone-Video) | Stamio 3.22 |
|---|---|---|---|
| Markierung in Ruhe | breite dunkle Kapsel, ~92 × 50 pt, breiter als Symbol und Wort | 68 × 53, wirkte rundlich, heller | **74 × 53 pt** (Tab + 6), dunkler |
| Linse beim Wechsel | flache Glas-Kapsel ~100 × 62 pt, gedehnt über alten und neuen Tab (~1,9 Tab-Breiten), ragt oben/unten über | fast rund (~82 × 67) | **~96 × 65 pt, gedehnt bis 131 × 66 pt (~1,9 Tab-Breiten)**, ragt über die 61-pt-Leiste |
| Lichtbrechung | Symbol und Wort unter der Linse deutlich vergrößert, Farbränder | kaum, dünner Rand | **vergrößerte Kopie nur in der Linse (1,32×)**, rot/blaue Farbränder |
| Akzentfarbe | wandert mit der Linse | blieb am Tab | **wandert mit (nur unter der Linse farbig)** |
| Symbole | gefüllt, kräftig, gewählt in Akzentfarbe | dünne Umrisse | **gefüllt (eigene Zeichnungen)** |
| Dauer bis Ruhe | Linse ~0,3 s | ~0,3 s | Linse ~0,3 s, Leiste federt bis 0,48 s aus (gemessen) |
| Bildrate (8 Tab-Wechsel per Touch) | – | 60 fps | **WebKit: 95 % der Bilder ≤ 16 ms, Chromium ≤ 17 ms** (60 fps); einzelne Pause bis 78 ms im Hauptprogramm, während der neue Tab aufgebaut wird – die Linse läuft dann im Compositor weiter |

Gleich geblieben (wie gewünscht): helle Beschriftungen, durchsichtige Leiste, Leiste wird beim Tippen größer, kurze Linsen-Dauer. Nur transform/opacity, „Bewegung reduzieren“ ohne Linse/Verformung. Alle bisherigen Leisten-Tests grün; zwei Tests erwarteten „Markierung = Tab-Breite“ und prüfen jetzt „Tab + 6 px“.
Grenze: WebKit unter Windows (Testrechner) zeigt den Weichzeichner der Leiste nicht – auf dem iPhone ist er da.

## Was vorhanden war, was neu ist
- **Verbessert:** Analyse (`analysis.ts`), Bewertung (`review.ts`), Bestwert-Texte (`valuestory.ts`), Briefing/Wochenrückblick (`engine.ts`, `core.ts`), Daten-Check (`datacheck.ts`), Trends (`trends.ts`), Erholungswoche im Generator (`plangen.ts`), Tab-Leiste (`tablens.ts`, gleiche Schnittstelle), Symbole (`icons.ts`).
- **Neu, weil es fehlte:** Plan-Pflege `planUpkeep` in `shared/replan.ts` (bestehende Pläne bekamen neue Trainingsregeln nie; nutzt nur die vorhandenen Reparatur-Bausteine des Generators, Ergebnis sind normale Anpassungen). Läuft auf dem Server morgens und sonntags und in der Release-Prüfung mit echten Daten (Pflicht).
- **Tests:** `tests/unit/auftrag34.test.ts` (25 Prüfungen, 22 scheiterten mit 3.21.0, 3 sind Gegenproben), angepasste ältere Tests (Umlaute, geschätzte Watt, verwaiste Anpassungen werden entfernt). Vor der Veröffentlichung: Typprüfung, **3.246 Unit-/Server-Tests** und **710 Browser-Tests** (Chromium und WebKit) grün; Release-Prüfung mit Kopien der echten Daten inkl. Plan-Pflege (Pflicht) grün.
