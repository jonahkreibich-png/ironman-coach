# Plan-Tab und Trainingsvorlagen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wochenuebergreifende Planaktionen, korrekte Zusammenfassungen und universelle Vorlagen umsetzen; drei isolierte Vorschauen zur Auswahl bereitstellen.
**Architecture:** Bestehendes TypeScript/DOM-Frontend und bestaetigte lokale Speicherung beibehalten. Fachlogik fuer Tagesinhalte, Planaktionen und Vorlagen separat pruefen. Vorschauen verwenden denselben Daten-/Aktionskern; kein finales Design auswaehlen.
**Tech Stack:** TypeScript, Vite, Vitest, Playwright, bestehender Worker/D1 und IndexedDB.
**Spec:** Eingefuegter Text(4).txt im Projektstamm plus docs/trainingsvorlagen-ergaenzung-2026-10-26.md; Hauptauftrag vollstaendig gelesen.

## Global Constraints

- Synthetische Nutzer und lokale/isolierte Umgebungen; keine Produktionsdaten, keine Veroeffentlichung.
- Bereits absolvierte Istwerte und bestehende Kraftvorlagen vollstaendig erhalten.
- Finale Designumstellung erst nach Jonahs Auswahl zwischen A/B/C.
- 10 Nutzer, je mindestens 12 Wochen; feste Seeds und unabhaengige Erwartungen nach jeder Aktion.
- Keine neuen kostenpflichtigen Abhaengigkeiten, vorhandene Technik verwenden.
- Aktuell entwicklung mit uncommitteter freigegebener 3.7.2-Basis. Dateikopie unter scratch/plan26-work isoliert alle Aenderungen; Git-Metadaten unveraendert.
- Keine Commits/Pushes: Git-Metadaten nur lesbar; Quelle erst nach Vergleich mit baseline.json zurueckschreiben.

## Review Focus

- Vergangene nicht dokumentierte Einheit bleibt offen statt automatisch abgeschlossen.
- Nach Vorlage/Move/Swap/Neustart bleibt dieselbe ID und Beschreibung genau einmal erhalten.
- Vollendete Einheiten koennen auch ueber Vorschau/Bestaetigungsrennen nicht veraendert werden.
- Dauer nur aus ausreichenden Vorgaben berechnen; unbekannte Zeit nicht als null Minuten erfinden.
- Doppelklick, verlorene Vorschau und Import/Synchronisierung duerfen keine Duplikate oder unbemerkten Datenverlust erzeugen.

### Task 1: Planaktionen

**Files:** shared/plan-actions26.ts (neu), web/src/views/planedit.ts, tests/unit/plan-actions26.test.ts.
**Interfaces:** Konsumiert STATE/PLAN und bestehende adjustments; exportiert validierte Vorschlaege/angewendete Aktionen und Schutzpruefungen. Bestehendes propose bleibt die zentrale UI-Commit-Grenze.
- [x] RED: verpasste Einheit ueber drei Wochen verschieben, einzelne zwei Einheiten tauschen ohne Nachbareinheit, ganze Tage tauschen, leeres Ziel, abgeschlossene Einheiten unveraendert.
- [x] Minimalen Fachkern und datum-/wochenuebergreifende Auswahllisten implementieren. Vorschau und Bestaetigung fuer Move/Swap, Undo ueber bestehende Gruppen.
- [x] Dieselben Invarianten nach wiederholten Moves/Swaps pruefen, Istjournal nicht veraendern.
- [x] GREEN mit Vitest; Schnittstellen und tatsaechliche Resultate im Ledger dokumentieren.

### Task 2: Vorlagenkern und Editor

**Files:** shared/training-templates26.ts (neu), web/src/views/templates.ts (neu), tests/unit/training-templates26.test.ts (neu).
**Interfaces:** makeTrainingTemplate(input), templateSession(template,id), applyTemplate(session,template,'replace'|'append'), templateTotals(template); openTemplatePicker({date,sessionId?}), renderTrainingTemplates(). Immer Kopien, keine Aenderung der Quelle oder Istwerte. Bestehende Kraftvorlagen read-only adaptieren.
- [x] RED: vier Sportarten mit Wiederholungen/Pausen, Sportvalidierung, Klonen, Ersetzen/Ergaenzen, unberuehrte Istwerte und Legacy-Kraftvorlagen.
- [x] Modell, sportartspezifische Editierfelder, Suche/Filter, CRUD, Vorschau, Auswahlspeicherung implementieren. Keine echte Migration.
- [x] Neue Einheiten mit add-adjustment und stabiler eigener ID anlegen; vorhandene nur ueber modify derselben ID aendern. Abschlussstatus bei Bestaetigung nochmals pruefen.
- [x] GREEN inklusive kopieunabhaengiger Aenderung und Dauer-/Distanzberechnung.

