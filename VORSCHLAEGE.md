# Neue Vorschläge (Auftrag 41, 22.11.) – nicht eingebaut, du entscheidest

Aufwand: klein (unter 1 Tag), mittel (1–3 Tage), groß (mehr).

| Nr. | Was | Warum | Aufwand |
|---|---|---|---|
| A | **Englisch:** entweder (a) vollständig übersetzen – alle Texte über `t()`, auch Coach-Antworten und Plan-Texte, dazu ein Test „keine deutschen Wörter bei Englisch“ – oder (b) „English (beta)“ ausblenden, bis es fertig ist | Heute sind nur 115 von 1.737 Texten übersetzt (ca. 7 %), dazu viele feste deutsche Sätze in 19 Ansichten und fast alle Coach- und Plan-Texte (shared). Wer Englisch wählt, sieht fast nur Deutsch. | (a) groß (2–3 Wochen: Ansichten ~1 Woche, Coach/Plan-Texte ~1–2 Wochen); (b) klein (1 Stunde). **Meine Empfehlung: erst (b)**, (a) nur, wenn es englische Nutzer gibt. |
| B | **Einheiten metrisch/imperial überall:** alle km/m/Pace-Angaben über die vorhandenen Funktionen (`dist`, `pace`, `swimPace`) statt fest „km“ | Geprüft: Die Auswahl greift in Zahlen-Anzeigen über `dist()`/`pace()`, aber an ca. 25 Stellen in den Ansichten und ca. 60 Stellen in Coach-, Ablauf- und Plan-Texten steht „km“, „/km“ oder „/100 m“ fest (z. B. Einheiten-Titel, Coach-Antworten, Ablauf-Zeilen). Imperial-Nutzer sehen gemischt. | mittel (2–3 Tage) |
| C | **Heute: höchstens 2 Hinweis-Karten gleichzeitig** (Reihenfolge: Verbindung, offene Einheiten, Mitteilungen, Pflege-Hinweise), der Rest unter „Weitere Hinweise“ | Neue Karten (Verbindung, Wochenfrage, Mitteilungen) können sich an einem Tag sammeln und die Einheit nach unten schieben | klein |
| D | **Plan-Änderungen (Plan → Änderungen) je Einheit statt je Anlass** gruppieren, mit dem Netto-Unterschied wie in der Einheit | Die Liste zeigt jeden Schritt einzeln (z. B. „80 → 60 min“ und „60 → 50 min“ für dieselbe Einheit) | mittel |
| E | **Coach-Tab: Plan-Nachrichten einer Woche zusammenfassen** („3 Anpassungen diese Woche“ mit Aufklappen) | Wochen-Anpassung, Plan-Pflege und Testtermin kommen als getrennte Nachrichten | klein |
| F | **Fortschritt: gesperrte Karten („noch 14 Tage mit Messwerten“) gesammelt unten** statt zwischen den echten | Wer wenig misst, sieht viele graue Karten zwischen wenigen echten | klein |
| G | **Wiederholungs-Prüfer auch für Mitteilungen** (Push-Texte) und den Wochenrückblick | Heute prüft er alles Sichtbare in der App, aber nicht die Texte, die als Mitteilung kommen | klein |
| H | **Unbekannte Einheiten (ohne Eintrag) im Plan grau mit „?“** statt ohne Zeichen | Seit Auftrag 41 gelten Einheiten nach 3 Wochen ohne Eintrag als „ohne Eintrag“; im Plan ist das nur im Fenster der Einheit zu sehen | klein |


# Vorschläge zur Entscheidung (Stand Auftrag 40, 22.11.)

**Alle 15 sind seit Auftrag 40 eingebaut** (Version 3.28.0, Entscheidungen 621–635). Abweichung bei Nr. 13: Datei in Teile zerlegt, Plan-Bearbeiten wird weiter gleich mit geladen (siehe Entscheidung 635).

Frühere Liste: Aufwand: klein (unter 1 Tag), mittel (1–3 Tage), groß (mehr).

