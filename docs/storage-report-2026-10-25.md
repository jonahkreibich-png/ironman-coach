# Speicherfehler und Trainingsverschiebung – 25.10.2026

Stand: Version 3.7.2 lokal vorbereitet. Kein neuer Upload, keine Produktionsmigration und keine Aenderung echter Trainingsdaten in diesem Auftrag. Bestehende Aenderungen aus dem vorigen Auftrag bleiben erhalten.

## Was nachgewiesen ist

Die Warnung entstand bisher beim fehlgeschlagenen Schreiben des gesamten Zustands in LocalStorage. Die App arbeitete danach mit der Kopie im RAM weiter. Unsicher: Welche konkrete Browserfehlermeldung auf Jonahs Geraet den Schreibfehler ausloest, ist ohne dessen Laufzeitdiagnose nicht bekannt. Es gibt keine Behauptung, bereits verschwundene Werte seien wiederhergestellt.

| Fehler | Ursache und Aenderung |
|---|---|
| Werte verschwinden nach Neustart | Fehlgeschlagene Writes wurden verschluckt; Eingaben waren teilweise nur im RAM. Neuer zentraler Speicher bestaetigt IndexedDB-Transaktionen und zeigt ausstehende/fehlgeschlagene Writes dauerhaft an. |
| Leere Daten nach Lesefehler | loadState lieferte Defaults und Startbereinigungen konnten diese ueber vorhandene Daten schreiben. Nicht lesbare oder strukturell defekte Daten sperren Speichern und Sync. |
| Noch fokussierte Eingabe geht verloren | Nur change/Blur uebernahm den Text. Gueltige Trainingswerte werden jetzt schon bei input gespeichert, ohne den Fokus zu verlieren; ein echter Browser-RED/GREEN-Test prueft Speichern vor dem ersten Blur. |
| Aenderung kurz vor Schliessen | saveSoon wartete 350 ms. Eingaben stossen jetzt sofort den Schreibvorgang an. Offene Transaktionen warnen beim Verlassen; PWA-Updates warten auf Bestaetigung. |
| Tabs ueberschreiben Einheiten | Vollstaendige Snapshots wurden ungeschuetzt ersetzt. Drei-Wege-Abgleich innerhalb atomarer IDB-Transaktionen behaelt getrennte Aenderungen; echte Feldkonflikte bleiben zusaetzlich im persoenlichen Backup erhalten. Andere Tabs aktualisieren Zustand und Plan. |
| Alter Ausgang ersetzt neuere Daten | Outbox-Replay war nicht gegen neueren bestaetigten STATE abgesichert. Lokale Speicherrevisionen und Konfliktkopien verhindern blindes Ersetzen. |
| Sync meldet zu frueh Erfolg | Cursor und Ausgang wurden vor lokalem Commit quittiert. Jetzt werden Antwortformat, Daten- und Metadatenspeicherung bestaetigt. API-Fehler behalten den Ausgang; 401 verwirft keine offenen Aenderungen. Leere neue Geraete laden zuerst, statt Defaults mit aktuellem Datum hochzuladen. |
| Backup scheitert oder ersetzt Daten teilweise | Strengere Struktur-/Versionspruefung; Zustand, Plan, Ausgang und vorheriger Stand werden zusammen committed. Fehlgeschlagener Import laesst den alten Stand unangetastet. Kopiertext bleibt bei gescheitertem Teilen/Download erreichbar. |
| Alte Serverantwort nach Import/Abmelden | Laufende Antworten werden ueber eine Generation entwertet. Lokale Loeschungen beim Abmelden/Nutzerwechsel werden abgewartet. Unerwartete Kontozuordnungen loeschen oder laden keine fremden lokalen Daten hoch. |
| Mehrfaches Verschieben bei gleicher Uhr | Gleiche createdAt-Zeiten wurden ueber zufaellige IDs sortiert, sodass eine alte Verschiebung zuletzt wirkte. Neue Benutzer-/Chataktionen erhalten monotone Zeitstempel. Beide Browser pruefen mehrere Verschiebungen inklusive alter Tagesbeschreibung und Neustart. |
| Beschreibung am falschen Tag | Explizites Session-Datum blieb beim Move alt; Zwischenstationen hinterliessen Tagesverweise. Datum folgt der Einheit; Tagesverweise werden aus dem Endstand abgeleitet und beim Entfernen bereinigt. Trainingsaufbau und Beschreibung bleiben an derselben ID. |
| Alter Coach-Vorschlag aendert absolvierte Einheit | Bearbeitungs-/Chataktionen und Toolaufrufe sind geschuetzt. Zusaetzlich wird bei spaeterer Vorschlagsbestaetigung lokal und auf dem Server erneut geprueft, ob die Einheit inzwischen absolviert ist. |

