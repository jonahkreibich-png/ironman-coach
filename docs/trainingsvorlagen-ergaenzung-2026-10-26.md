# Ergaenzungsauftrag: allgemeine Trainingsvorlagen

Stand: 27.10.2026. Mit dem vollstaendig gelesenen Hauptauftrag aus Eingefuegter Text(4).txt umgesetzt; keine Veroeffentlichung. Ergebnisse und Grenzen: docs/plan-qa-2026-10-26.md.

## Bekannter Projektstand

Lokale Paketversion 3.7.2. Bestehende Kraftvorlagen: shared/strength.ts und web/src/views/strength.ts; Trainingsaenderungen werden in web/src/views/planedit.ts als Anpassungen gespeichert. Vorhandene uncommittete Arbeit bleibt erhalten.

## Bestehende Einheit

Vorlage fuer Schwimmen, Radfahren, Laufen oder Kraft aus geoeffneter/geaenderter Planeinheit auswaehlen. Suche und Sportfilter. Wahl zwischen Ersetzen und Ergaenzen mit expliziter Vorschau vor dem Commit. ID der bestehenden Einheit bleibt erhalten, keine Duplikate. Nur geplante Inhalte aendern; tatsaechlich absolvierte Daten unveraendert lassen. Uebernommene Inhalte bleiben individuell bearbeitbar.

## Neue Einheit

Im Plan einen Tag waehlen, Einheit hinzufuegen, Aus Vorlage, Auswahl, Vorschau, bestaetigtes Anlegen. Neue eindeutige Trainings-ID und vollstaendiger unabhaengiger Inhaltssnapshot. Tag im Plan danach sofort aktualisieren.

## Daten und Umfang

Uebungen, Saetze, Wiederholungen, Intervalle, Distanzen, Intensitaeten und Pausen vollstaendig uebernehmen. Geplante Dauer und Umfang berechnen; Pausen und Wiederholungen nicht verlieren oder doppelt zaehlen. Aenderungen an Vorlage und geplanter Einheit duerfen sich nicht gegenseitig veraendern. Vorlagen beliebig wiederverwenden. IndexedDB/Backup/Import/Sync beruecksichtigen, vorhandene Kraftvorlagen kompatibel halten. Keine riskante Migration oder Produktionsaenderung.

## Geplante Regressionen

Fuer alle vier Sportarten Ersetzen, Ergaenzen, neue Einheit, Vorschau/Abbrechen, Dauer/Umfang und Kopieunabhaengigkeit pruefen. IDs und vorhandene Ist-Werte vor/nach Einfuegen vergleichen. Neustart, Backup-Roundtrip, Verschieben ueber Wochen, Tauschen und Bearbeiten kombinieren. Synthetische Daten verwenden. Dieselben Funktionen in allen drei Designvarianten pruefen, in den isolierten Vorschauen A/B/C.

## Hauptauftrag gelesen

Die lokale Datei Eingefuegter Text(4).txt wurde vollstaendig gelesen. Der vorherige Bereitstellungsfehler ist erledigt. Plan: docs/superpowers/plans/2026-10-26-plan-und-vorlagen.md. Drei klickbare Varianten: docs/previews/plan26/index.html. Die endgueltige Gestaltung wartet ausdruecklich auf Jonahs Auswahl.
