# Auftrag 32: Coach eine Entscheidung je Frage + Tab-Leiste wie iOS 26 (9.11.)

**Stand:** Umgesetzt, getestet und **veröffentlicht**: Version **3.20.0** (erst Test-App, dann echte App, vorher beide gesichert; Start-Test mit Kopien eurer Daten: alle drei starten fehlerfrei; 10 Minuten ohne Startfehler). Keine Nutzerdaten verändert.

## 1. Deine Coach-Nachrichten vom 9.11. (nur gelesen)
| Uhrzeit | Nachricht | Woher | Warum so |
|---|---|---|---|
| 07:08 | „Ampel gelb … Heute: Fußball-Training (90 min)“ | Morgen-Briefing (Regel-Engine) | richtig für den Morgen |
| 07:35 | 3 Hinweise (Warnzeichen, Effizienz, Kraul 75 m) | Analyse-Coach | eigene Karten, unabhängig von deiner Frage |
| 15:25 | „Bewertung: Krafttraining … Mach heute lieber locker.“ | Server, nach der Aufzeichnung von HealthFit | Morgenwerte (6 h Schlaf) hängen an jeder Bewertung |
| 18:45 | „Bewertung: Kraft Oberkörper …“ (gleicher Text) | App, nachdem du „Oberkörper“ gewählt hast | **doppelt**: Server und App benutzten verschiedene Kennungen für dieselbe Aufzeichnung |
| 18:46 | „… laut deinen Regeln ohnehin kein Laufen, Radfahren, Schwimmen oder Krafttraining vorgesehen … Tag zur Erholung frei“ | kostenlose KI (Gemma) | Dein **Wochenraster** („Rad nie Mo“ usw.) stand bei der KI als „Regeln, nie brechen“. Dass Fußball ausfällt, verstand sie als „nichts mehr geplant“. Kraft von heute kannte sie bei dieser Frageart nicht. |
| 18:47 | „… kein Krafttraining … alternativ eine lockere Einheit am Rad oder beim Laufen …“ | kostenlose KI | jede Frage einzeln, wieder mit dem Raster als Verbot; Angebot nur halbherzig |
| 18:50 | „… laut deinen Regeln nicht Rad fahren … Krafttraining wäre eine Option … Dauer kann ich dir nicht nennen, da nicht in deinem Plan“ | kostenlose KI | nahm das eigene Angebot zurück (kannte es nicht), schlug Kraft vor, obwohl schon gemacht, und nannte „nicht im Plan“ als Grund |

Der Regel-Coach (ohne KI) hätte auch schlecht geantwortet: Er bot an, Einheiten vom Dienstag zu streichen, und verstand „und wie lange?“ nicht.

## 2. Coach neu: eine Frage → eine Entscheidung → eine Antwort
- **Eine Tagesentscheidung** für Regel-Coach und KI-Weg: kennt heute Erledigtes (auch Extra-Einheiten und Aufzeichnungen), Offenes, Ausgefallenes, Ampel, Krankheit, Beschwerden, morgen, Woche, Teamsport, Regeln. Bei solchen Fragen antwortet die App selbst (eindeutig, kein KI-Kontingent).
- **Ersatz statt Verbot:** Regeln und Wochenraster schützen vor Überlastung, sie verbieten keinen lockeren Ersatz. Abgeraten wird nur bei Krankheit, roter Ampel, Schmerzen oder schon viel Belastung – mit Grund und leichter Alternative. „Nicht im Plan“ ist nie ein Grund (wird auch aus KI-Antworten entfernt).
- **Kein Widerspruch:** Ein Angebot bleibt, bis du Ja oder Nein sagst; Folgefragen nennen dieselbe Zahl. Ändert sich die Lage: „Korrektur, weil …“.
- **Eine Nachricht:** Hinweis und Vorschlag stehen in derselben Antwort, höchstens ein „Übernehmen“. Gleiche Antwort zweimal → „Wie eben gesagt: …“.
- **Eine Bewertung je Training** (Ursache der Doppelung behoben; deine doppelte vom 9.11. wird ausgeblendet, nichts gelöscht).

**Dein Gespräch mit der neuen Version** (Kopie deiner Daten):
| Frage | Antwort |
|---|---|
| soll ich heute noch was machen weil fußballtraining fällt aus | Ja: 40 min locker Rad fahren (Zone 2, Puls bis etwa 150). Das ersetzt Fußball-Training mit ruhigerer Belastung. Kraft Oberkörper (40 min) hast du heute schon erledigt. Deine Ampel ist gelb (du hast nur 6 h geschlafen), deshalb nur locker und nicht länger. Mit „Übernehmen“ steht es im Plan. |
| aber ich will heute irgendwas machen | Bleibt dabei: 40 min locker Rad fahren (Zone 2). Mit „Übernehmen“ steht es im Plan. |
| wie lange soll ich radfahren | 40 min, ganz locker (Zone 2, Puls bis etwa 150). Fühlst du dich nach der Hälfte schlapp, darfst du früher aufhören. |
| kann ich auch laufen? | Ja: 40 min locker laufen (Zone 2) … |

## 3. Coach-Testlabor (dauerhaft, vor jedem Release)
21 Test-Nutzer × 36 Fragen = 756 Antworten, automatisch geprüft (eine Antwort, kein Widerspruch, kennt den Tag, sinnvoll und nicht zu streng, Länge, keine Wiederholung, Zahlen/Wochentage, Folgefragen) plus Bewertungsregeln für Sinn, Verständlichkeit, Hilfsbereitschaft.
**Vorher 74,2 % → jetzt 100 %** (Bewertung Sinn 4,24 → 4,89 von 5). Gefundene und behobene Fälle bleiben als Test, z. B. „und wie lange?“ unverstanden, „Was soll ich vor dem Training essen?“ landete in der Tageserklärung, zweimal dieselbe Antwort, bei roter Ampel ohne leichte Alternative, Tageserklärung doppelt bei „nur 20 Minuten“. Details: `docs/coach-labor-32/bericht.md`.
Eine zweite KI als Prüfer habe ich nicht genommen: Sie hätte das kostenlose Tageskontingent aller Nutzer verbraucht und wäre nicht wiederholbar – stattdessen feste Bewertungsregeln.

## 5. Tab-Leiste wie iOS 26
Halten oder Ziehen: ganze Leiste wird größer, gedehnt zur Druckstelle, federt elastisch zurück. Wechsel: die Linse gleitet als Tropfen (dehnt sich in Bewegungsrichtung, federt nach). Glas mit Unschärfe, angedeuteter Brechung und Glanzkante. Runterscrollen: Leiste schrumpft; Hochscrollen, Antippen oder Tab-Wechsel: wieder groß. Eine Linse, 60 fps gemessen (16,0 ms je Bild, WebKit und Chromium), sitzt nach Drehen richtig, „Bewegung reduzieren“ schaltet alles ab.
Vergleich mit Video und Bildern: `docs/tabbar-ios26.md` (Video statt GIF, das mitgelieferte Werkzeug kann kein GIF). Unterschied: echte Lichtverzerrung geht in Safari im Web nicht; beim kurzen Antippen bewegt sich nur der Tropfen (sonst ruckelt es).

