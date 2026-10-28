# Feste Regeln (Jonah)

- **Autonom arbeiten, keine Fragen stellen.** Entscheidungen selbst treffen und mit Begründung in `ENTSCHEIDUNGEN.md` eintragen (fortlaufende Nummer).
- **Nichts kaufen.** Keine kostenpflichtigen Dienste, Domains, Abos oder Upgrades. Nur kostenlose Kontingente nutzen.
- **Keine Prüflisten für Jonah.** Selbst testen; Jonah bekommt nur, was er wirklich selbst tun muss (in `FUER-JONAH.md`).
- **Kurz und einfach auf Deutsch antworten.** Auch Dokumente (ERGEBNIS.md, FUER-JONAH.md) kurz und verständlich.
- **Immer erst in der Test-Umgebung testen** (`stamio-test`, https://stamio-test.pages.dev, `node scripts/deploy.mjs test`). Die echte App (`coach-app-efc7`, Worker `coach-api-efc7`, D1 `coach-db-efc7`) nur nach [scripts/release.md](scripts/release.md) ändern.
- **`ZUGANG.local.md` und Schlüssel nie committen.** Vor jedem Commit `node scripts/check-secrets.mjs`.

## Arbeitsweise
- Branch `entwicklung`; `main` nur nach scripts/release.md.
- Vor jeder Übergabe: `npm run typecheck && npm test && npm run build && npm run e2e`.
- Echte Daten nie verändern ohne vorheriges Backup (`wrangler d1 export … --remote` nach `data-export/`).
- Ergebnis eines Auftrags kurz in `ERGEBNIS.md`.

## Bestehende Implementierung zuerst pruefen

- Jede Entwicklungsphase beginnt mit einer gruendlichen Untersuchung der zugehoerigen bestehenden Implementierung, bevor neue Funktionen, Berechnungen, Datenstrukturen, Tabellen, APIs oder Algorithmen entstehen.
- Vorhandene Komponenten, Berechnungen, Datenbankabfragen, Schnittstellen, Aufrufstellen und ihre Verbindungen suchen. Datenfluss, Aktualitaet der verwendeten Daten, Berechnungen, Zuordnungen, doppelte Implementierungen und fehlende/falsche Aufrufe pruefen.
- Fehlerursachen zuerst im bestehenden Code beheben. Geeignete Komponenten und Datenmodelle weiterverwenden; Kompatibilitaet und vorhandene Nutzerdaten schuetzen. Doppelte Logik nur bei sicherer Abloesung entfernen.
- Neue Funktionen, Dateien, Tabellen oder Abhaengigkeiten nur bei tatsaechlich fehlender Funktion oder ungeeigneter Architektur; Bedarf begruenden und in die bestehende Architektur integrieren. Kein paralleles System fuer dieselbe Aufgabe.
- Bei einschlaegigen Aenderungen ausdruecklich vorhandene Hintergrundanalyse, automatische Plananpassung, Fitness-Scores, Schwimmstufen und Rekorde, SOLL-/IST-Auswertung, Trainingsampel, Coach-Kontext und Benachrichtigungen, automatische Neuberechnung, Trainingshistorie und Speicherung, CTL/ATL/TSB, Trainingsvorlagen und Synchronisierung zwischen Tabs untersuchen.
- Vor Aenderungen nach Moeglichkeit den konkreten Fehler durch einen Test reproduzieren; vorhandene Tests erweitern statt parallele Testsuiten aufzubauen. Nach dem Fix erfolgreiche Regression und betroffene Nachbarfunktionen pruefen.
- Bericht bei groesseren Aenderungen: Was war vorhanden? Welcher Fehler wurde gefunden? Welche bestehende Funktion wurde verbessert? Welche Erweiterung war wirklich notwendig und warum? Welche tatsaechlich ausgefuehrten Tests bestaetigen die Korrektur?
- Oberste Prioritaet: Ursachen beseitigen, vorhandene Architektur sinnvoll nutzen und Stabilitaet verbessern; nicht moeglichst viel neuen Code erzeugen.
