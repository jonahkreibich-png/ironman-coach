# Nachtrag: Vitest-Worker-Timeouts

Jonahs lokaler Lauf meldete 2.166 bestandene Tests und zwei übersprungene Fälle, aber drei unbehandelte Fehler: Timeout calling onTaskUpdate. Der Lauf gilt deshalb nicht als vollständig bestanden. Wegen der Verkettung mit && können Build und Browserprüfungen danach ausbleiben.

## Befunde und Nachweise

- Die neue synchrone Langzeitsimulation blockierte wartende Ereignisschleifenarbeit bis zum Ende eines Verlaufs. Ein Regressionstest schlug vor der Änderung fehl und bestand nach wöchentlichen setImmediate-Pausen. Der Testhelfer und sein deterministischer Replay werden nun asynchron abgewartet.
- In auftrag14.test.ts enthielten parametrisierte Testnamen vollständige Planobjekte. Der längste Name hatte 771.385 Zeichen, nach expliziter Registrierung aus Profil-ID und Prüfzweck nur noch 172. Alle 75 fachlichen Tests bestanden weiterhin.
- Eine versuchsweise serielle Ausführung genügte nicht: 2.163 Fälle bestanden, sechs wurden übersprungen, aber zwei RPC-Timeouts blieben (683,95 s). Diese Zwischenprüfung ist kein Erfolgsnachweis. Die Beschränkung auf serielle Dateien wurde wieder entfernt.
- Zwei ältere Testgruppen (auftrag17-many und chat) liefen dabei jeweils länger als eine Minute synchron ohne Makrotask-Pause. Eine zusätzliche Zwei-Fälle-Regression belegt: Eine aus dem ersten Test wartende I/O-Aufgabe wurde ohne Korrektur vor dem zweiten Test nicht bearbeitet. Danach bestand sie.

## Endgültige Änderung

Ein gemeinsamer afterEach-Hook in tests/setup.ts wartet nach jedem Test auf native setImmediate. Die Scheduler-Referenz wird vor testseitigen Fake-Timern gesichert. Dadurch erhält die Worker-Ereignisschleife regelmäßig Gelegenheit, RPC-Bestätigungen zu bearbeiten. Der neue Hook wird über setupFiles in vitest.config.ts geladen; die ursprüngliche Parallelisierung bleibt erhalten. Innerhalb der einzelnen langen Jahresverläufe bleiben die wöchentlichen Pausen nötig.

Alle fachlichen Assertions, vorhandenen Zeitlimits und Fehlerberichte bleiben aktiv. Keine App-/Produktionsdaten geändert, keine Abhängigkeit aktualisiert. Ein gezielter Lauf aus Scheduling-Regressionen und den fünf tatsächlich mit Fake-Timern laufenden Coach-Sync-Fällen bestand: acht Fälle in drei Dateien. Typecheck ist erfolgreich.

Der vollständige Wiederholungslauf verwendet Standardreporter und JSON. Der installierte JSON-Reporter allein lässt unbehandelte Fehler in seinem Ergebnisobjekt aus; er genügt deshalb nicht für den Nachweis dieses Fehlers.

Abschließender paralleler Gesamtlauf: **2.165 Testfälle bestanden, 0 ausgeführte Fälle fehlgeschlagen, 6 übersprungen; 2.171 registrierte Fälle in 96 Dateien. Keine unbehandelten Fehler und kein onTaskUpdate-Timeout im Standardreporter. Dauer 188,24 Sekunden.** 93 Dateien bestanden, zwei sind absichtlich übersprungen. Eine API-Datei bleibt wegen des in dieser Sitzung gesperrten lokalen Serverzugriffs im Setup blockiert (vier übersprungene Fälle); Gesamtausgang deshalb weiterhin Exit 1. Dieser verbleibende Setup-Fehler ist von den behobenen Worker-Timeouts getrennt. Typecheck und Build erfolgreich. Alle 40 Langzeitverläufe und ihre drei Grenz-/Replay-Fälle bestanden erneut.

Die Zuordnung der drei ursprünglich auf Jonahs Rechner aufgetretenen Timeouts zu einzelnen Dateien war aus seinem Ausschnitt allein nicht möglich. Deshalb bleibt eine erneute Ausführung auf seinem Rechner notwendig. Der lokale Reproduktions- und Korrekturbeleg ist oben getrennt davon dokumentiert.
