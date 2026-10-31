# Funktionen und Bildschirme (Stand Auftrag 25)

Jede Zeile: was die App kann, wo es ist und welcher automatische Test es prüft. E2E = echter Browser (Chromium und WebKit/Safari, 390 px).
Alle Tests laufen mit `npm run e2e` bzw. `npm test` vor jeder Übergabe.

## Start und Fragebogen
| Funktion | Wo | Test |
|---|---|---|
| Begrüßung, Einladung als Link, Wiederherstellungscode | Start ohne Plan | E2E auftrag5, layout (leer) |
| Fragebogen ausfüllen (alle Blöcke, Pflichtfragen, Zusammenfassung „So habe ich dich verstanden“) | Start → Fragebogen | E2E auftrag4 (A1/B/F2, ganzer Fragebogen), auftrag25-gesamt |
| Plan entsteht aus den Antworten | Fragebogen → Übernehmen | E2E auftrag25-gesamt, Unit onboarding, plangen |
| Fragebogen bei vorhandenem Plan: Plan geht weiter | Mehr → Training → Fragebogen | E2E auftrag7 |

## Heute
| Funktion | Wo | Test |
|---|---|---|
| Einheiten von heute, Ampel, Antwort- oder Nachrichten-Ansicht | Heute | E2E app, auftrag14, auftrag25-gesamt |
| Einheit abhaken und wieder lösen | Heute, Plan, Einheit | E2E app, auftrag25-gesamt |
| Morgenwerte eintragen (Gefühl, Muskelkater, Schlaf …) | Heute (Herz), Werte | E2E app, auftrag14 |
| Krank / wieder gesund, Schmerzen | Heute | E2E app, auftrag19-gesundheit |
| Vergessene Einheiten nachtragen oder als ausgefallen markieren | Heute | Unit auftrag17-sollist, E2E plan-templates26 |

## Plan
| Funktion | Wo | Test |
|---|---|---|
| Wochenleiste, Woche kompakt, Tag aufklappen, „Heute“ | Plan | E2E auftrag18, auftrag19-plan, auftrag25-gesamt |
| Zeitleiste mit Phasen und Zielen, Wochenkopf | Plan | E2E auftrag8 |
| Dashboard (Soll/Ist, Ausfälle, Extras) | Plan oben | E2E plan-dashboard27, dashboard-extra27, dashboard-title27 |
| Anpassungen der letzten 30 Tage, Rückgängig | Plan | E2E auftrag25-gesamt, auftrag4 (C5) |
| Einheit bearbeiten, fest markieren, Original | Plan → Einheit | E2E auftrag4 (C5), auftrag5 (A4) |
| Verschieben, Tauschen (auch über Wochen) | Plan | E2E plan-templates26 |
| Trainingsvorlagen einfügen, anlegen, bearbeiten, löschen | Plan, Mehr → Trainingsvorlagen | E2E plan-templates26, template-crud26, strength-templates |

## Einheit
| Funktion | Wo | Test |
|---|---|---|
| Ablauf in Schritten (Aufwärmen, Hauptteil, Ausklang), Hilfsmittel | Einheit | E2E auftrag7, auftrag21 |
| Werte je Sportart (Dauer, Distanz, Pace getrennt, Puls, Watt, RPE, Gefühl), Pulszone automatisch | Einheit | E2E auftrag7, auftrag4 (A7), app, auftrag25-gesamt |
| Intervalle eintragen (Soll als Platzhalter, „wie vorheriges“, Grenzen) | Einheit | E2E auftrag22 |
| Testfelder (z. B. Radtest 20 min) | Einheit (Test) | E2E auftrag8 |
| Extra-Einheit anlegen, Sportwechsel, abschließen, entfernen | Plan → Extra | E2E auftrag25-gesamt, dashboard-extra27 |
| Jetzt abrufen (Uhr/Dienste) | Einheit | Unit fetchnow, Server connect |

## Coach
| Funktion | Wo | Test |
|---|---|---|
| Regel-Coach: Fragen, Rückfragen mit Knöpfen, Änderungen mit Bestätigung und Rückgängig | Coach | Unit chat (150+ Gespräche), auftrag25-coach, E2E auftrag4 (D), auftrag25-gesamt |
| Kostenlose KI (Workers AI): Einwilligung, Strom, Vorschläge, Rückfall auf Regel-Coach, Eltern unter 16 | Coach | E2E auftrag16, Server wai, Unit auftrag25-coach |
| Gezielter KI-Kontext (nur passende Daten, Regeln, Werkzeuge) | Server | Unit auftrag25-coach, Server wai |
| Vorschläge der KI nur für den genannten Tag | Server | Unit auftrag25-coach |
| Tippen-Animation, „Bewegung reduzieren“ | Coach | E2E auftrag12 |
| Notizen, „Was der Coach gerade sieht“ | Coach | E2E auftrag7, auftrag25-gesamt |
| Meldungen (Briefing, Warnungen) je Anlass nur einmal | Coach | Unit feed, E2E auftrag21 |

