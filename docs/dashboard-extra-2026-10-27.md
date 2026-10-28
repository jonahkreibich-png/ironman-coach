# Dashboard und Extraeinheiten – 27.10.2026

Jonah hat die folgenden Anpassungen und anschliessende Veroeffentlichung beauftragt.

## Aenderungen

- Trainingsdashboard auf-/zuklappbar, Zustand bleibt nach Neuladen erhalten.
- Tageszeile mit kryptischem Istwert entfernt. Dashboard erklaert fehlende Zeiten ausgeschrieben; vorhandene Werte bleiben erhalten.
- Extraeinheiten verwenden sofort dieselben sportartspezifischen Eingabefelder wie bestehende Einheiten: unter anderem Dauer, Distanz, Puls, Belastung, Gefuehl, Notizen und Kraftuebungen.
- Schwimmen verwendet Meter, Kraft keine Kilometer. Sportwechsel verwahrt Entwuerfe getrennt; Abbrechen speichert keine Einheit.
- Speichern wartet auf bestaetigte dauerhafte Speicherung. Fehlversuche lassen das Formular offen, Wiederholen verwendet dieselbe ID.
- Waehrend des Speicherns sind die Formularfelder gesperrt. Der Abschluss eines alten Formulars schliesst keinen zwischenzeitlich neu geoeffneten Entwurf.

## Gefundener Speicherfehler

Eine fehlgeschlagene neue Speicherung wurde beim unveraenderten Wiederholen bereits als Ausgangsstand behandelt. Gegen den aelteren dauerhaften Stand konnte der Drei-Wege-Abgleich den neuen Eintrag als entfernten Eintrag interpretieren. Reproduziert in beiden Browsern und als Unit-Regression.

DurableStorage merkt sich jetzt den Ausgangsstand fehlgeschlagener atomarer Abgleiche bis zum erfolgreichen Commit. Wartende Wiederholungen verwenden ihn bei ihrer Ausfuehrung; erfolgreiche Writes und explizite Wiederherstellungen entfernen ihn. Fremde Tabaenderungen werden weiterhin abgeglichen, echte Konflikte bleiben im privaten Backup erhalten. Keine Migration.

## Nachweise

- Zwei initiale Browser-RED-Faelle fuer Dashboard und direkte Werte.
- Danach 26 gezielte Chromium-/WebKit-Faelle bestanden, inklusive verzogertem Commit und fehlgeschlagenem Speichern mit Wiederholung.
- 26 Dashboard-/Zusammenfassungs-/Veroeffentlichungs-Unitpruefungen bestanden.
- Speicherregression: vor Korrektur 1 fehlgeschlagen, danach 9 bestanden; unabhaengig erneut bestaetigt.
- Typecheck und Build bestanden.
- Unabhaengiges Review: kein verbleibender konkreter P1/P2-Befund.
- Weitere Speicher-/Backup-/Readiness-/Kraftpruefungen: 34 bestanden.
- Plan-/Vorlagenpruefungen: 51 bestanden (Chromium Desktop/Mobil, WebKit Mobil).
- Vollstaendiger Unit-/Serverlauf: 2301 bestanden, 6 uebersprungen; 111 Testdateien bestanden, eine API-Suite scheitert bereits vor ihren vier Tests am lokalen HTTP-Zugriff auf 127.0.0.1:8799. Laufzeit 644,15 Sekunden.
- Regulaerer Browserlauf beim Start des lokalen Servers haengengeblieben und kontrolliert angehalten; keine Behauptung eines gruenen regulaeren E2E-Gesamtlaufs.
- Releasehelfer deshalb mit Exit 1 vor Backup oder Deployment angehalten. Keine Produktionsdaten oder Onlineversion geaendert.

Veroeffentlichung erst nach erfolgreichem vollstaendigem Freigabeablauf. Eine aktuelle Minimalprobe lokaler HTTP-Verbindungen scheitert in dieser Sitzung mit EACCES. Isolierte Browserpruefungen umgehen ausschliesslich den TCP-Transport, nicht App-Logik, IndexedDB oder Worker.

Protokolle: scratch/extra27/ (red.log, retry-red.log, retry-green.log, final2.log, unit.log, storage.log, plan.log, release.log).

## Verbleibender Schritt

Jonahs Produktionsfreigabe liegt vor. In normaler Windows PowerShell `node "C:\Users\Anwender\Downloads\ironman-coach-app\ironman-coach\scripts\veroeffentlichen.mjs"` ausfuehren. Der bestehende Helfer prueft alle Standardtests erneut, validiert die Testsicherung, veroeffentlicht und prueft die Testseite und fuehrt danach gepruefte Produktionssicherung und Produktionsveroeffentlichung aus. Jeder Fehler stoppt die spaeteren Schritte.