## Tests (ausgeführt)
Typen ✅ · 3.208 Unit-/Server-Tests ✅ (davon neu: Testlabor 756 Antworten, Jonahs Gespräch, KI-Prüfer mit den echten Antworten vom 9.11., Server-Weg ohne KI-Aufruf) · Build ✅ · 682 Browser-Tests (Chromium + WebKit) ✅, darunter 6 neue für die Tab-Leiste. Angepasst (Absicht): ältere Tests, die Vorschläge als eigene Karte bzw. Hinweise als eigene Nachricht erwarteten.

---

# Auftrag 31: Coach-Tab ruckelt, Mitteilungen kommen nicht an (8.11.)

**Stand:** Umgesetzt, getestet und **veröffentlicht**: Version **3.19.0** (erst Test-App, dann echte App, vorher beide gesichert; Start-Test mit Kopien eurer Daten: alle drei starten fehlerfrei; 10 Minuten ohne Startfehler). Keine Nutzerdaten verändert.

## 1. Coach-Tab
**Ursache** (Messung mit Kopie deiner Daten, WebKit): Vor dem Anzeigen wird jede Coach-Nachricht auf richtige Zahlen geprüft. Diese Prüfung hat für jede Nachricht den ganzen Plan mit allen 182 Anpassungen neu aufgebaut. Außerdem hat jeder Tab-Wechsel alles neu berechnet. Das waren 86 % der Zeit.
**Lösung:** Berechnungen bleiben erhalten, bis sich Daten ändern. Die Grundlagen der Prüfung werden einmal je Datenstand berechnet. Gezeichnet werden nur die letzten 30 Nachrichten, ältere beim Hochscrollen. „Was der Coach gerade sieht“ kommt aus dem Zwischenspeicher und wird im Hintergrund erneuert. In Ruhepausen rechnet die App Coach und Trends vor.

Antippen bis zum ersten Bild, Median (Spitze), mit deinen Daten:
| Tab | vorher WebKit | nachher WebKit | vorher iPhone-ähnlich* | nachher iPhone-ähnlich* |
|---|---|---|---|---|
| Coach | 498 ms (5.632) | **15 ms** (46) | 1.644 ms (17.964) | **41 ms** (200) |
| Coach mit 1.000 Nachrichten | 3.326 ms (25.276) | **30 ms** (31) | – | – |
| Heute | 77 ms | **15 ms** | 221 ms | **39 ms** |
| Plan | 76 ms | **55–76 ms** (Rechnen 42 → 14 ms, Rest ist Layout) | 207 ms | **52 ms** |
| Fortschritt | 78 ms | **46 ms** | 206 ms | **97 ms** |
| Mehr | 46 ms | **14 ms** | 101 ms | **25 ms** |
\* Chromium mit 4-fach gebremster CPU. Ältere Nachrichten nachladen: 30 ms. Messwerkzeug: `scripts/tabmessung.mjs`.
Dauertest: `tests/e2e/auftrag31-coach.spec.ts` (1.000 Nachrichten; mit der alten Version rot: 1.001 Nachrichten gezeichnet, 470 ms).

## 2. Mitteilungen – die Kette
| Schritt | Ergebnis |
|---|---|
| Server-Schlüssel (VAPID) in der echten App | ✅ gesetzt (auch Test-App) |
| Anmeldung gespeichert und deinem Konto zugeordnet | ✅ Konto 1. **Aber:** Dein iPhone bekam am 31.10. um 18:43 eine neue Geräte-Kennung. Die Anmeldung hing an der alten (zuletzt gesehen 18:42). Vom 31.10. bis heute 18:51 hatte dein aktives Gerät **keine** Anmeldung. Die App hat das nicht bemerkt. **Das ist die Ursache.** |
| Bleibt die Anmeldung nach Update, neuem Verbinden, Neuinstallation? | Vorher ❌. Jetzt ✅: Die App prüft bei jedem Start, nach jeder Rückkehr (höchstens alle 6 h) und nach jedem Update, ob der Server ihre Anmeldung hat, und meldet sich sonst still neu an. Eine Anmeldung zu einem alten Schlüssel wird ersetzt statt weiterbenutzt. |
| Zeitpläne (Cron) | ✅ alle 5 min. Täglich: Morgen-Briefing 06:45 (Schultag) / 09:00 (Wochenende), 1 h vor Nachmittags-Einheit, Vorabend 21:00, „Wie war's?“ 20:30, Essen 18:00, Adduktoren 19:00 (Mo/Mi/Fr, Teamsport). Sonntag 18:00 Wochenrückblick. Dazu Warnungen (Temperatur, Ampel rot, Plan angepasst) und Bestwerte. Höchstens 4 pro Tag. |
| Antwort von Apple | Vorher ❌ nie gespeichert; jede Mitteilung galt als „gesendet“. Jetzt ✅ je Gerät: Status, Grund, letzte Zustellung, Fehler in Folge. 404/410 und „falscher Schlüssel“ = abgelaufen → Anmeldung entfernt, Gerät zeigt „nicht aktiv – erneut erlauben“. |
| Service Worker zeigt die Mitteilung (auch bei geschlossener App) | ✅ geprüft (Unit-Test). Neu: reagiert, wenn der Browser die Anmeldung erneuert. |
| App → Mitteilungen | ✅ „Auf diesem Gerät aktiv / nicht aktiv – erneut erlauben“, „Letzte Mitteilung zugestellt vor …“, „Test senden“ mit ehrlichem Ergebnis, Auswahl und Uhrzeiten, Ruhezeit nachts und **neu in der Schule** (Mo–Fr, Standard 07:45–13:15, aus), iPhone-Hinweis (nur Home-Bildschirm-App, Fokus kann ausblenden) |
| Betreiber | ✅ Mehr → Betreiber → Mitteilungen: Nutzer mit aktiven Mitteilungen, Geräte, Fehler, abgelaufene, Zustellungen der letzten 7 Tage, Test je Nutzer. Dazu `scripts/push-test.mjs`. |
| Tests | ✅ Erlauben → Test kommt an; neue Geräte-Kennung → App meldet sich selbst neu an; nach Update bleibt sie aktiv; 410 wird erkannt und ersetzt; 403-Ablehnung mit Grund gespeichert; Briefing zur richtigen Uhrzeit vor/nach beiden Zeitumstellungen und in anderer Zeitzone; Schul-Ruhezeit |
| Test-Mitteilung an dich | ✅ 8.11. 22:55 verschickt. Apple hat sie für **beide** gespeicherten iPhone-Anmeldungen angenommen (201): die neue von heute 18:51 und die alte vom 31.10. Ob sie auf dem iPhone angezeigt wurde, sieht nur das iPhone. Kamen zwei, gehören beide Anmeldungen zu diesem iPhone. |

