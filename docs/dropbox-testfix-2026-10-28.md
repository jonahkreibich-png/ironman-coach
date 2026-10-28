# Dropbox-Testabschluss korrigiert – 28.10.2026

Der vollständige externe Standardlauf endete mit 448 bestandenen, 113 übersprungenen und einem fehlgeschlagenen Browserfall. Der lokal vorhandene Fehlerkontext meldet in auftrag13.spec.ts: apiResponse.json: Response has been disposed.

Untersucht: bestehender Test, Verbindungsanzeige, conn-sync/busy/loadConnections, Testtransport und Fehlerprotokoll. Der Test wartete nur auf syncCalls=1; dieser Zähler wird vor dem Abschluss von fulfill erhöht. Die App lädt danach im finally ihren Verbindungsstatus neu. Der asynchrone route.fetch/json-Handler konnte deshalb noch laufen, während Playwright die Testressourcen bereits freigab.

Reparatur nur im bestehenden Test: echten Kontostatus vor der Fehler-Injektion vollständig lesen; im Handler nur noch den kontrollierten Fehlerzustand ausliefern. Nach „Jetzt abrufen“ HTTP404 und die erst nach dem Status-Neuladen sichtbare Fehlermeldung abwarten. Im finally laufende Handler mit unrouteAll({behavior:'wait'}) abschließen. Keine Fehlerunterdrückung, zusätzlichen Retries oder längeren Timeouts. Sämtliche 20 bisherigen Assertion-Zeilen erhalten; zusätzliche Prüfungen für echten Anfangsstatus und abgeschlossenen Fehlerablauf. Produktcode und Datenhaltung unverändert.

Prüfung: Dropbox-Fall zehnmal nacheinander bestanden. Anschließend gesamte vorhandene Datei: 3 bestanden,1 bestehender WebKit-Serverfall unverändert übersprungen; Trends in beiden Browsern bestanden. Typecheck und Build bestanden (bestehende Bundlegrößenwarnung). Ausführung mit vorhandenem In-Process-Transport, gebauter App, echtem Worker und ausschließlich synthetischem SQLite-D1. Das ersetzt keinen vollständigen regulären HTTP-Gesamtlauf; der Testhelfer behält alle Gates. Keine Veröffentlichung. Nachweise: docs/test-evidence/dropbox28/.

Offizielle API-Dokumentation geprüft: https://playwright.dev/docs/api/class-page#page-unroute-all – behavior wait wartet auf bereits laufende Handler.
