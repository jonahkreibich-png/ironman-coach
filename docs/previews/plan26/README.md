# Drei Planstudien – isolierte Funktionsvorschau

`index.html` direkt im Browser öffnen. Keine Installation und kein Server nötig. Alle Inhalte sind synthetische Beispiele, keine echten Trainingsdaten. Die produktive App wird nicht eingebunden oder geändert. Es wurde keine Variante ausgewählt oder endgültig implementiert.

| Variante | Aufbau | Stärke | Abwägung |
| --- | --- | --- | --- |
| A · Kompakter Wochenplan | Sieben kompakte Tageszeilen, Details bei Bedarf | Schnelle tägliche Planung auf Smartphones | Wochenübergreifende Zusammenhänge im Aktionsdialog |
| B · Trainingskalender | Drei Wochen als Raster, ausgewählter Tag darunter | Freie Tage und Verteilung über Wochen erkennen | Weniger Detail pro Rasterfeld, zusätzlicher Tipp zum Tag |
| C · Trainingsdashboard | Geplante Stunden, getrennte Istminuten, Sportverteilung, Wochenliste | Wochenvolumen und Verteilung zuerst beurteilen | Auf kleinen Displays mehr vertikaler Platz vor den Tagen |

Empfehlung: **A als Standard für den mobilen Plan-Tab.** Die häufigsten Aktionen beginnen an einem Tag oder an einer Einheit. Die kompakte Liste hält beide leicht erreichbar. B eignet sich als zusätzliche Kalenderansicht; C besonders für die Wochenanalyse. Die endgültige Wahl bleibt beim Nutzer.

## Tatsächlich bedienbare Abläufe

- Woche 1–12 frei wählen, Tage öffnen/schließen; Öffnungszustand bleibt pro Woche/Tag erhalten.
- Montag Woche 4: 45 Minuten verpasstes Schwimmen plus zusätzliche 30 Minuten Kraft. Mittwoch: ausgefallene 60 Minuten Schwimmen, 40 Minuten Laufen und zusätzliche 30 Minuten Rad → **70 aktive Minuten**. Ausgefallene Einheit bleibt im Detail dokumentiert.
- Geplante und nicht dokumentierte Einheiten inklusive ID, Struktur und Intensität über Wochen verschieben; einzelne Einheiten tauschen; ganze Tage tauschen. Jede Änderung mit Vorschau, Bestätigung und einem Rückgängig-Schritt. Stärke am ursprünglichen Tag bleibt beim Einzeltausch erhalten.
- Bearbeiten, zusätzliche Einheit anlegen und Ausfallenlassen aktualisieren dieselben Daten und Minuten.
- Vorlagen für alle vier Sportarten mit Suche und Filter auswählen, vollständige Beispielstruktur sehen; geplanten Inhalt ersetzen, gleichartige Struktur ergänzen oder eine neue Einheit anlegen. Erst Entwurf, danach explizites Speichern mit Bestätigung. Bestehende ID bleibt erhalten, neue Einheit erhält eine neue ID. Vorlagen und übernommene Blöcke werden tief kopiert.
- Anpassungen mit Notiz ein-/ausklappen und über Wochen-/Variantenwechsel erhalten.
- Dashboard-Werte aus derselben Liste berechnen. Abgeschlossene Einheit enthält 48 echte **synthetische** Istminuten, getrennt vom 50-minütigen Soll. Belastung/TSS ist als unbekannt ausgewiesen.

## Grenzen

Eigenständige In-Memory-Demo mit gemeinsamem Beispielmodell für A/B/C; **keine produktive Integrationsprüfung**. Die Produktionsmodule werden nicht importiert. Keine API, Datenbank, IndexedDB, Synchronisierung, Backup, Anmeldung oder Speicherung über Neuladen. Ein Neuladen setzt alles zurück. Keine Templateverwaltung (Erstellen, Löschen, eigene Bibliothek), kein vollständiger sportartspezifischer Struktur-/Intervall-Editor. Daueränderungen werden als individueller Dauerblock mit ursprünglichen Vorgaben im Text abgebildet. Beispieldauern sind ausdrücklich vorgegebene Gesamtzeiten inkl. dargestellter Pausen, keine Leistungsschätzung.

Wochen/Tagnummern sind abstrakte Beispielpositionen, keine echten Kalenderdaten. Abgeschlossene Einheiten und Tage mit Istwerten sind in den Änderungsabläufen geschützt; das demonstriert eine konservative Variante, keine endgültige Produktentscheidung. Verpasste Einheiten werden nach Verschieben wieder geplant, niemals abgeschlossen. Der ursprüngliche Ort bleibt im Undo-Snapshot; an der Einheit wird ein Verschiebehinweis geführt. Kein produktionsreifes Auditprotokoll.

Bedienung auf Touch erfolgt bewusst über gut erreichbare Aktionsdialoge; kein Drag-and-drop. Warnung bei mehreren intensiven Einheiten am Ziel eines Einzelverschiebens/-tausches; keine umfassende Trainingsverträglichkeitsbewertung. Ganze Tage tauschen vollständig, inklusive dokumentiert ausgefallener Einheiten. Rückgängig umfasst einen Schritt. Keine Kopier-/Duplizieraktion, daher keine irreführende Gleichsetzung mit Verschieben.

## Prüfung

`node docs/previews/plan26/verify.mjs` aus dem isolierten Projektordner. Verwendet das bereits installierte Playwright ohne zusätzliche Abhängigkeit und liefert HTML per Browser-Routenabfang statt über einen Netzwerkserver. Browserpfade im Skript sind auf diese Windows-Testumgebung abgestimmt, sonst gelten Playwright-Standardpfade.

Die Screenshots unter `screenshots/` zeigen alle Varianten in Chromium und WebKit bei 390 × 844 Pixeln sowie B bei 1440 × 1000. Die Prüfung klickt echte Dialoge/Buttons und prüft zusätzlich konkrete Modellwerte; sie ist kein reiner Render-Smoke-Test. Im ersten Lauf wurde ein asynchrones Toggle-/Rerender-Problem beim Offenhalten der Anpassungen erkannt und mit synchronen Summary-Handlern behoben. Der nachfolgende Lauf ist im Abschlussbericht quantifiziert.

Abgeschlossener finaler Browserlauf: **Chromium + WebKit erfolgreich, 556 konkrete Assertions, 72 Vorlagenabläufe** (3 Varianten × 4 Sportarten × Ersetzen/Ergänzen/Neu × 2 Browser). Zusätzlich je Variante/Browser: Vorschau ohne Mutation, Einzelverschieben über Wochen, Rückgängig, Einzeltausch, Tagestausch, Ausfall mit Minutenupdate, Bearbeitung, Filter/Suche, Abbrechen, Notizerhalt und 20 schnelle Wochenwechsel. Kein horizontaler Überlauf bei geprüften 390-px- und 1440-px-Ansichten; keine erfassten JavaScript-Seitenfehler. Firefox, echtes iOS und Langzeit-Persistenz sind in dieser isolierten Vorschau nicht geprüft.
