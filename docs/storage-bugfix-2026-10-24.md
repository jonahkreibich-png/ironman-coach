# Datenverlust, Backup und Trainingsverschiebung – Arbeitsplan

Ziel: Bestaetigte Daten behalten, Fehler sichtbar machen, keine echten Nutzerdaten aendern.

Architektur bisher: STATE im Arbeitsspeicher; ec_state_v2 und ec_plan im LocalStorage. ec_sync enthaelt Hashes, Ausgang und Servercursor, ec_sync_auth den Geraetetoken. Kein IndexedDB-Datenspeicher; Cookies sind fuer diese API-Anmeldung nicht erforderlich. /api/sync schreibt nutzergetrennte D1-Datensaetze mit Zeitstempelkonflikten. Tagesbackups liegen separat auf dem Server.

Nachgewiesene Risiken im Code: saveState meldet Schreibfehler nur einmal und liefert keinen Erfolg; saveSoon wartet 350 ms. loadState verschluckt Lese-/JSON-Fehler und Startbereinigungen speichern danach Defaults. Sync quittiert Ausgang und Cursor vor bestaetigter lokaler Speicherung. Backup ersetzt STATE vor erfolgreichem Schreiben, und Aufrufer melden auch nach Fehlschlag Erfolg. Mehrere Tabs halten voneinander unabhaengige Vollkopien.

- [x] Speicherfehler mit isolierten Tests reproduzieren: Quota, Lesefehler, Neustart, Tabs, Metadaten.
- [x] Bestehende Schluessel behalten; bestaetigten IndexedDB-Ausweichspeicher vor App-Start laden. Lesefehler blockieren automatische Schreib-/Loeschvorgaenge. Speichern sofort anstossen; Status bis zur Bestaetigung anzeigen.
- [x] Sync-Ausgang bei Neustart wiederherstellen; Cursor erst nach lokaler Bestaetigung; API-Fehler und ungueltige Antworten nicht quittieren. Tabs ohne Vollkopie-Ueberschreiben zusammenfuehren.
- [x] Backup streng validieren, vorherigen Stand als lokale Wiederherstellungskopie sichern, Zustand und Plan gemeinsam schreiben; Export/Import und Fehler testen.
- [x] Verschiebung von ID, Beschreibung, Aufbau, Datum und Tagesanzeige reproduzieren; erledigte Einheiten schuetzen; mehrfaches Verschieben/Loeschen/Austauschen pruefen.
- [x] Mehrmonatige synthetische Simulation, betroffene Tests und komplette vorgeschriebene Pruefungen ausfuehren. Tatsachliche Ergebnisse und Grenzen dokumentieren.

Keine Produktion, keine SQL-Migration, keine Loeschung vorhandener Nutzer-/Backupdaten. Neue Freigabe fuer riskante Produktionsaenderungen erforderlich. Implementierung direkt in dieser Sitzung; bestehende uncommittete Aenderungen bleiben erhalten.

Abschlussstand am 25.10.: Bericht in docs/storage-report-2026-10-25.md. Normale HTTP-Gesamtpruefung bleibt durch die Sitzung blockiert; keine Veroeffentlichung. Zusaetzliche direkte Browserpruefungen und ihre Grenzen sind im Bericht genannt.