## Speicherarchitektur

STATE bleibt der gemeinsame Behaelter im RAM. Vor App-Start wird der dauerhafte Speicher gelesen. Der zentrale Adapter behaelt die vorhandenen Schluessel bei: ec_state_v2, ec_plan, ec_sync, ec_sync_auth und ec_owner. IndexedDB speichert Zustandstransaktionen atomar; LocalStorage bleibt fuer Kompatibilitaet und kleinere Werte lesbar. Ein LocalStorage-Quota-Fehler verhindert einen bestaetigten IDB-Write nicht. Scheitert auch IDB, wird kein Speichern bestaetigt.

Authentifizierung erfolgt mit einem Geraetetoken im Authorization-Header; Cookies sind fuer diesen Datenweg nicht vorgesehen. Angemeldete Nutzer synchronisieren ueber /api/sync in nutzergetrennte Cloudflare-D1-Records. Der bestehende Serverabgleich nutzt Zeitstempel pro Datensatz; die lokale Warteschlange bleibt bei Netzwerkfehlern erhalten. Ein globaler Hinweis zeigt offene/fehlgeschlagene Uebertragungen in allen Ansichten.

Keine SQL-Schemaaenderung und keine massenhafte Datenbereinigung. Der erste bestaetigte IDB-Schreibvorgang uebernimmt den vorhandenen Browserstand. Bei fehlerhaftem Lesen wird dieser Schritt gesperrt.

## Backup und Wiederherstellung

Persoenliches JSON-Format, weiter backupVersion 2; alte Formate ohne Versionsangabe sowie Version 1 bleiben bei gueltiger Struktur lesbar. Der Export umfasst den persoenlichen STATE mit Plan, Messwerten, Einstellungen, Vorlagen, Coach-Nachrichten, Anpassungen und gegebenenfalls Konfliktkopien. Anmeldungstoken werden nicht exportiert.

Importe pruefen Datentypen, Planstruktur, eindeutige Session-IDs, bekannte Formatversionen und gefaehrliche Objektschluessel. Die vorhandene Bestaetigung vor einem Ersatz bleibt bestehen. Unter Daten gibt es den Stand vor der letzten Wiederherstellung als Rueckfallmoeglichkeit. Ein gestarteter Download wird nicht als nachweislich gespeicherte Datei ausgegeben; Browser koennen den finalen Dateiablageerfolg nicht verlaesslich melden.

## Tatsaechliche Pruefungen

Die exakten Laufresultate stehen zusaetzlich in storage-test-results-2026-10-25.json. Der Gesamtlauf hat 2.219 bestandene Faelle und sechs uebersprungene Faelle; eine HTTP-Suite scheitert bereits am lokalen Server-Setup. Nach den letzten Ergaenzungen wurden 120 gezielte Unit-/Worker-Tests erneut erfolgreich ausgefuehrt. Typpruefung und Produktionsbuild sind erfolgreich; die bekannte Chunkgroessen-Warnung bleibt.