## Tests (ausgeführt)
Typen ✅ · 3.185 Unit-/Server-Tests ✅ · Build ✅ · 676 Browser-Tests (Chromium + WebKit) ✅. Ein älterer Abgleich-Test wackelte auch mit der Vorversion (lud neu, bevor gespeichert war) – er wartet jetzt aufs Speichern, 24/24 grün.
**Beim Release gefunden und behoben (älterer Fehler):** Zwei schnelle Eingaben hintereinander → die zweite konnte verloren gehen, weil die App vor dem Abgleich ihren Speicher neu las und dabei die frische Eingabe mit dem älteren Stand überschrieb. Jetzt bleibt eine Eingabe, die während des Lesens gespeichert wird, erhalten (Test nachgestellt: vorher rot, jetzt grün; Speicher-Tests 34/34, Release-Tests alle grün).

---

# Auftrag 30: Anders gemacht, Übersicht, Wissen, Ruckeln, Coach (8.11.)

**Stand:** Alles umgesetzt und getestet, Version **3.18.0**. Veröffentlicht (erst Test-App, dann echte App, vorher beide gesichert; Start-Test mit Kopien eurer Daten: alle drei starten fehlerfrei). Keine Daten von euch verändert.

## 1. „Anders gemacht“ vollständig
Je nach Auswahl die passenden Felder: **lockerer/härter** (tatsächliche Zone), **kürzer/länger/abgebrochen** (Dauer und Distanz bzw. „abgebrochen nach“), **andere Intervalle** (eigene Liste, gleich offen), **andere Sportart** (Felder dieser Sportart), **drinnen/draußen** (Laufband/Rolle/Halle bzw. draußen/Freiwasser), **aufgeteilt** (Teile mit je Dauer, Summe = Dauer), **ohne Teil** (Koppel, ohne Hilfsmittel, nur Brust, Ein-/Auslaufen). Grund optional, neu „Motivation“.
Titel, Liste, Symbol, Belastung, Scores, Stufen und Coach nutzen das Gemachte (eine Stelle im Code). Neu: Nach „härter als geplant“ (Zone 4–5) wird eine harte Einheit am nächsten Tag automatisch locker.

## 2. Tab-Leiste nach Drehen
Ursache: Die Linse rechnete ihre Höhe aus der Fensterhöhe – die meldet das iPhone nach dem Drehen kurz noch falsch; kam die Safe Area später, wurde nicht nachgemessen. Jetzt: Position wie die Leiste selbst, Nachmessen bei jeder Größenänderung/Drehung/Rückkehr. Test auf WebKit und Chromium (auch mit „falscher“ Fensterhöhe): mit altem Code rot, jetzt grün.

## 3. Ruckeln nach App-Wechsel (gemessen, viele Daten, CPU gebremst)
| | vorher | nachher |
|---|---|---|
| Lange Aufgabe in den ersten 0,5 s nach der Rückkehr | 56–78 ms | **0 ms** |
| Bilder in den ersten 0,5 s (WebKit) | bis 44 ms | **30 ms** |
| „Heute“ neu berechnen | 60 ms | **41 ms** |
| Neuaufbau der Ansicht / Scrollposition | nein / bleibt | nein / bleibt |
Ursachen: Abgleich und Speichern liefen sofort im ersten Bild nach der Rückkehr, gespeichert wurde auch ohne Änderung, Neuzeichnen sofort, Datumsrechnung tausendfach. Jetzt: erst der gespeicherte Stand, Abgleich in einer Ruhepause, Angleichen nur des Geänderten und nie während du scrollst. Dauertest `auftrag30-rueckkehr.spec.ts` (Gegenprobe mit altem Code rot).

## 4. Doppeltes entfernt
| Weg | jetzt |
|---|---|
| Berücksichtigungen „In eigenen Worten“ | weg – Sonderwünsche über den Coach. Alte Sätze bleiben sichtbar und wirken weiter („Deine weiteren Regeln“), nicht verstandene mit Hinweis |
| Plan: Knopf „Extra-Einheit“ unten | weg – „+“ am Tag |
| Plan: „Trainingsvorlage einfügen“ in jedem Tag | weg – im „+“ steht „Aus Vorlage“ |
| Heute: „Werte ändern“ unter „Warum?“ | weg – die Kacheln und das Herz oben öffnen dasselbe |
| Einheit: Freitext „Abweichung vom Plan“ | weg – „Anders gemacht“ mit Grund (alter Text bleibt sichtbar, wenn vorhanden) |

## 5. Bestwert, Tageswert, Trend
Ursache deines Falls: Die Analyse verglich den ersten mit dem letzten Wert der letzten 6 Wochen. Jetzt überall getrennt: Bestwert (mit Datum), Tageswert, Trend erst ab mehreren Einheiten – für Kraul/Pull Buoy am Stück, Lauf-Pace ab 5 km, längsten Lauf, Rad-Watt ab 20 min, Schwimm-Pace. Dein Fall heißt jetzt: **„Heute 75 m Kraul am Stück, dein Bestwert sind 100 m (27.10.).“** Ein Prüfer berichtigt auch KI-Antworten („von … auf …“ unter dem Bestwert, „Rückschritt“ ohne schwächeren Trend). Bewertungen übersichtlicher: ein Punkt je Zeile, doppelte Sätze raus. Nebenbei behoben: 12,5 m wurden als 13 m angezeigt.

## 6. Übersicht
Einheitliche Icons an Einheiten und Tagen (hart, Test, Wettkampf, Koppel, Erholung, Technik, lang, angepasst), Farbstreifen locker/mittel/hart, Tests als eigene Karte mit Ablauf und „frisch sein“, oben je Woche z. B. „1 harte Einheit · 1 Test · 9,8 h“, Legende im Lexikon. Layout-Test hell/dunkel, Schrift 16 und 28 px, 320/390/430 px.

## 7. Trainingswissen (ergänzt, steht in docs/TRAININGSREGELN.md)
Persönliche Reaktion (HFV, Ruhepuls, RPE nach harten Wochen → Rhythmus, Erholungstiefe, Steigerung), Rhythmus 2+1/3+1 nach Person, Erholungswoche 60–70 %, Kraft je Phase und Alter, Schwimm-Intensität mit ⚡, Teamsport-Belastung (Turnier > Spiel > Training), Wettkampf-Bedingungen (Hitze, Freiwasser/Neopren, hügelig, Startzeit – neues Feld beim Ziel), „Anders gemacht“ wirkt auf die nächsten Tage.
Dabei gefundene Fehler im Planer: Erholungswochen wurden nie aufgefüllt (mit festen Ruhetagen ~50 %) und erst ab 82 % gekürzt; Kraft fast immer nur 1×; Rumpf-Kraft galt als Beinkraft und fiel vor Spieltagen weg; beim Kürzen ging der Begründungstext „Ausnahme: …“ verloren; Tagesgrenze der Prüfungszeit nach dem Runden überschritten (41 statt 40 min).

