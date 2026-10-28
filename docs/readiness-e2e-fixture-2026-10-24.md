# Korrektur der Ampel-Browsertestdaten

## Aktueller Nachweis

Jonah bestätigt anschließend: 4 passed im gezielten Browserlauf. Damit sind die vier Ampelfälle auf beiden Browserprojekten und beiden Breiten laut seinem Ergebnis bestanden. Zusammen mit den zuvor gemeldeten 361 Erfolgen sind 365 unterschiedliche Browserfälle über zwei Läufe bestätigt; 113 waren im Gesamtlauf übersprungen. Dies ist kein neuer vollständiger gemeinsamer Browserlauf und kein eigenes Cloudflare-Deployment.

Die folgenden Abschnitte dokumentieren Ursache und frühere Zwischenstände.

Jonah meldete 361 bestandene, 113 übersprungene und vier fehlgeschlagene Browserfälle. Alle vier vorhandenen error-context.md-Berichte zeigen denselben ersten Fehler: .answer.l1 fehlt, weil die App Grün mit 96/100 anzeigt. Die Browserfälle erreichten ihre späteren Assertions deshalb noch nicht.

Ursache: Der neue Test setzte Geburtsjahr 1990, erwartete aber mit 6,5 Stunden Schlaf Gelb. Bei diesem Erwachsenenprofil benutzt die bestehende Regel einen unteren Schlafbedarf von 7 Stunden und prüft kurz als h < min(7, Bedarf - 0,5). Genau 6,5 erfüllt das strikte Kleiner-als nicht. Der ältere Unitfall ohne bekanntes Alter verwendete einen anderen Standardbedarf; sein gelber Zustand war daher kein Beleg für das Erwachsenen-Testprofil. Die App zeigte bei diesem konkreten Browsertest korrekt Grün.

Die künstlichen Browserdaten sind jetzt in fixtures/readiness24.ts mit sechs Stunden Schlaf als gelbem Ausgangszustand hinterlegt. Derselbe Fixture wird von den Browserfällen und zwei neuen Unitfällen benutzt. Diese übernehmen auch die Profilzusammenführung des Browsers. Geprüft: Fixture ist Gelb; lokaler Coach nennt Gelb; 6,5 liegt nach dieser Regel im grünen Bereich; 8,5 führt zu Grün und einer anderen Eingabeversion. Das ist ein Test vorhandener Regeln, keine medizinische Bewertung.

Die neue Erwartung Gelb scheiterte mit den bisherigen 6,5 Stunden zuerst nachweislich und bestand nach der Fixture-Korrektur. Zusammen mit den acht Ampel-Konsistenzregressionen: zehn gezielte Tests bestanden. Typecheck und Sammlung der vier Browserfälle erfolgreich. Ein eigener Browserversuch startete hier keine Fälle: lokaler HTTP-Probezugriff scheitert mit EACCES; der wartende Lauf wurde beendet. Die vier korrigierten Fälle sind deshalb noch auf Jonahs Rechner erneut auszuführen.

Befehl im Projektordner: npm.cmd run e2e -- tests/e2e/readiness24.spec.ts

Zusätzlicher vollständiger Unit-/Serverlauf nach der Fixture-Korrektur: 2.167 Fälle bestanden, kein ausgeführter Fall fehlgeschlagen, keine unbehandelten Fehler und keine Worker-Timeouts. Sechs Fälle übersprungen; die API-Datei bleibt in dieser Sitzung am lokalen Serverzugriff blockiert, Gesamtausgang Exit 1. Dauer 183,12 Sekunden. Alle 40 Langzeitverläufe bestanden erneut. Typecheck und Produktionsbuild erfolgreich. Der tatsächliche Browsernachweis der korrigierten vier Fälle bleibt offen.

Produktive Trainingsdaten und die Ampel-Bewertungsregeln wurden durch diese Korrektur nicht geändert. Frühere Fehlerberichte sind unter scratch/readiness24-errors-before gesichert, weil Playwright test-results beim nächsten Lauf neu anlegt.