- RED/GREEN-Reproduktionen fuer Schreib-/Lesefehler, beschaedigten JSON-Stand, verschobene und entfernte Einheiten, Outbox-Neustart, ungueltige API-Antwort, Importfehler und atomare Tab-Schreibvorgaenge.
- Echte Export-/Import-Funktionen gegen synthetischen isolierten Speicher getestet; alle persoenlichen Felder verglichen, alte Werte im Rueckfallbackup geprueft. Auch Download-/Teilen-Ausfall mit Kopiertext getestet.
- SQLite-Testdatenbank mit absichtlich abbrechendem SQL-Trigger: /api/sync liefert Fehler und behaelt alte Werte; nach Retry kommen die neuen Werte an. Keine externe Datenbank benutzt.
- Vier synthetische Nutzer mit jeweils 180 Tagen: 2.160 Speichern/Korrigieren/Verschieben-Aktionen und 2.160 Neustarts, Konsistenz nach jeder Aktion geprueft. Dazu die bestehenden Mehrwochen-/Monatssimulationen im Gesamtlauf.
- 16 neue Browserfaelle (acht Szenarien in Chromium und WebKit), einschliesslich neuer Sitzung, Quota, Doppelfehler, Datei-Restore, mehrfacher Verschiebung, Netzwerkfehler, zwei Tabs und Speichern ohne Blur. Zusaetzlich zwoelf vorhandene Browserfaelle fuer Belastungswerte, Kraftvorlagen und Ampel/Korrekturen. Letzter gemeinsamer Lauf: 28 bestanden, keine fehlgeschlagen.
- Der normale HTTP-Teststart ist hier durch EACCES blockiert. Deshalb gibt es einen zusaetzlichen Transport ohne TCP-Port: gebaute Originaldateien und der echte Worker werden mit isoliertem SQLite-D1 direkt an Chromium/WebKit ausgeliefert. Keine Produktionsverbindung und keine gekuerzten App-Funktionen.
- Chromium bricht in dieser eingeschraenkten Umgebung selbst einen unabhaengigen JSON-Blob-Minimaldownload mit canceled ab. Fuer die zwei Chromium-Exportszenarien erfasst ein Testadapter deshalb die tatsaechlich erzeugte File-Datei an der Web-Share-Grenze. WebKit prueft den nativen Dateidownload samt Dateiimport. Die rohe Chrome-Dateiablage ist damit hier ausdruecklich NICHT bestaetigt.
- Wiederholbar: npm.cmd run e2e:storage (vorher npm.cmd run build). Normales npm.cmd run e2e behaelt den HTTP-Testserver und den nativen Downloadweg; die Erfassung des Teilen-Menues gilt ausschliesslich fuer den isolierten Chromium-Testmodus.

## Offene Grenze vor einer Veroeffentlichung

Der vollstaendige normale HTTP-/Browser-Testlauf muss ausserhalb dieser gesperrten Sitzung erfolgreich laufen. Die direkt ausgefuehrten Browserfaelle ersetzen keine Pruefung der echten Cloudflare-Testumgebung oder der rohen Chrome-Dateiablage. Es gibt keinen Nachweis einer erfolgreichen Ausfuehrung auf Jonahs echtem iPhone oder einer erfolgreichen Wiederherstellung seiner persoenlich verschwundenen Werte. Die Codepruefung und synthetischen Tests ersetzen diese Nachweise nicht.

Danach zuerst die bestehende Testumgebung pruefen. Produktion erst nach Jonahs neuer Zustimmung und vorheriger Datenbanksicherung. Bis dahin keine Browserdaten oder bestehenden Sicherungen loeschen und das alte Veroeffentlichungsskript nicht starten.

## Nachpruefung der zehn gemeldeten E2E-Fehler

Jonahs normaler Gesamtlauf meldete 371 bestandene, 113 uebersprungene und zehn fehlgeschlagene Browserfaelle. Die vorhandenen error-context.md-Dateien wurden ausgewertet.