**Dein Plan (ab morgen, wie die App jetzt neu planen würde):**
| | vorher (gespeichert) | nachher |
|---|---|---|
| Stunden je Woche (eigene, Grundlage/Aufbau) | 6,9–9,2 h | 6,3–9,1 h |
| Erholungswochen | 49–53 % | **59–63 %** |
| harte Einheiten je Woche | 1–2 | 1–2 |
| schnelle Schwimm-Stücke (⚡) | meist 0 | **1 pro Woche** |
| Kraft in der Grundlage | 1× | 1× – dein Raster erlaubt Kraft nur dienstags (siehe FUER-JONAH.md) |
| Regel-Hinweise | 6 | 3 (lange Einheit, schon vorher) |
Ich habe deinen Plan nicht umgeschrieben (er würde in der Grundlage ~0,5 h kürzer). Er stellt sich beim nächsten Neu-Planen mit Vorschau um, z. B. wenn du den 2. Krafttag freigibst.
**Papa und Mama:** keine Verstöße; neu geplant Erholungswochen 67–71 % statt 78 %, Mama Kraft 2× in der Grundlage. Test-Personen (10) und 250+ erfundene Nutzer: Plan-Check ohne Verstöße.

## 8. Tests
- Neu: Langzeit-Simulation **30 Nutzer, 3–6 Monate** (alle Arten „anders gemacht“, App-Anpassungen, Neu-Planen, Coach gegen Bestwert, neue Regeln) – Pflicht vor jedem Release. Drehen + App-Wechsel mit Langzeit-Daten im Browser.
- Funde aus den Simulationen, allgemein behoben: Erholungswoche direkt nach Neu-Planen wurde nicht leichter; Auffüllen verlängerte Tage über die Zeit im Raster bzw. nach einem Rennen; 2. Krafteinheit bei sehr wenig Zeit.
- **Tests (ausgeführt):** Unit 3.176 grün (neu u. a. 36 „Anders gemacht“-Fälle, 22 Regel-Tests mit allen Test-Personen, Bestwert/Tageswert, 30-Nutzer-Simulation), Browser-Tests 668 grün (Chromium + WebKit, neu: alle „Anders“-Arten wie ein Mensch eingetippt + neu geladen, Startzeit-Feld, Überlauf aller „Anders“-Arten bei 320 px/28 px, Plan-Symbole hell/dunkel/16–28 px/320–430 px, Drehen, App-Wechsel). Gegenproben: Dreh-Test und Rückkehr-Test sind mit dem alten Code rot.

---

# Auftrag 29: Stabilisierung (7.11.)

**Stand:** Alles behoben und mit Tests abgesichert, als **Version 3.17.0** veröffentlicht (erst Test-App, dann echte App, vorher beide gesichert). Keine Daten von dir verändert.

## Gefundene Fehler: Ursache → behoben
| Bereich | Ursache | Behoben |
|---|---|---|
| „Abgleich fehlgeschlagen“ | Deine Einträge sind alle auf dem Server (heute 18:10–18:26 hochgeladen), das Fehlerprotokoll hatte keine Abgleich-Fehler, weil der Abgleich nie etwas meldete. Wahrscheinliche Ursache: ein Absturz beim Neuzeichnen direkt nach dem Abgleich (der Startfehler aus 3.15.0) zählte als „Abgleich fehlgeschlagen“, obwohl alles oben war. Außerdem hätte ein einziger abgelehnter Eintrag alles für immer blockiert. | Neuzeichnen getrennt vom Abgleich. Kurze Aussetzer werden still nachgeholt. Die Meldung kommt nur, wenn Einträge länger als 2 Minuten ungesichert sind: „Deine letzten 2 Einträge sind noch nicht gesichert – Internet prüfen“ mit **Erneut versuchen**. Abgelehnte Einträge bleiben auf dem Gerät und blockieren nichts. Echte Fehler stehen jetzt im Fehlerprotokoll. |
| Schrittlänge 102 → 1 | Beim Tippen speicherte die App jeden gültigen Zwischenstand („1“ = 1 m), „102“ wurde beim Verlassen abgelehnt, stehen blieb „1“. Betraf jedes Feld mit Grenzen. | Einheit „cm“. 102, „102 cm“, „1,02 m“ und „1,02“ werden erkannt. Ungültig → Meldung, der alte Wert bleibt. |
| Coach: Entkopplung 4,5 % statt 3 % | 4,5 % war der Schnitt mehrerer Läufe, die Meldung klang wie dein Wert. | Ein Prüfer läuft vor jeder Coach-Nachricht (Regel-Coach, KI, Etappenziele, auch alte Nachrichten): Jede Zahl wird mit dem gespeicherten Wert (Hand vor Uhr vor berechnet) verglichen, berichtigt oder weggelassen. Deine Meldung zeigt jetzt 3 %. Neue Etappenziel-Meldungen sagen „im Schnitt deiner letzten Läufe“ und nennen den letzten Wert. |
| Schwimmen „?“ | Extra-Einheit ohne Werte gespeichert: die Dauer der Liste blieb leer, die Minuten standen nur in den Werten. | Liste, Tageskopf und Woche nehmen die eingetragene Dauer, auch beim Nachtragen. |
| 52 vs. 40 min | Die Ampel-Anpassung setzte Titel, Dauer und Beschreibung einzeln, die Bausteine blieben (52 min). Das Gleiche bei 7 weiteren Arten von Anpassungen. | Die Dauer kommt überall aus den Bausteinen. Deine Einheit heißt jetzt „Zone 2 statt: Ausfahrt mit Sweet Spot“, 40 min, Bausteine 10 + 25 + 5 min. |
| Dashboard-Schrift | Titel im abgerundeten Feld ohne Innenabstand, lief links über die Rundung. | Innenabstand. Der neue Überlauf-Test fand 3 weitere Stellen (Diagramm-Achse bei großen Zahlen, Belastungs-Kacheln, Regel-Raster bei sehr großer Schrift): behoben. |
| Weitere | Negative Werte (Entkopplung −2,1 %, Temperatur) fielen still weg; Intervalle wurden still gerundet; „Weitere Werte“ klappte nach jeder Puls-Eingabe zu; Bewertung lief nicht, wenn man die App schnell schloss. | Alles behoben. |

## Neu
- **„+“ an jedem Tag** im Plan: dort sofort eine Extra-Einheit anlegen (der Knopf unten bleibt).
- **Anders gemacht:** In jeder Einheit „So wie geplant / Anders gemacht“. Bei „Anders“: was (locker Zone 2, kürzer, andere Intervalle, andere Sportart) und optional warum (müde, krank, keine Zeit, Wetter, Schmerzen). Groß steht dann z. B. „Rad Zone 2 · 60 min“, klein „geplant: Sweet Spot 2×12“ (Einheit, Liste, Plan, Heute, Coach). Die Intervall-Liste ist dann nicht nötig. Der Coach bewertet das Gemachte („Sweet Spot ausgefallen – kein Problem, Zone 2 war sinnvoll“). Scores, Stufen und Belastung zählen nur das Gemachte. Eine ausgefallene Schlüsseleinheit wird nur nachgeholt, wenn ein Tag ohne harte Einheit daneben frei ist (höchstens eine pro Woche).
- **Anpassungen der App:** neuer Titel oben, Abzeichen „angepasst“ mit Grund, Antippen zeigt „vorher → nachher“.
- **Normalized Power** nur noch mit echten Wattdaten (nicht auf einfacher Rolle), mit Lexikon-Eintrag.

