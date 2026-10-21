# Belastung: Formeln, Daten und Grenzen

Die gemeinsame Rechnung steht in `shared/load.ts`; Trainingslast und Zuordnung in `shared/core.ts`. Werte, Einheiten, Fortschritt, Gesamtform und Planung greifen darauf zu.

## Modell

Für jeden Kalendertag: `CTL_neu = CTL_alt + (Tageslast − CTL_alt)/42`, `ATL_neu = ATL_alt + (Tageslast − ATL_alt)/7`. Intern wird nicht täglich gerundet. Die Zeitkonstanten sind unter Mehr → Werte → Belastungswerte → Modell einstellen veränderbar (1 bis 3650 Tage).

`TSB = CTL − ATL` bezeichnet hier ausdrücklich das **Tagesende**. `ATL/CTL` ist bei CTL = 0 nicht definiert. Das Sheet nennt zusätzlich den Tagesanfang aus dem vorherigen Zustand. Ohne Vorgeschichte ist der initiale Zustand null: eine Modellannahme, keine Messung.

TrainingPeaks bezeichnet dagegen den Unterschied der **Vortageswerte** als heutiges TSB. Zahlen verschiedener Anzeigen dürfen deshalb erst nach Abgleich des Zeitpunkts verglichen werden.

Importierte CTL-/ATL-Werte sind datierte Tagesendanker: Die Tageslast wird nicht noch einmal obenauf gerechnet. Nach dem letzten Anker läuft das Modell mit den erfassten Einheiten weiter. Fehlt ein Anker, beginnt die Rechnung bei null und kennzeichnet die Initialisierung als geschätzt. Nicht erfasste Tage tragen null erfasste Last bei; das beweist keinen echten Ruhetag. Fehlende Einheiten lassen sich aus diesen Daten nicht rekonstruieren.

## Belastung einzelner Einheiten

Priorität: vorhandene `icuLoad`, Radleistung relativ zur FTP, Puls relativ zum sportartspezifischen Schwellenpuls, sonst RPE beziehungsweise die bestehende Planungsschätzung. Alle internen Schätzungen verwenden dieselbe nominelle Skala: eine Stunde mit Intensitätsfaktor 1 ergibt 100 Belastungspunkte.

- Rad mit NP: `Stunden × (NP/FTP)² × 100`. Bei vorhandener Durchschnittsleistung statt NP ist es eine Näherung, insbesondere bei Intervallen.
- Puls: `Stunden × (Durchschnittspuls/Schwellenpuls)² × 100`. Das ist die bestehende einfache App-Heuristik, **nicht** die Original-hrTSS-Berechnung von TrainingPeaks.
- RPE: Intensitätsfaktor `min(RPE/9, 1,05)`, nach unten auf null begrenzt. Für Kraft und Schwimmen ohne belastbare Leistungsdaten bleibt dies eine grobe Schätzung. Die nominelle gemeinsame Skala macht unterschiedliche Sportarten nicht physiologisch identisch.

Negative Belastung, Dauer und RPE können keine positive Last durch Quadrieren erzeugen. Aufzeichnungs-IDs und Zusammenführungsverweise verhindern die Mehrfachzählung derselben verknüpften Einheit. Separate Einheiten desselben Tages werden addiert. Entwürfe und deren verknüpfte Aufzeichnungen zählen erst nach Abschluss; alte Extra-Einheiten ohne Abschlussfeld bleiben kompatibel. Nicht verknüpfte, getrennt importierte Aufzeichnungen ohne erkennbare Identität lassen sich hier nicht zuverlässig als Duplikate erkennen.

## Handwerte und Rücksetzen

CTL, ATL, TSB und ATL/CTL werden mit Datum im vorhandenen Trend-Datensatz gespeichert. `_manual` schützt Eingaben vor Importen; `_auto` behält die letzten Quellenwerte. CTL und ATL setzen den Modellzustand ab ihrem Datum. Separate TSB-/Quotienten-Eingaben gelten nur am eigenen Tag und verändern den fortgeschriebenen Zustand nicht. Abweichungen zu CTL/ATL werden sichtbar markiert. Ein neuer Importanker an einem späteren Datum ist eine neue Beobachtung und kann den fortgeschriebenen Verlauf verändern.

Das Änderungsprotokoll speichert vorherige und folgende Werte. Rückgängig betrifft nur tatsächlich geänderte Felder und erhält inzwischen eingegangene automatische Werte. Rücksetzen und Rückgängig bleiben protokolliert. Die vorhandene Synchronisation speichert pro Datensatz; gleichzeitige Änderungen desselben Tages auf mehreren Geräten haben weiterhin die bestehende Regel „neueste Datensatzänderung gewinnt“, keine feldweise Konfliktauflösung.

## Geprüfte Referenzen (20.10.2026)

- [TrainingPeaks: ATL-Formel](https://help.trainingpeaks.com/hc/en-us/articles/204071894-Fatigue-ATL)
- [TrainingPeaks: zeitliche Zuordnung von TSB](https://help.trainingpeaks.com/hc/en-us/articles/204071764-Form-TSB)
- [TrainingPeaks: TSS und hrTSS](https://www.trainingpeaks.com/learn/articles/training-with-tss-vs-hrtss-whats-the-difference/)

Diese Quellen erklären das Referenzmodell; sie validieren weder die App-Scores noch die vereinfachten Puls-/RPE-Schätzungen.
