# Teststrategie Plan und Trainingsvorlagen – 26.10.2026

## Befund aus der bestehenden Testsuite

Die bisherigen Tests sind nicht wertlos: `tests/helpers/longitudinal24.ts` führt zehn synthetische Profile mit 4/12/24/52 virtuellen Wochen aus. Das Istlast-Ledger und die separat berechnete CTL/ATL-Rekurrenz sind fachliche Orakel. `tests/unit/storage-longitudinal24.test.ts` prüft vier Nutzer über 180 Tage und 2.160 Speicher-/Neustartvorgänge einschließlich Quota-Ausfall und Journal. `session-move-integrity24.test.ts` prüft ID, Beschreibung, Aufbau und erneutes Verschieben. `strength-templates.test.ts` und die gleichnamige Browserdatei enthalten konkrete Validierungs-, Kopier- und Speicherassertions.

Die geprüften Fälle erklären dennoch die verbliebenen Lücken:

- Die ältere fachliche Langzeitsimulation prüft viele Invarianten erst am Wochencheckpoint. Fehler zwischen zwei Änderungen können bis dahin verschwunden sein. Sie verbindet nicht manuelles Tauschen, Vorlagen, Extras und kompakte Tagesansicht in einer Handlungskette.
- Die Speichersimulation hat ein unabhängiges Ledger, wiederholt aber im Wesentlichen dasselbe Verschiebe-/Korrekturmuster. Vier Nutzer und lange Laufzeiten ersetzen keine unterschiedlichen Konfliktarten oder neuen Datensatzarten.
- `tests/e2e/auftrag19-plan.spec.ts` prüft Klappen, Beschreibungen und Überlauf bei 320/390/430 Pixeln. Es prüft keine exakten Soll-/Istminuten nach Ausfall, Extra, Tausch und Neuladen. Die Ruhetag-Ausweichlogik beweist nicht, dass der ursprünglich erwartete konkrete Trainingsfall vorhanden war.
- Die vorhandenen Kraftvorlagentests belegen Kraftvorlagen, nicht strukturierte Schwimm-, Rad- und Laufvorlagen. Ein grüner Altbestand kann diese neue Funktion nicht absichern.
- Einzelne Beispiele und Snapshot-Tests können korrekte Darstellung bei falscher fachlicher Berechnung bestätigen. Eine große Testzahl ist kein Beleg für die neue Interaktionskette.
- Journal-/Map-Adapter sind sinnvoll für gezielte Fehlerzustände, ersetzen aber keine reale Browser-Neuladung mit IndexedDB und localStorage. Ebenso beweist eine Viewportgröße allein keine echte Touchbedienung oder Safari-Kompatibilität.

Dies ist eine gezielte qualitative Prüfung der genannten Dateien. Es wurde keine vollständige instrumentierte Zeilen-/Branch-Coverage berechnet. Es gibt deshalb hier keine behauptete Coverage-Prozentzahl und keine pauschale Behauptung, die gesamte Suite sei zu stark gemockt.

## Dauerhafte Prüfebenen und Abnahmekriterien

| Ebene | Fachliche Prüfung | Unabhängiger Nachweis / Ausführung |
|---|---|---|
| Unit | Move/Einzeltausch/Ganztagstausch, vergangen/offen, stabile ID, gleiche Beschreibung/Intervalle, abgeschlossene Historie geschützt | Konkrete Vorher-/Nachher-Fixtures; Vorschau erneut gegen den Zustand bei Bestätigung prüfen |
| Unit | Gemeinsame Tagesprojektion, 100 → 40 → 70 Minuten, Ausfall und Extra, getrenntes Soll/Ist, unbekannte Dauer | Literale erwartete Minuten und IDs; niemals das Ergebnis der getesteten Summenfunktion als Erwartung verwenden |
| Unit | Alle vier Vorlagensportarten, Wiederholungen/Pausen, verschachtelte Serien, Ersetzen/Ergänzen, Validierung, Legacy-Kraft | Handberechnete Dauer/Distanz; Quelle und Instanz anschließend unabhängig verändern |
| Integration | Zusammenspiel von Anpassungsreplay, Custom-Standorten, Vorlagen und Tagesprojektion | Neues SIM26-Ledger nach jeder Aktion; echte gespeicherte Zustände separat über Store/Backup-/Sync-Grenzen testen |
| Integration | Speichern/Neustart, Backupimport, Synckonflikt, Journal-/DB-Fehler, fehlgeschlagener Schreibvorgang | Bestehende Durability-Tests erhalten; neue Trainingsvorlagen explizit in Roundtrips einbeziehen; Fehler darf keinen leeren Ersatzstand speichern |
| E2E | Vorlage erstellen/bearbeiten/duplizieren/löschen, in neue/bestehende Einheit einsetzen, Move/Swap/Undo/Reload | Echte Buttons/Formulare bedienen; exakte Daten und Minuten vor und nach Browser-Neuladung lesen, sichtbare Zusammenfassung prüfen |
| E2E | Schnelle Wochenwechsel, Klappen, Fokus, Scrollposition, Überlauf und erreichbare Aktionen | Desktop Chromium/Firefox sowie mobile Chromium/WebKit; Browserstartfehler als Blockade berichten |
| Simulation | 10 synthetische Datensätze, 12–24 virtuelle Wochen, feste Seeds, zusammengesetzte Aktionen | Jede Mutation unmittelbar gegen unabhängiges ID-/Standort-/Status-/Minuten-Ledger prüfen; Fehler enthält Profil, Seed und Aktionsnummer |
| Regression | Jeder reproduzierte Fehler und gefährliche Übergang | Kleinstes fehlgeschlagenes Beispiel zuerst sichern, nach Korrektur erneut ausführen; angrenzende Interaktionskette mitprüfen |