- Kontowechsel: In vier Einrichtungs-/Wiederherstellungswegen und beim Betreiber-Reset fehlte await vor der inzwischen asynchronen Speicherbereinigung. Bereinigung wird jetzt abgeschlossen, bevor Authentifizierung, Ausgang oder Navigation weitermachen. Der Einladungstest prueft weiterhin, dass keine fremden Trainingsdaten auf dem neuen Konto ankommen und Abmelden den Token ungueltig macht.
- Wochenraster: Vergleich lief teilweise vor der Startspeicherung. Das automatisch aus dem alten Plan uebernommene Wettkampfziel erschien deshalb erst im Nachher-Snapshot. Jetzt wartet der Snapshot auf den Commit; Regeln, Ziele, Plan und Anpassungen werden weiterhin unveraendert verglichen.
- Eigene Speicherbestaetigungen: Der allgemeine IDB-Schreibpfad sendete eine Nachricht ohne Tab-Kennung. Daraus konnte eine Render-/Speicherschleife entstehen. Der neue Test scheiterte vorher in beiden Browsern, in Chromium mit 75 Neuaufbauten innerhalb 500 ms. Tab-Kennung und Beschraenkung auf Daten-/Plan-Commits verhindern die Rueckkopplung.
- Verbindungen: Fehlgeschlagene Abrufe liessen den Cache leer; Render startete sofort erneut einen Abruf und dessen Abschluss renderte wieder. Neuer Test scheiterte vorher in beiden Browsern, in WebKit mit 35 Abrufen innerhalb 500 ms. Fehler werden jetzt angezeigt, automatische Wiederholungen gestoppt und ein expliziter erneuter Versuch angeboten, auch im Fragebogen.

Die gemeldeten zehn Faelle plus zwei Gegenproben bestanden anschliessend: 12 bestanden, sechs projektbedingt uebersprungen, kein Fehler (isolierter Browsertransport, 1,5 Minuten). Reproduzierbarer gezielter Lauf: node node_modules/@playwright/test/cli.js test --config playwright.regression.config.ts. Die Grenzen des isolierten Transports und des nativen Chromium-Downloads gelten weiterhin. Produktion und echte Daten unveraendert.

Weitere abschliessende Pruefung: 32 Speicher-/Backup-/Verschiebe- und verwandte Browserfaelle bestanden (1,8 Minuten), einschliesslich beider neuer Schleifen-Regressionen in beiden Engines. Zusammen 44 bestandene Browserfaelle ohne Fehler. Gezielte Unitpruefung: 30 Tests in vier Dateien bestanden. Typecheck, Vite-Build und git diff --check erfolgreich; bekannte Chunk-Groessenwarnung bleibt.

Vollstaendige Unit-/Worker-Pruefung nach den Nachbesserungen erneut ausgefuehrt: 2.219 Testfaelle bestanden, sechs uebersprungen, kein fehlgeschlagener einzelner Testfall. Das Gesamtkommando bleibt Exit 1: server/test/api.test.ts kann den lokalen HTTP-Mock unter 127.0.0.1:8799 in dieser Sitzung nicht erreichen. Laufzeit 225,22 Sekunden; kein vollstaendiges Gruen behauptet.

## Veroeffentlichungsfreigabe und technischer Halt

Jonah meldete danach 385 bestandene und 113 uebersprungene Browserfaelle; test-results/.last-run.json bestaetigt den erfolgreichen letzten Lauf. Anschliessend erteilte er ausdruecklich die Freigabe zur Veroeffentlichung. Direkter Testsicherungsversuch mit Wrangler scheitert an abgelaufenem OAuth-Token und nicht erreichbarem Auth-Server. Alternativer Test-DB-Export ueber den Cloudflare-Connector abgeschlossen; Download scheitert lokal an ENOTFOUND. Ohne validierte Sicherung kein Test-/Produktionsupload. Cloudflare bestaetigt weiterhin das vorherige Produktionsdeployment 667f40aa-d199-45bf-bb0e-c7da4d27b923 vom 24.10.2026. Der bestehende Releasehelfer wurde mit --plan geprueft und zur Ausfuehrung in normaler PowerShell bereitgestellt. Es fehlt keine Nutzerzustimmung, sondern eine funktionierende Netzwerkverbindung aus der Ausfuehrungsumgebung.

