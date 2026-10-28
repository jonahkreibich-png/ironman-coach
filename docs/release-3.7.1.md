# Veröffentlichung 3.7.1 – veröffentlicht und geprüft

## Abschluss

Version 3.7.1 ist veröffentlicht. Jonah hat den erfolgreichen Abschluss des Veröffentlichungsprogramms einschließlich der Live-Prüfung gemeldet. Die Cloudflare-API bestätigt erfolgreiche neue Deployments: Test c70b9d7b-7a44-4ef8-b744-2df6c3599000 und Produktion 667f40aa-d199-45bf-bb0e-c7da4d27b923. Die beiden lokalen SQL-Sicherungen sind vorhanden und wurden zusätzlich erneut in einer In-Memory-Datenbank erfolgreich eingelesen. Exakte Fallzahlen des vollständigen abschließenden Laufs wurden nicht mitgeteilt; die früheren lokalen Diagnosezahlen werden nicht als dessen Ergebnis ausgegeben.

Live: https://coach-app-efc7.pages.dev

Die folgenden Abschnitte dokumentieren die ursprüngliche Vorbereitung und damalige Sitzungssperren.

Jonah hat die Veröffentlichung angefragt. Das ist die Freigabe für diesen Update-Ablauf; eine weitere Bestätigung wird nicht verlangt.

## Aktueller Status

Version und kurze Änderungshinweise sind auf 3.7.1 vorbereitet. Typecheck, Test-Frontend-Build, Produktions-Frontend-Build und Wrangler-Trockenlauf des neuen Workers waren erfolgreich. Der tatsächliche Start des Veröffentlichungsprogramms wurde geprüft: 2.182 Testfälle bestanden, sechs übersprungen, keine unbehandelten Fehler/Worker-Timeouts. Die API-Datei scheiterte im Setup am gesperrten lokalen HTTP-Zugriff; der Ablauf hielt mit Exit 1 vor Sicherung und Deployment an. Die 15 neuen Veröffentlichungsregressionen bestanden im selben Lauf.

Cloudflare-Connector: Konto und beide bestehenden Projekte sind erreichbar. Beide Datenbanken enthalten alle sechs lokalen Migrationen; keine neue Migration nötig. Die ursprünglich in scripts/release.md beschriebene Erstanlage/Umstellung ist bereits erfolgt und wird für dieses Update nicht wiederholt. Bestehende Datenbanken, Konten, Schlüssel und Service-Bindungen werden weiterverwendet.

Aus der Sitzung nicht abschließbar: lokale Wrangler-Anmeldung kann ihren OAuth-Token wegen unerreichbarem Auth-Server nicht erneuern. Ein Test-D1-Export konnte über Cloudflare erzeugt werden, sein SQL-Download war lokal nicht auflösbar und im Connector nicht erlaubt. Auch die App-Adressen sind für die hiesige Live-Prüfung nicht zugänglich. Deshalb ist keine ausreichende lokale Produktionssicherung erstellt und kein neuer App-/Worker-Code hochgeladen worden. Keine neue Test- oder Produktionsveröffentlichung.

Kontrollierte vorhandene Pages-Deployments vor dem Versuch:
- Test: 79c7cf59-b714-4c23-bfde-8523fb71f47d, 2026-10-24T13:09:55Z.
- Produktion: f02d8fc3-854f-4acf-9a8d-3d413af3b584, 2026-10-24T13:10:44Z.
Beide IDs waren bei der erneuten Cloudflare-Abfrage unverändert.

## Ein Startbefehl auf Jonahs Rechner

node "C:\Users\Anwender\Downloads\ironman-coach-app\ironman-coach\scripts\veroeffentlichen.mjs"

Der Aufruf funktioniert auch außerhalb des Projektordners. Der Ablauf:
1. Vollständige vorhandene Tests inklusive Typecheck, Build und Browserprüfungen.
2. Testdatenbank lokal exportieren und den SQL-Export in einer In-Memory-SQLite-Datenbank probeweise einlesen (users/records vorhanden, integrity_check=ok).
3. Vorhandenen Test-Worker und Test-Pages-Projekt aktualisieren; Health-Umgebung sowie ausgeliefertes JavaScript und Service Worker gegen den lokalen Build prüfen.
4. Produktionsdatenbank in eine neue lokale Datei exportieren und genauso prüfen.
5. Bestehenden Produktions-Worker und Pages-Projekt aktualisieren; dieselben Live-Prüfungen durchführen.

Sicherungen werden unter data-export im Projektordner mit eindeutigen Namen gespeichert; dieser Pfad ist von Git ausgeschlossen. Der Ablauf bleibt bei jedem Fehler stehen. Erfolg wird erst nach der letzten Prüfung als „Veröffentlicht und geprüft“ ausgegeben. Wie im bisherigen Deployskript werden Worker und Pages nacheinander aktualisiert; ein Fehler während des Deployments kann daher eine teilweise Aktualisierung hinterlassen. Es wird kein automatischer Rollback oder automatische Wiederherstellung echter Nutzerdaten behauptet.

Keine Tests werden ausgeblendet und kein übersprungenes Testtor angeboten. --plan und --help führen keine Veröffentlichung aus; unbekannte Optionen werden abgewiesen. Die Tests prüfen Reihenfolge, Abbruch vor Produktion bei fehlgeschlagenen Tests/Testdeploys/Sicherungen, Wiederherstellbarkeit künstlicher Exporte, falsche Umgebung, veraltete Dateien und harmlose CLI-Optionen. Die App-Adressen und Sicherungsdownloads müssen nach dem Start auf Jonahs Rechner tatsächlich erreichbar sein.
