# Auftrag 35: Abschnitte, Kontraste, km-Ansicht, Einheit umwandeln, Puls-Zonen (13.11.)

**Stand:** Version **3.23.0**, STAND_RELEASE. Gilt für alle Nutzer und alle Sportarten. Was du am iPhone tun kannst: FUER-JONAH.md.

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
- Tab-Leiste: Wer „Mehr“ antippte und gleich danach eine Unterseite, wurde manchmal wieder auf „Mehr“ zurückgeworfen (verspäteter Tab-Tipp; schon in 3.22.0, fiel beim Release-Test auf). Jetzt verfällt der verspätete Tipp.
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
STAND_TESTS

## Grenzen (ehrlich)
- Erkennung aus dem Pulsverlauf nur für Aufzeichnungen ab 3.23.0; ältere Rad-Aufzeichnungen ohne Runden bleiben ohne Abschnitte.
- Niedrigere Puls-Zonen schlägt die App nie automatisch vor (Training ist selten ganz ausbelastet) – dafür gibt es den Test.