## Einzelner WebKit-Startfehler beim Freigabelauf

Neuer normaler Lauf: 384 bestanden, 113 uebersprungen, n21-run-10k in auftrag15-many.spec.ts fehlgeschlagen. #app blieb innerhalb der 5-Sekunden-Pruefung leer. Der urspruengliche Fehler enthaelt weder die aktuelle Ansicht noch eine JavaScript-Ausnahme oder fehlgeschlagene Ressource. Unsicher: Die genaue Ursache dieses einzelnen Auftretens ist nicht nachgewiesen. Vor Aenderungen bestand derselbe Nutzerfall sechs isolierte Wiederholungen.

Bestaetigtes Problem: Der Speicher darf beim Oeffnen bis zu zehn Sekunden benoetigen; die alte Inhaltspruefung scheiterte nach fuenf Sekunden. App-Start bekommt deshalb einen ausdruecklichen loading/ready/error-Zustand; ready erst nach Speicherlesen und abgeschlossenem ersten Rendern. Ladetext liegt ausserhalb von #app, damit vorhandene Inhaltspruefungen nicht voreilig bestehen. Lese- und Modul-/Renderfehler werden sichtbar behandelt. Bei Lesefehlern startet main weiterhin nicht: keine leeren Defaults und keine Ueberschreibung.

Der betroffene Test wartet bis zu 15 Sekunden auf ready, prueft danach unveraendert Inhalte, Layout, Ampel und Sportarten. Bei erneutem Fehler speichert er Ansicht, Startphase, JavaScript-Fehler und gescheiterte Ressourcen. Kein Wiederholungsmechanismus, keine gelockerten Daten-/Layoutpruefungen. Eine neue Regression verzoegert IndexedDB-Erfolg um sechs Sekunden; vorher fehlgeschlagen, danach in beiden Engines erfolgreich.

Nachpruefung: 16 Unit-Tests in vier Dateien bestanden; 34 Speicher-/verwandte Browserfaelle und alle 15 vorgesehenen WebKit-Testnutzer bestanden (45 weiterhin vorgesehene Auslassungen). Typecheck und Build erfolgreich. Browsertransport isoliert wie oben; vollstaendiger normaler HTTP-Freigabelauf weiterhin erforderlich. Keine Veroeffentlichung, Freigabe bleibt gueltig. Exakte Ergebnisse: docs/startup-qa-2026-10-25.json.

## Abschluss: Version 3.7.2 veroeffentlicht

Jonah meldete den erfolgreichen Abschluss des Releasehelfers einschliesslich Live-Pruefung. Cloudflare bestaetigt den Testdeploy f5396d83-919a-4673-94c3-7a87fa83b379 und Produktionsdeploy e201c835-7591-41a9-946e-5640ec9fa2c6 als success. Der letzte lokale Browserlauf ist passed; genaue abschliessende Testzahlen wurden nicht mitgeteilt. Beide vorhandenen SQL-Sicherungen fuer 3.7.2 wurden unabhaengig erneut lokal in SQLite eingelesen und auf Integritaet geprueft. Produktionssicherung: 21.030.366 Bytes; Testsicherung: 19.478.167 Bytes. SHA256 und vollstaendige Nachweise in docs/release-3.7.2-status.json. Die Hash-/Health-Livepruefung ist durch den gemeldeten erfolgreichen Skriptabschluss belegt; eine unabhaengige Live-Inhaltsabfrage aus dieser Sitzung ist weiterhin nicht moeglich. Keine weiteren Veroeffentlichungsschritte offen.