## Alle Felder (automatischer Test wie ein Mensch: eintippen → speichern → neu laden → gleiche Zahl in Feld, Speicher, Liste und Coach-Kontext; Nachtragen und Ändern)
| Bereich | Felder | Eingabe-Varianten | Ergebnis |
|---|---|---|---|
| Laufen | Dauer, Distanz, Pace, Puls, max. Puls, Entkopplung, Effizienz, Kadenz, vert. Verhältnis, VO2max, Cardio-Erholung, Höhenmeter, Schrittlänge, Bodenkontakt, Leistung, Temperatur, Untergrund, Schuh | „1:05“, „10,5 km“, „152 bpm“, „3 %“, „-2,1“, „102“/„1,05 m“, „-3 °C“ | ✅ |
| Rad | Dauer, Distanz, Ø/max. Watt, Trittfrequenz, Puls, Wo, Rad, Tempo, Normalized Power, Höhenmeter, Temperatur, Kohlenhydrate, Trinken | „27,4 km/h“, „216 W“, „0,75 l“ | ✅ |
| Schwimmen | Dauer, Distanz, Pace Kraul/Brust, Züge/Bahn, Züge/min, m/Zug, Kraul/Pull Buoy am Stück, Kraul-Anteil, Technik, Puls, SWOLF, Becken, Hilfsmittel | „1.500“, „1,6 km“, „75 m“, „46 %“ | ✅ |
| Kraft | Bereich, Dauer, Übungen | „1:05“ | ✅ |
| Teamsport | Art, Minuten, Puls, Distanz, Sprints | | ✅ |
| Intervalle | Strecke, Puls, Leistung, Tempo, Kadenz, RPE | „155,5“ (nicht mehr gerundet), „1,2 km“ | ✅ (Unit-Test) |
| Morgenwerte | Schlaf, HFV, Ruhepuls, Temperatur, SpO2, Atemfrequenz, Tiefschlaf | „7:30“, „61 ms“, „1 h 20“ | ✅ |
| Profil | Größe, Gewicht, Geburtsjahr | „1,80 m“, „72,5 kg“, „197“ (abgelehnt) | ✅ |
| Essen | kcal, Kohlenhydrate, Eiweiß, Fett, Gewicht | „2.400“, „120 g“ | ✅ |
| Fragebogen, Schwellen, Können, Teamsport | alle Zahlenfelder | gleiche Prüfung (Einheit, Grenzen, Meldung) | ✅ (Unit-Test) |
Ungültige Eingaben (z. B. Puls 400, „150 kg“, Schrittlänge 10) → verständliche Meldung, der vorige Wert bleibt, auch nach dem Neuladen.

## Damit es nicht wiederkommt
- Vor jedem Release Pflicht (rot = kein Release): Feld-Tests, Coach-Prüfer (300 Fälle inkl. nachträglich korrigierter Werte), Überlauf-Test (alle Bildschirme, 320–430 px, hell/dunkel, große Schrift bis 33 px, lange Texte, große Zahlen), Abgleich-Tests, „Anders gemacht“-Tests, **Plan-Check aller Einheiten aller echten Nutzer** und Start-Test mit echten Daten.
- Neue Regel in CLAUDE.md: Jedes neue Feld bzw. jeder neue Bildschirm bekommt sofort Eingabe-, Anzeige- und Überlauf-Tests.

**Tests (ausgeführt):** Unit 3.102 grün (davon neu: 300 Coach-Fälle, 42 Plan-Fälle aller Anpassungsarten × Sportarten, Eingaben, „Anders gemacht“ in allen Sportarten), Browser-Tests 636 grün (Chromium + WebKit, neu: Felder, Überlauf bis 33 px Schrift, Abgleich, „Anders gemacht“). Release-Prüfung mit Kopien eurer echten Daten: Plan-Check 0 Widersprüche bei allen drei (692 Einheiten), alle laden fehlerfrei, App startet bei allen dreien (Update vom alten Stand und neues Gerät). Nach dem Release: 10 Minuten keine Startfehler. Gegenproben: Plan-Check und Dashboard-Test sind mit dem alten Code rot, mit dem neuen grün.

---

# Auftrag 28: Echte App startete bei dir nicht mehr (7.11.)

**Stand:** Behoben und als **Version 3.16.0** veröffentlicht (erst Test-App, dann echte App, vorher beide gesichert). Mit Kopien eurer echten Daten starten alle drei (du, Papa, Mama) im Browser wie auf dem iPhone.

## Ursache
Nicht die Krankheitsphase und nicht die Warteschlange – beides habe ich geprüft, beides war in Ordnung.
- Im Fehlerprotokoll standen von dir zwei Meldungen (1.11. 18:07, 3.11. 12:13): `null is not an object (evaluating 'e.today')` auf Heute.
- Nachgestellt in WebKit (iPhone-Engine, Homescreen-Modus) mit einer Kopie deiner echten Daten: 3.15.0 stürzte **bei jedem Öffnen** ab, sogar auf einem frisch verbundenen Gerät.
- Auslöser: alte, schon entschiedene Coach-Vorschläge (älter als 7 Tage). Die App verkleinert sie, meldete sie aber bei jedem Start erneut als „geändert“ und speicherte. Seit 3.15.0 leert jedes Speichern einen Zwischenspeicher – und genau dann gab die App „nichts“ statt deiner Daten zurück. Papa und Mama hatten noch keine so alten Vorschläge; sie hätte es später auch getroffen.

## Fix (3.16.0)
- Ursache behoben (Vorschläge werden nur einmal verkleinert, die Daten kommen immer zurück). Mit deinen echten Daten startet die App jetzt bei allen drei.
- **Startfehler werden gemeldet** (vorher still verschluckt, deshalb kaum Spuren).
- **Update kommt auch bei einem Absturz an:** Der Service Worker startet unabhängig von der App. Die Fehlerseite hat **„Erneut versuchen“** (sucht ein Update und lädt neu) und übernimmt eine bereitliegende neue Version selbst.
- **Ein Fehler blockiert nie mehr die ganze App:** Jede Ansicht und jede Karte auf Heute für sich – bei einem Fehler steht nur dort „Dieser Bereich konnte nicht geladen werden“.
- **Abgleich:** Krankheitsphasen werden feldweise zusammengeführt – eine beendete Krankheit wird nie versehentlich wieder geöffnet; deine noch nicht hochgeladenen Einträge bleiben. Keine Lösung löscht lokale Daten.
- **Korrekturen am Server** nur noch als normale Änderung mit Zeitstempel über den Abgleich (`scripts/korrektur.mjs`, mit Sicherung). Steht als feste Regel in CLAUDE.md.
- **Wiederherstellungscode:** Auf dem Server liegt für dich ein gültiger Code vom 13.10. Wahrscheinlicher Grund für „falsch“: Auf dem Startbildschirm war nur das Feld für den 8-stelligen Kopplungscode offen, der 16-stellige Code gehörte in ein zugeklapptes Feld (oder es war ein älterer Code aus der alten App). Jetzt: **„Ich habe schon ein Konto“** gut sichtbar auf dem Startbildschirm, ein Feld für beide Codes. Auf Heute erscheint **„Wiederherstellungscode sichern“** mit einem neuen, gültigen Code.
- **Papa:** Er hat seine Krankheit am 6.11. selbst beendet (der Fix aus 3.15.0 wirkte) – deshalb keine Nachfrage „Bist du wieder gesund?“.

