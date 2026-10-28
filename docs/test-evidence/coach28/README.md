# Nachweise Coach-Auftrag 28.10.2026

Alle neuen Tests verwenden synthetische Daten. `*-red.log` dokumentiert erwartete Fehler vor der jeweiligen Korrektur. `full-unit-final.log` enthält den während des Laufs ergänzten roten Race-Test und die HTTP-Blockade; `server-all-final.log` bestätigt anschließend die korrigierten Serverpfade (214 bestanden, API-Vorbereitung blockiert). `race-green-final.log` prüft Transaktion, Ablehnung und Nachbarfunktionen (86 bestanden).

`targeted-final.log`: 632 bestanden. `browser-final.log`:107 bestanden,51 gewollte Chromium-Layout-Skips; alle51 WebKit-Layouts bestanden. `browser-original-final.log` enthält die Wiederholung nach endgültiger Übernahme. `http-probe.log`: EACCES; `standard-e2e-attempt.log`: gestarteter und angehaltener Standardversuch, kein Vollerfolg.

Die Zahlen überlappen. Source-Manifest enthält SHA256 vor/nach der Übernahme; keine echten Daten oder Zugangsschlüssel. Die vollständigen Befehle und Testnamen stehen in den Protokollen und bestehenden Testdateien.