Bei jeder Änderung zunächst die betroffene fachliche Prüfung ausführen. Vor Zusammenführung Typecheck, relevante Unit-/Integrationstests, Build und verfügbare Browsermatrix ausführen. Keine Tests durch zusätzliche Wartezeiten oder schwächere Assertions grün machen. Befunde und tatsächlich ausgeführte Kommandos mit Resultat festhalten. Bei einem gefundenen Seed den Übergang zusätzlich als kleine Regression dauerhaft erhalten.

## Neue SIM26-Ausführung

Datei: `tests/unit/plan-longitudinal26.test.ts`.

| Synthetisches Profil | Virtuelle Wochen | Seed | Aktionen | JSON-Neustarts |
|---|---:|---:|---:|---:|
| beginner | 12 | 2612 | 216 | 12 |
| advanced | 13 | 2613 | 234 | 13 |
| performance | 14 | 2614 | 252 | 14 |
| football-triathlon | 15 | 2615 | 270 | 15 |
| little-time | 16 | 2616 | 288 | 16 |
| irregular | 17 | 2617 | 306 | 17 |
| frequent-changes | 18 | 2618 | 324 | 18 |
| many-extras | 19 | 2619 | 342 | 19 |
| missed-training | 20 | 2620 | 360 | 20 |
| corrections | 21 | 2621 | 378 | 21 |
| **Gesamt** | **165** | | **2.970** | **165** |

Die Profile unterscheiden sich in Dauer, Umfang, Seed und im Fußballfall zusätzlichen Fußballspielen. Ihre Namen sind Software-Testprofile, keine Simulation individueller Physiologie. Alle durchlaufen absichtlich dieselben 18 fachlichen Übergänge pro Woche; Seeds variieren Zielwochen/-tage, Tagesinhalte beim Tausch, Zusatzdauer, Intervallanzahl/-dauer und Navigation. Dies sind zufallsparametrisierte Aktionsketten, keine zufälligen Permutationen sämtlicher möglicher App-Aktionen.

Jede Woche verknüpft: offene/undokumentierte Einheit über Wochen verschieben; einzelne Einheit tauschen; ganzen Tag tauschen; absagen; manuelles Extra anlegen und verschieben; strukturierte Vorlage erstellen und einfügen; Quelle unabhängig ändern; Sollvorgabe ersetzen und ergänzen; Istwerte abschließen und korrigieren; abgeschlossene Einheit vor Planänderung schützen; Klapp-/Wochenzustand ändern; JSON-Backup wiederherstellen; zusätzliche Einheit anlegen und entfernen.

Nach **jeder** Aktion werden **alle** Tage geprüft: vollständige ID-Menge ohne Dubletten/Verlust, Datum, Sportart, Titel, genaue Beschreibung, ursprüngliche Intervalle, Herkunft, Abschluss/Ausfall, aktive Sollminuten und getrennte Istminuten. Das Ledger ändert sich mit den erwarteten Ereignissen und benutzt weder die getestete Aktionsfunktion noch die Tagesprojektion, um Erwartungswerte zu berechnen. Neue Vorlagendauern werden unabhängig aus Anzahl × Arbeitszeit + (Anzahl − 1) × Pause berechnet. Vorlagentexte haben eigene erwartete Literale. Zusätzlich darf keine Projektion den Eingabezustand verändern.

Ausführung aus der isolierten Kopie:

```powershell
node ../../node_modules/vitest/vitest.mjs run tests/unit/plan-longitudinal26.test.ts
```

Ergebnis: **10 von 10 Tests bestanden** (abschließendes Protokoll: `scratch/qa26/longitudinal26.log`).

## Grenzen der Aussage

Es wurden 165 Wochen virtuell durchlaufen, keine 12–21 Wochen reale Laufzeit abgewartet und keine echten Nutzerkonten verwendet. Der neue Test integriert reine Produktivmodule, aber klickt keine Browseroberfläche. Klappen und Navigation sind hier gespeicherte Zustandswechsel mit erneuter Prüfung derselben fachlichen Projektion; deren echte DOM-Einbindung muss der Browsertest prüfen. JSON-Neustarts beweisen Serialisierbarkeit und Replay, nicht physische IndexedDB-, Server-/D1- oder Sync-Dauerhaftigkeit. Die vorhandenen Speicherprüfungen und neue Store-/Browserintegration sind dafür zusätzlich erforderlich.

SIM26 berechnet keine Coach-Empfehlungen, Fortschritts-Scores, Trainingsanpassungsphysiologie oder Generierungsqualität; dafür bleiben die bestehenden longitudinal24-, Coach-, Score- und Planregeltests zuständig. Unbekannte Vorlagendauern, tief verschachtelte Serien und Legacy-Kraftmigration haben gezielte Unit-Fälle außerhalb dieser Simulation. Die gesamte Anwendung ist damit nicht als fehlerfrei nachgewiesen.