## Absicherung
- Dauertest `tests/e2e/start28.spec.ts` (Chromium + WebKit) mit genau deinem Zustand: Server-Korrektur + alter lokaler Stand + Warteschlange + alte Vorschläge. Mit 3.15.0 rot (dieselbe Meldung wie bei dir), mit 3.16.0 grün.
- **Vor jedem Release** (`scripts/veroeffentlichen.mjs`): Start im Browser mit Kopien aller echten Nutzer, jeweils als Update vom lokalen Stand der gerade laufenden Version und als neues Gerät.
- **Nach jedem Release:** 10 Minuten Startfehler beobachten, bei Startfehlern der neuen Version automatisch zurück auf die Vorversion.

**Tests (ausgeführt):** Unit 2.690 grün, Browser-Tests 601 grün (Chromium + WebKit). Start-Test mit echten Daten vor dem Release: Mit der alten Version 3.15.0 startete deine App nicht, nach dem Update bei allen drei Nutzern fehlerfrei (beim 2. Öffnen). Nach dem Release: echte App startet im Browser, 10 Minuten keine Startfehler. In der Test-App habe ich deine damalige Korrektur mit dem neuen Werkzeug nachgemacht und die App mit deinen kopierten Daten geöffnet: startet jedes Mal, Krankheit beendet.

**Was du am iPhone tun musst:** siehe FUER-JONAH.md.

---

# Auftrag 27: Design B + C, „Wieder gesund“ repariert (1.11.)

**Stand:** Beides fertig und als Version 3.15.0 veröffentlicht (erst Test-App, dann echte App, vorher beide gesichert). Deine offene Krankheitsphase vom 30.10. habe ich beendet (letzter kranker Tag 31.10., Wiedereinstieg ab heute).

## 1. „Wieder gesund“ – Ursache und Lösung
**Ursache:** Die App merkt sich abgeleitete Werte (z. B. „heutige Krankheitsphase“) in einem Zwischenspeicher. Jeder Abgleich im Hintergrund (beim Öffnen, alle 3 Minuten, nach jedem Speichern) liest deine Daten frisch ein, der Zwischenspeicher zeigte aber weiter auf die alte Kopie. Der Knopf setzte das Ende an dieser Kopie, gespeichert wurde der echte Stand ohne Ende. Die Bestätigung kam trotzdem, sonst passierte nichts. Auf dem Server war deine Phase deshalb noch offen. Betroffen war auch Papa (offene Phase seit 28.10., die habe ich nicht angefasst).

**Jetzt (für alle):**
- „Ich bin wieder gesund“ beendet die Krankheit sofort: Wiedereinstieg ab heute in Stufen, vergangene Krank-Tage bleiben markiert. Auch doppelt angelegte Phasen enden.
- Bestätigung „Krankheit überstanden – Wiedereinstieg ab heute“ mit **Rückgängig**, dazu eine Coach-Nachricht mit Rückgängig, auf allen Geräten gleich.
- „Ich bin krank“, „Doch noch krank“ und der Coach nutzen denselben Weg. „Ich bin krank“ legt keine zweite Phase mehr an.
- **Nach Verletzungen:** Auf Heute steht jetzt „Beschwerden: Knie seit …“ mit **„Wieder schmerzfrei“** (oder im Coach „Ich bin wieder schmerzfrei“). Das hebt die Schon-Regeln auf, plant neu, und alte Schmerz-Notizen bremsen nicht mehr. Bisher gab es keinen Weg zurück: Die Regel blieb, und sogar eine alte Wochennotiz wie „Leiste 3/10“ bremste das Laufen dauerhaft.

**Tests** (WebKit und Chromium, mit Antippen): nach einem Hintergrund-Abgleich (stellte deinen Fehler nach), gleicher Tag, mehrere/doppelte Phasen, Rückgängig, Doch noch krank, zwei Geräte (PC überschreibt nichts), offline gedrückt und später synchronisiert, Verletzung per Knopf und Coach.

## 2. Design B + C
Basis B (ruhiges Dunkel, neutrale Karten, Akzente Petrol, sparsam Orange), oben dezentes Petrol wie die Icon-Oberkante, das nach etwa einem Drittel in den Hintergrund übergeht. Hell entsprechend mit leichtem Petrol-Schimmer. Gilt überall: Fragebogen, Mehr-Unterseiten, Blätter, Startbilder, Statusleiste. Alle Farben stehen jetzt an einer Stelle (`scripts/palettes.mjs`), Kontrast überall WCAG AA, Layout-Test hell/dunkel grün. Fotos: https://claude.ai/artifact/SNSLRpqJxcrCQD6DtR4YaT (B + C oben).

**Für das neue Startbild** musst du nichts tun; es erscheint beim nächsten Öffnen nach dem Update (bei manchen iPhones erst nach erneutem „Zum Home-Bildschirm“).

---

# Auftrag 26: Ruhiger Start + Farben zum neuen Icon (1.11.)

**Stand:** Punkt 2 (Flackern) ist behoben und als Version 3.14.0 veröffentlicht (erst Test-App, dann echte App, vorher beide gesichert). **Punkt 1 (Design) wartet auf deine Wahl.**

## 1. Design – bitte wählen
Link (am besten auf dem iPhone): https://claude.ai/artifact/SNSLRpqJxcrCQD6DtR4YaT – oben das neue Icon, dann je Variante Heute, Plan, Einheit, Coach, Fortschritt, Mehr, dunkel und hell. Lokal: `design-varianten-2.html`.
- **A Tiefes Petrol:** Hintergrund sehr dunkles Petrol, Akzent Türkis, Orange nur für Wichtiges (Ziel, Wettkampf, neue Nachrichten).
- **B Mitternacht + Petrol:** fast neutral dunkel mit leichtem Blau-Grün-Stich, Akzente Petrol, Orange ganz sparsam.
- **C Ozean:** Verlauf von Petrol (oben) nach fast Schwarz, mattes Glas, Akzent Türkis, Hauptknöpfe Orange.

Ausprobieren: **Test-App → Mehr → Darstellung → Farbvariante**. Mischen ist erlaubt. Alle Varianten erfüllen WCAG AA (auch auf den Glas-Karten), die Ampel bleibt rot/gelb/grün. Nach deiner Wahl baue ich sie überall ein (eine zentrale Farbquelle, Startbilder, Layout-Test hell/dunkel).

## 2. Flackern beim Öffnen – gemessen und behoben
Gemessen in WebKit (Safari-Engine) mit einer Kopie deiner echten Daten auf meinem Rechner, Safari- und Homescreen-Modus, vom Öffnen bis die App ruhig ist.