| Nr. | Was | Warum | Aufwand | Betrifft |
|---|---|---|---|---|
| 1 | **Lauf-Geh-Wechsel:** Laufanteile aus den Runden getrennt werten statt Ø Pace mit Gehpausen | Die Ø Pace mit Gehpausen ist zu langsam: Score und Zonen-Urteil werden falsch („zu locker“) | mittel | Lauf-Einsteiger, Marathon-Anfänger |
| 2 | **Teamsport:** Zeit in Zonen statt Ø Puls | Halbzeit und Bank drücken den Ø Puls, die Belastung eines Spiels wird unterschätzt | mittel | alle mit Teamsport |
| 3 | **Intensitätsverteilung (Fortschritt):** Zeit in Zonen statt ganze Einheit nach Ø Puls | Ein Intervall-Lauf zählt heute ganz als „locker“ oder ganz als „hart“; die 80/20-Anzeige stimmt dadurch nicht | mittel | alle mit Uhr |
| 4 | **Bestwert 5 km:** schnellster 5-km-Abschnitt aus den Splits statt nur ganze 5-km-Läufe | Die meisten laufen keine genauen 5 km; ein schneller Abschnitt in einem 10-km-Lauf zählt heute nicht | klein | alle Läufer |
| 5 | **Coach versteht „Wie fit bin ich?“ und „Bin ich übertrainiert?“** (Antwort aus Gesamt-Form, Ampel, Belastung zuletzt) | Die Fragen sind häufig, heute kommt „nicht verstanden“ (bei allen 16 Testnutzern) | klein | alle |
| 6 | **„Was sind meine Zonen?“ je Sportart** (Lauf, Rad, Schwimmen) | Heute nennt der Coach nur die Lauf-Zonen, auch bei Radfahrern und Triathleten | klein | Rad, Triathlon, Schwimmen |
| 7 | **Tests auch ohne Wettkampfziel** (Fitness-Ziel: alle 8 Wochen ein Test als Vorschlag mit „Übernehmen“) | Fitness-Nutzer bekommen nach dem Einstieg nie einen Test, die Zonen bleiben geschätzt („Im Plan steht gerade kein Test“) | mittel | alle mit Ziel „Fitness“ |
| 8 | **Verschobene Tests, die nicht mehr in den Plan passen** (z. B. am Ende eines Planabschnitts nach einem Wettkampf): Coach-Hinweis mit Termin-Vorschlag | Die Plan-Pflege macht daraus eine normale Einheit; der Test kommt erst mit dem nächsten Planabschnitt | klein | Nutzer mit festem Wochenaufbau und Wettkämpfen (z. B. Nutzer 1 im April) |
| 9 | **Zonen auch aus Triathlon-Rad/-Lauf und Freiwasser** (mit Abschlägen für Ermüdung bzw. Neopren) | Heute ändert nur ein Laufrennen, Becken-Schwimmen oder Rad-Event mit Watt die Zonen; ein Triathlon zählt nur als Test im Rhythmus | mittel | Triathleten |
| 10 | **Dauer überall gleich schreiben** (Plan-Tag zeigt „1:30“, „25'“, „1:00“; Heute „46 min“, Dashboard „45,5 min“ für dieselbe Einheit) | Gemischte Schreibweisen wirken unruhig; 45:30 eingegeben, 46 min angezeigt | klein | alle |
| 11 | **„Mach die Einheit heute kürzer“ bei roter Ampel:** Pause anbieten statt nur kürzen | Der Coach empfiehlt vorher Pause, schlägt auf Nachfrage aber 71 → 56 min vor | klein | alle mit Morgenwerten |
| 12 | **Hinweis „Neue Version“ verdeckt den Fenster-Titel** (oben über dem geöffneten Fenster) | Bei 320 px und großer Schrift liegt er über Titel und Schließen-Knopf, bis man tippt | klein | alle nach einem Update |
| 13 | **Ladezeit:** Hauptdatei (1,5 MB) in Teile zerlegen, Plan-Bearbeiten nur bei Bedarf laden | Erster Start auf älteren Handys schneller; der Build warnt schon länger | mittel | alle |
| 14 | **Zeile „= 45 min 30 s“ unter Zeitfeldern dauerhaft zeigen** (heute beim Tippen und bis zum Neuzeichnen) | Wer später nachsieht, sieht nur „45,5“ im Minutenfeld | klein | alle |
| 15 | **Dauer-Feld zeigt gespeicherte Werte als Zeit** („45:15“ statt „45,25“) | Wer „45,25“ nur leicht ändert (z. B. „45,26“), bekommt nach der neuen Regel 45 min 26 s; die App liest es eindeutig, aber anders als angezeigt | klein | alle, die Dauern von Hand ändern |