## Fortschritt
| Funktion | Wo | Test |
|---|---|---|
| Scores je Sportart mit Erklärung | Fortschritt | E2E auftrag12, auftrag24, auftrag25-gesamt; Unit auftrag19/20-scores |
| Trends (Zeitraum, Verlauf) | Fortschritt | E2E auftrag13, auftrag25-gesamt |
| Prognose je Ziel (heute und Wettkampftag, Warum?, Wunschzeit) | Fortschritt, Wettkampf | E2E auftrag23, auftrag24; Unit prognosis-race, auftrag23/24 |
| Einklappen bleibt gespeichert | Fortschritt | E2E auftrag23 |
| Umfang pro Woche, Meilensteine | Fortschritt | E2E auftrag7 |

## Werte, Essen, Wettkampf
| Funktion | Wo | Test |
|---|---|---|
| Morgenwerte, Verläufe, Belastung (CTL/ATL/TSB) von Hand | Mehr → Werte | E2E load-values, auftrag25-gesamt |
| Essen: Ziele für heute, Mahlzeit hinzufügen, Foto | Mehr → Essen | E2E auftrag25-gesamt |
| Wettkampf: Rennwoche, Pacing, Verpflegung, Ergebnis | Mehr → Wettkampf | E2E auftrag25-gesamt, auftrag12 |

## Verbindungen
| Funktion | Wo | Test |
|---|---|---|
| Oura, Dropbox/HealthFit, intervals.icu, Kurzbefehl (simuliert) | Mehr → Verbindungen | E2E auftrag13, auftrag15, app; Server connect, healthfit, intervals |
| Fehlerzustand mit Grund und Hilfe | Verbindungen | E2E auftrag13 |

## Mehr (Auftrag 25)
| Funktion | Wo | Test |
|---|---|---|
| Suche, Profilkarte mit Bild, Gruppen wie iOS-Einstellungen, höchstens 2 Ebenen | Mehr | E2E auftrag25-mehr |
| Konto: E-Mail (freiwillig), Anmeldung, Geräte, Wiederherstellung, Abmelden | Mehr → Konto | E2E auftrag25-mehr, auftrag4, auftrag5, auftrag15 |
| Profil und Ziele, Berücksichtigungen (Wochenraster, Teamsport, Können, Krankheitsphasen, Zyklus) | Mehr → Training | E2E auftrag5, auftrag6, auftrag25-mehr |
| Zonen und Tests (Schwellen, Zonen, Tests aus dem Plan, Ampel-Grenzen, Score-Korrektur) | Mehr → Training | E2E auftrag4 (A1/A7), auftrag12, auftrag25-mehr |
| Ausrüstung (Räder, Wattmesser, Rolle, Schwimm-Hilfsmittel, Laufschuhe) | Mehr → Training | E2E auftrag25-mehr, auftrag21 |
| Mitteilungen, Darstellung, Coach und KI, Einheiten, Sprache | Mehr → Einstellungen | E2E auftrag25-mehr, auftrag25-gesamt, app, auftrag16 |
| Daten und Datenschutz: Backup, Wiederherstellen, Export, Konto löschen | Mehr → Daten und Datenschutz | E2E auftrag25-gesamt, auftrag5, storage-recovery24 |
| Lexikon, Fehler melden / Idee | Mehr → Hilfe | E2E lexikon, auftrag4, auftrag5, auftrag25-gesamt |
| Über (Version, Installieren, Aktualisieren, Fehlerprotokoll) | Mehr → Über | E2E auftrag25-mehr, auftrag25-gesamt |
| Betreiber: Einladungen, Nutzer, KI-Verbrauch, Serverfehler | Mehr → Betreiber (nur Admin) | E2E auftrag16, auftrag5 |

## Mitteilungen, Offline, Sync
| Funktion | Wo | Test |
|---|---|---|
| Mitteilungen: Auswahl und Zeiten speichern | Mehr → Mitteilungen | E2E auftrag25-gesamt |
| Mitteilungen zustellen (Morgen, vor der Einheit, abends, Woche …), Ruhezeit | Server | Server notify/push |
| Offline weiter eintragen, nichts geht verloren | überall | E2E auftrag25-gesamt, storage-recovery24 |
| Sync mehrerer Geräte, Konflikte feldweise | Server, App | Unit merge, coach-sync24, persistence-journal24; E2E storage-recovery24 |
| Mehrere Tabs gleichzeitig | App | Unit persistence-journal24, E2E storage-recovery24 |

## Dauerhafte Prüfungen
| Prüfung | Test |
|---|---|
| Langzeit-Simulation (kurz immer, 52 Wochen mit STAMIO_LONG=1) | Unit longterm21, longitudinal24, plan-longitudinal26 |
| Zufallstests (1.000 Fälle, vor großen Releases 5.000) | Unit fuzz22 |
| Täglicher Daten-Check (nachts, alle Nutzer) | Unit datacheck22, Server datacheck |
| Echtdaten-Prüfung vor jedem Release | scripts/release-datacheck.ts |
| Layout aller Bildschirme: 320/375/390/430 px, 130 % Zoom, große Schrift, hell und dunkel, leer/normal/voll/Fehler | E2E layout (WebKit) |
| iPhone: WebKit, Homescreen-Modus, Safe Area, Tastatur, Zurück-Wischen, Tab-Leiste mit Finger | E2E auftrag25-gesamt, tabbar, layout |
| Bedienbarkeit mit VoiceOver (jedes Element hat einen Namen) | E2E auftrag22 |
| Kontrast aller Textfarben (WCAG 4,5:1) | Unit contrast22 |