### Task 3: Planansicht, Flackern und Vorschauen

**Files:** shared/plan-summary26.ts (neu), web/src/views/plan.ts, Tests fuer Zusammenfassungen; Vorschauen unter docs/previews/plan26/.
**Interfaces:** daySummary(day,state) liefert aktive geplante Einheiten, Extras, Sollminuten und getrennte Istminuten. Aktuelle DOM-Aktionsattribute erhalten. Keine Mutation beim Rendern.
- [x] RED: Beispiel 100 -> 40 -> 70 Minuten; Extra sichtbar, Ausfall nicht anstehend, keine Doppelzaehlung importierter Aktivitaeten.
- [x] Gemeinsame Tagesdaten fuer eingeklappt/ausgeklappt/Balken; Anpassungen mit erhaltenem Klappzustand.
- [x] Flackern mit DOM-/Scroll-Messungen diagnostizieren und ursachenspezifisch beheben; Animationen nicht pauschal entfernen.
- [x] Drei deutlich verschiedene klickbare Smartphone-Vorschauen A/B/C mit allen Aktionen und Vorlageneinfuegen, synthetischen Daten und eigener Isolation. Kein produktiver Variantenschalter.
- [x] GREEN und Darstellungskontrolle.

### Task 4: Integration und Datensicherheit

**Files:** web/src/main.ts, web/src/views/session.ts, web/src/views/custom.ts, web/src/store.ts, web/src/sync.ts, web/src/backup-validation.ts; server/src/store.ts nur soweit neue Record-Art erforderlich.
- [x] Vorlagenmenue und Picker aus Einheit/Bearbeitung/Einheit hinzufuegen verknuepfen. Vorhandene Kraftwege kompatibel lassen.
- [x] Trainingsvorlagen in Defaults, Sync-Recordkinds, Backupvalidierung und Wiederherstellung integrieren; neue Instanz als unveraenderlichen Snapshot uebertragen.
- [x] Integrationstest fuer Speichern/Neustart, Import, Konflikt und Datenbankfehler, ohne vorhandenen Stand leer zu ersetzen.
- [x] Typpruefung/Build sowie erforderliche Unit- und Browserpruefungen ausfuehren.

### Task 5: QA und Auslieferung bis Entscheidungspunkt

**Files:** tests/unit/plan-longitudinal26.test.ts, tests/e2e/plan-templates26.spec.ts, playwright.plan26.config.ts, docs/plan-qa-2026-10-26.md.
- [x] 10 benannte synthetische Profile ueber 12-24 Wochen mit unabhaengigem Ledger und Hunderten reproduzierbaren Aktionsketten simulieren. Jede Aktion prueft ID, Beschreibung, Status, Soll/Ist, Kopieunabhaengigkeit.
- [x] Browserablaeufe fuer alle vier Sportarten, bestehende/neue Einheiten, Ersetzen/Ergaenzen, Move/Swap/Reload, schnelle Wechsel und erhaltenen Scroll/Fokus testen.
- [x] Desktop Chromium und mobile Chromium/WebKit ausfuehren; Firefox-Verfuegbarkeit ehrlich pruefen und Blockaden dokumentieren.
- [x] Bestehende Tests auf fachliche Luecken untersuchen und dauerhafte Strategie Unit/Integration/E2E/Simulation/Regression dokumentieren.
- [x] Unabhaengige Reviews, zusammengefuehrte Pruefung und Rueckschreiben nur eigener Aenderungen nach Baselinevergleich.
- [x] Bericht mit wirklichen Resultaten und Vorschauen; Empfehlung A/B/C begruenden und auf Jonahs Designwahl warten.

## Abschlussstand 27.10.2026

Funktionale Aufgaben umgesetzt; Ergebnisse und Testgrenzen: docs/plan-qa-2026-10-26.md. Der regulaere HTTP-Gesamtlauf bleibt hier blockiert, deshalb keine Releasefreigabe. Finale Gestaltung wartet auf Jonahs Auswahl A/B/C. Vor dem Rueckschreiben werden Originalhashes gegen die Baseline verglichen.