| Ursache (gemessen) | behoben |
|---|---|
| Weißer Blitz: Das Design kam erst mit dem nachgeladenen App-Code, bis dahin war die Seite weiß | Design lädt mit der Seite |
| Ganze Ansicht 4-mal neu aufgebaut (Start, Verbindungen geladen, 2× nach dem Sync) | nur noch geänderte Teile werden angepasst, sanft |
| 3 Sprünge um 46 px: Ladehinweis und „Wird gespeichert“ blitzten über dem Inhalt auf | Hinweise nur noch, wenn es wirklich länger dauert |
| Neuer Plan vom Server (anderes Gerät, automatische Anpassung) lud die Seite neu | Plan wird ohne Neuladen übernommen |
| Konto und KI-Stand wurden doppelt abgefragt | je einmal |
| Service Worker: lädt beim Öffnen **nicht** neu (Updates erst beim nächsten Start/„Aktualisieren“) | war schon richtig |
| Schriften: laden nicht nach, ändern keinen Text | war schon richtig |

Neue Daten aus dem Sync gleiten jetzt kurz an ihren Platz, statt zu springen.

**Vorher / nachher** (WebKit; erstes Bild = App mit deinen Daten sichtbar):

| | erstes Bild | Neuaufbauten | Verschiebung (CLS) | heller Blitz | Neuladen |
|---|---|---|---|---|---|
| Deine Daten, vorher | 242 ms | 4 | 0,16 | ja | – |
| Deine Daten, nachher (Safari / Homescreen) | 221 / 212 ms | 1 | 0 | nein | nein |
| 1 Jahr Daten, vorher | 254 ms | 3 | 0,11 | ja | ja, bei neuem Plan |
| 1 Jahr Daten, nachher | 231 ms | 1 | 0 (ohne neue Daten) | nein | nein |

Ein iPhone ist langsamer als mein Rechner, die Unterschiede bleiben aber gleich. „Vorher“ im Homescreen-Modus habe ich nicht getrennt gemessen.

**Fester Test:** `tests/e2e/kaltstart26.spec.ts` (Kaltstart mit einem Jahr Daten, mit und ohne Änderung von einem anderen Gerät, und erstes Öffnen) in Chromium und WebKit. In der Test-App fand ich so noch einen Sprung beim allerersten Öffnen, auch behoben. Messwerkzeug: `node scripts/startmessung.mjs`.

---

# Auftrag 25: Icon-Varianten, Mehr-Tab neu, Coach-KI gezielter, Gesamttest (31.10.)

## Nachtrag 3.13.2: neues Icon
- **2a (Petrol)** ist eingebaut: Home-Bildschirm-Icon, Browser-Icon, Android-Icon, alle iPhone-Startbilder hell und dunkel, kleines Zeichen oben in der App.
- **Auf dem iPhone** erscheint das neue Icon erst, wenn du die App neu zum Home-Bildschirm hinzufügst (Anleitung in FUER-JONAH.md).

## Nachtrag 3.13.1
- **Mitteilungen gingen nie:** Der Service Worker (Hintergrund-Teil der App) war seit dem Umbau am 11.10. kaputt, eine Zeile fehlte. In der echten App gab es deshalb keine einzige Mitteilungs-Anmeldung, dazu keinen Offline-Start und keinen Update-Hinweis. Repariert, Server-Antworten werden dabei nie zwischengespeichert. Neue feste Tests prüfen den Service Worker (auch in WebKit/Safari).
- **Verbindungen** stehen jetzt in der Gruppe Einstellungen.
- **Plan-Generator entfernt:** altes Test-Werkzeug, nur du sahst es. Den Plan erstellt der Fragebogen, Profiländerungen planen automatisch neu (gleiche Plan-Logik).
- **Icon-Varianten** als Link: https://claude.ai/artifact/AbEz9tVJufVYtKhXbwdnPt

**Stand:** Punkte 2–4 fertig und live als Version 3.13.0: erst Test-Umgebung (mit echten KI-Fragen geprüft), dann echte App. Vorher beide gesichert; alle 3 Konten laden an einer Kopie der echten Daten fehlerfrei. **Icon: Du wählst** – die 4 Varianten liegen in `icon-varianten.html`. Nach deiner Wahl baue ich das Icon überall ein (Manifest, Icons, Startbilder).

## 1. Icon (wartet auf deine Wahl)
Link: https://claude.ai/artifact/AbEz9tVJufVYtKhXbwdnPt (am besten auf dem iPhone). Je Variante: Homescreen in echter Größe (hell und dunkel), kleine Größen bis 16 px, Startbild.
1. **Welle → Straße** – Schwimmwellen werden zur ansteigenden Straße, am Ende das Ziel
2. **Puls-Bogen** – Herzschlag geht in einen Bogen nach oben über
3. **Tempo-Form** – drei schräge Balken in Schwimm-, Rad- und Lauffarbe
4. **Fortschritts-Ring** – fast geschlossener Ring Schwimmen → Rad → Laufen

## 2. Mehr-Tab
- **Oben:** Suche und Profilkarte mit Name und Bild (Bild wählen/entfernen im Profil, klein gespeichert).
- **Gruppen wie in den iPhone-Einstellungen:** Konto · Training (Profil und Ziele, Berücksichtigungen, Zonen und Tests, Ausrüstung, Trainingsvorlagen, Fragebogen) · Werte und Essen · Verbindungen · Einstellungen (Mitteilungen, Darstellung, Coach und KI, Einheiten, Sprache) · Daten und Datenschutz · Hilfe (Lexikon, Fehler melden / Idee) · Über · Betreiber (nur du).
- **Nichts verloren:** Die alten langen Seiten „Einstellungen“ und „Daten und Geräte“ sind aufgeteilt. Krankheitsphasen und Zyklus stehen jetzt unter Berücksichtigungen, Räder, Hilfsmittel und Laufschuhe unter Ausrüstung. Ein Test prüft, dass jeder alte Bereich noch da ist.
- **Neu:** E-Mail (freiwillig) unter Konto, Liste der Tests aus dem Plan unter Zonen und Tests, Zurück-Wischen auf dem iPhone führt zur Liste.

## 3. Coach-KI
**Analyse (echte Nutzung):** Nur dein Konto nutzt die KI. 27.10.: 3 Fragen, 38.127 Eingabe-Tokens = 12.700 pro Frage, 115 Neurons pro Frage. Ursache: Jede Anfrage enthielt alles (alle 40 Trainingsregeln, alle Daten, 8 lange Werkzeug-Beschreibungen: 5.300 Tokens) und das 2–4-mal pro Frage.

