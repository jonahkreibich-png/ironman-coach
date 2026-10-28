# Dashboard C Implementation Plan

> For agentic workers: use superpowers:executing-plans task by task.

Goal: Jonahs ausgewaehlte Variante C in den echten Plan integrieren; Abhaken und Istkorrekturen erhalten.
Architecture: Reine Dashboarddarstellung aus bestehender weekSummary; bestehende Tages-/Einheitenaktionen und Speicherpfade unveraendert.
Tech Stack: TypeScript, vorhandenes CSS, Vitest, Playwright.
Spec: Gewaehlte Vorschau docs/previews/plan26/index.html, Variante C; ausdrueckliche Auswahl und Ausfuehrung im Chat.

## Constraints
Keine Datenmigration, keine Produktionsaenderung, keine neuen Abhaengigkeiten. Vorhandene uncommittete Arbeit erhalten. Dateikopie statt schreibgeschuetztem Git-Worktree; Originalhashvergleich vor Uebernahme. User autorisiert Ausfuehrung ohne weitere Design-/Planrueckfragen.

## Review Focus
Geplant vs Ist getrennt, fehlende Werte nicht als Null bestaetigen; Extras und Ausfaelle korrekt; Abhaken/Ruecknahme/Neuladen fuer alle vier Sportarten; Theme und 320px ohne Ueberlauf; bestehende IDs/Vorlagen/Move/Swap unveraendert.

### Task 1: Dashboard
Files: web/src/views/plan-dashboard27.ts (neu), plan.ts, styles.css, tests/unit/plan-dashboard27.test.ts.
- [x] RED: echte weekSummary-Fixtures fuer 100 -> 40 -> 70, Ist 35, fehlende Dauer, Sportanteile, keine Eingabemutation.
- [x] Darstellung renderPlanDashboard(summary) mit geplanter Zeit, absolvierten Minuten, Abschlusszaehler und Sportverteilung.
- [x] GREEN und Typecheck.

### Task 2: Integration und Browser
Files: tests/e2e/plan-dashboard27.spec.ts, playwright.plan26.config.ts.
- [x] Dashboard in renderPlan integrieren, Tageskarten im gewaehlten Stil, bestehende Haken/Detail-/Bearbeitungsaktionen erhalten.
- [x] RED/GREEN Browser: Dashboard sichtbar, alle vier Sportarten abhaken und zuruecknehmen, Istkorrektur/Neuladen, Vorlage neu anlegen/abschliessen, 320/390/1440 hell/dunkel, schnelle Navigation.
- [x] Bestehende Vorlagen-/Verschiebe-/Speicherfaelle, erforderlicher Gesamtlauf, Build und Review; HTTP-Sperren ehrlich dokumentieren.
- [x] Nur geaenderte Dateien nach Baselinevergleich uebernehmen, Ergebnis und notwendige Nutzeraktion aktualisieren.

Abschluss: funktionale Umsetzung und lokale Pruefungen fertig; Bericht docs/dashboard-c-2026-10-27.md. Normale HTTP-Pruefung bleibt blockiert; kein Deployment.