**Woher die schlechten Antworten kamen** (dein Chat 25. und 27.10.):
| Antwort | von | Fehler | behoben |
|---|---|---|---|
| „Auf welches Datum … und warum?“ | KI | fragt nach dem Grund | Regel im Text + feste Bereinigung |
| „Du möchtest den Schwimmtraining verschieben.“ | KI | erfundener Grund im Vorschlag | Grund nur, wenn du einen nennst |
| „Der Schwimmtest vom Samstag“ (war Dienstag) | KI | Wochentag | Tage stehen mit Datum im Text, Prüfung im Code |
| „Was soll ich mit Langer Lauf … machen?“ | Regel-Coach | Grammatik | Titel in Anführungszeichen |
| „finde keinen anderen erlaubten Tag“ bei „auf den 1.11“ | Regel-Coach | Datum als Zahl nicht verstanden | wird verstanden |
| „Lauftest“ → „Lockerer Lauf“ | Regel-Coach | falsche Einheit | „Test“ im Text sucht den Test |
| „bleibt am Sonntag 25.10..“ | Regel-Coach | doppelter Punkt | an einer Stelle für alle Texte bereinigt |
| dreimal „Gute Besserung!“ | Regel-Coach | Wiederholung | nur noch einmal |
Wechsel mitten im Gespräch: Scheitert die KI (z. B. „Änderung ohne Werkzeug“), antwortet der Regel-Coach und behält das Gespräch. Das bleibt so (sicher), passiert aber seltener.

**Jetzt:** kurze Grundanweisung + nur die passenden Daten (heute immer; letzte 7 Tage, nächste Tage, Ampel, Zonen, Schwimmen, Krankheit je nach Frage) + höchstens 3 passende Regeln aus TRAININGSREGELN.md + nur nötige Werkzeuge. Erkannte Fragen (Bewertung, Tagesplan, Form) brauchen **einen** Aufruf.

| | vorher (27.10.) | jetzt (Gemma, 60 Fragen) |
|---|---|---|
| Eingabe-Tokens pro Frage | 12.700 | 1.730 (−86 %) |
| Aufrufe pro Frage | 2,3 | 1,2 |
| Neurons pro Frage | 115 | 18 (−85 %) |
| Fragen pro Tag im Gratis-Kontingent | ~80 | ~530 |

**Modellvergleich** (60 echte Fragen auf einer Kopie deiner Daten vom 30.10.; teure Modelle mit jeder 4. Frage, damit das Tageskontingent für die echten Nutzer reicht; Konto im Gratis-Plan, keine Kosten). Qualität und Richtigkeit habe ich jede Antwort gelesen und bewertet (1–5).

| Modell | Fragen | KI-Antwort (sonst Regel-Coach) | Qualität | Richtigkeit | Werkzeuge | Neurons/Frage | Zeit |
|---|---|---|---|---|---|---|---|
| **Gemma 4 26B** (bleibt) | 60 | 56 | 5 | 4 | 4 | 17,5 | 2,2 s |
| Qwen3 30B | 60 | 57 | 3 | 3 | 3 | 11,4 | 0,9 s |
| Mistral Small 3.1 | 15 | 14 | 3 | 2 | 2 | 71 | 3,0 s |
| Llama 3.3 70B | 15 | 12 | 4 | 3 | 3 | 94 | 3,9 s |
| gpt-oss-20b | 15 | 12 | 4 | 4 | 3 | 43 | 4,1 s |
| GLM 4.7 Flash | 60 | 24 (35× leer) | 2 | 3 | 2 | 25 | 11,5 s |

Typische Fehler: Qwen erklärt Fachbegriffe falsch („Koppeltraining = zwei Läufe“), mischt chinesische Zeichen ein, übersieht die Krankheit; Mistral machte aus „Lauftest verschieben“ die Regel „Laufen: gar nicht“; Llama behauptete erledigte Einheiten, die es nicht gab. **Gemma 4 bleibt:** beste Antworten pro Neuron.

**Allgemein behoben aus dem Vergleich** (wirkt für jedes Modell): Vorschläge nur für den genannten Tag/Sportart/„langen“ Lauf/Test; keine Verschiebung auf denselben Tag; neue Regel nur, wenn du eine willst; „dienstags nicht mehr …“ wird als Änderung erkannt; „ich habe es notiert“ ohne Vorschlag gilt nicht; Krankheit steht bei Tagesfragen dabei; „Ich habe … gekürzt“ wird entfernt, wenn es erst ein Vorschlag ist. Gemma danach (30 Fragen Bewertung/Tag/Änderung): alle Vorschläge richtig, unpassende gehen an den Regel-Coach.

Fragen: `docs/ki-vergleich-25/fragen.json`. Alle Antworten je Modell liegen nur lokal in `data-export/ki-vergleich-25/` (enthalten deine echten Daten, deshalb nicht im Git).

## 4. Gesamttest
`docs/FUNKTIONEN.md`: alle Funktionen und Bildschirme mit Ort und Test.

**Tests:** Unit 2.640 bestanden; E2E (Chromium + WebKit) 403 bestanden, 141 nach Korrektur der zwei Funde (Wort „Server“ im neuen Datenschutz-Text, alte Erwartung „Gute Besserung“) ebenfalls. Neu: 15 Gesamt-Abläufe, 5 Mehr-Tab-Tests, 4 Große-Schrift-Durchläufe, 16 Coach-Unit-Tests. In der Test-Umgebung (stamio-test) zusätzlich geprüft: Laden, Mehr, Zurück-Wischen, 3 echte KI-Fragen.

| Funktion | getestet (wie) | Fehler | behoben |
|---|---|---|---|
| Fragebogen → Plan | E2E: Antworten, Zusammenfassung, Übernehmen, Plan da | – | – |
| Heute, Einheit, Extra-Einheit | E2E: öffnen, abhaken, Messwert, Extra anlegen; Chromium + WebKit | – | – |
| Plan (Wochen, Tag, Heute, Anpassungen) | E2E | Knopf „Anpassungen“ brach bei großer Schrift mitten im Wort | ja |
| Coach (Fragen, Schnellfragen, Änderung, Notizen, KI) | E2E + 150 Gespräche (Unit) + 60 echte KI-Fragen | siehe Punkt 3 | ja |
| Fortschritt (Scores, Trends, Prognose) | E2E | – | – |
| Essen | E2E: Mahlzeit zählt mit | bei großer Schrift auf 320 px: Seite scrollte seitlich, „Foto“ brach im Wort | ja |
| Werte, Wettkampf, Verbindungen (simuliert) | E2E | – | – |
| Mehr (alle Unterseiten), Suche, Bild, E-Mail | E2E: jede Zeile öffnet ihre Seite, nichts verloren | – | – |
| Fehler melden, Export, Konto löschen, Mitteilungen | E2E mit Test-Server | – | – |
| Offline | E2E: ohne Netz abhaken, nach Neustart noch da | – | – |
| Zurück-Wischen (iPhone) | E2E: Verlauf zurück | tat nichts | ja |
| Homescreen-Modus, Safe Area, Tastatur | E2E (WebKit) | – | – |
| Layout 320–430 px, 130 %, hell/dunkel | E2E (WebKit), alle Bildschirme | – | – |
| Große Schrift | E2E neu, alle Bildschirme, 320 + 390 px, hell/dunkel | 3 Funde (oben) | ja |
| Langzeit-Simulation, Zufallstests, Daten-Check | Unit (fest) | – | – |
