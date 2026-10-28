# Coach und Hintergrundanalyse – Bericht vom 28.10.2026

Auftrag: `Eingefügter Text(5).txt`. Umsetzung in einer isolierten Quellkopie mit synthetischen Daten; keine produktiven Konten, Datenbanken oder Deployments verändert. Die vorhandene Architektur wurde zuerst untersucht. Änderungen werden nach Hashvergleich in das Projekt übernommen; bestehende offene Arbeit bleibt erhalten.

## Vorhandene Architektur und Datenfluss

Die App besitzt bereits strukturierte Ergebnisse, lokale dauerhafte Speicherung und Synchronisierung, importierte Aktivitäten, ein Ergebnisjournal und gemeinsame deterministische Berechnungen. `actualMetrics`, `fieldsOf`, `effectiveActivity` und `swimProofs` bilden die Ergebnisbasis. `doneItems`, `valsOf`, `reviewOne`, `buildContext` und der KI-Kontext konsumieren sie. Lokale und serverseitige Analyse erzeugen vorhandene Coach-Nachrichten und Plananpassungen. Scores besitzen bereits Quellenfilter, Aktualitätsbehandlung, Unsicherheit, Verlauf und Erklärungen.

Untersucht wurden Eingabe/Ergebnisjournal, Import, Validierung, Historie, lokale und serverseitige Analyseaufrufe, Coach-Kontext, Schwimmfortschritt, Scorequellen, Neuberechnung und automatische Aktualisierung. Trainingsampel, CTL/ATL/TSB, Vorlagen, Speicherung und Tab-Abgleich bleiben in ihren bestehenden Systemen; ihre Regressionen sind Teil der Prüfungen. Es entsteht keine neue Datenbanktabelle, Migration, API, Abhängigkeit oder parallele Score-/Synchronisationsarchitektur.

## Ursachen und Korrekturen

| Bereich | Gefundene Ursache | Verbesserung bestehender Funktionen |
|---|---|---|
| Tatsächliches Krafttraining | Teile der Bewertung und Historie übernahmen den geplanten Titel/Bereich; tatsächliche Übungen und Bereiche kamen unvollständig im Kontext an. | Strukturierte Istwerte haben Vorrang. Ober-/Unterkörper, Rumpf oder Ganzkörper werden aus explizitem Istbereich beziehungsweise eindeutig erkennbaren Übungen bestimmt. Unklare Ergebnisse bleiben allgemein. SOLL und IST sowie Sätze, Wiederholungen und Gewichte bleiben getrennt sichtbar. |
| Schwimmdaten | `longestPull` ging in einzelnen Adaptern/Kontexten verloren; Verbraucher verwendeten unterschiedliche Nachweise. Generische zusammenhängende Strecken konnten fälschlich als Kraul zählen. | Gemeinsame Ergebnisbasis für Fortschritt, Bewertung, Kontext und Stufen. Pull Buoy und ohne Hilfsmittel getrennt. Gesamtstrecke und Intervalle ergeben keinen erfundenen Rekord. Unklarer Stil, Brust/Rücken oder andere Hilfsmittel sind kein unassistierter Kraulnachweis. |
| Mehrfachzählung | Dieselbe Aktivität konnte über mehrere Zuordnungen als mehrfacher Nachweis erscheinen. | Bestehende Aktivitätsidentität dedupliziert Nachweise. Eine Einheit kann nicht ihre eigene zweite Bestätigung liefern. |
| Wiederholte Hinweise | Allgemeine Datenänderungen erzeugten neue Hinweisidentitäten; wiederholte Planbegründungen machten die Nachricht lang. | Gemeinsamer Helfer in der bestehenden Analyse verwendet einen stabilen fachlichen Anlass. Ein offener Hinweis wird aktualisiert; abgelehnte/angenommene Anlässe bleiben abgeschlossen. Alte offene Hinweise werden als überholt gekennzeichnet. Kurze Zusammenfassung, Details separat; vollständige Vorschlagsdaten bleiben erhalten. |
| Korrekturen | Nicht alle tatsächlichen Quelldaten gingen in die Änderungssignatur ein. | Ergebnisquelle, tatsächliche Identität und relevante Änderungen lösen Neuberechnung aus. Lesen eines Coach-Hinweises ändert die Leistungssignatur nicht. Eine fachliche Rückkorrektur kann einen vorher überholten Anlass wieder aktuell machen. |
| Frageverständnis | Die konkrete Entscheidung „morgen schwimmen oder laufen?“ landete in allgemeinen Antwortpfaden. | Bestehender Intent-/Dialogpfad beantwortet diese Frage direkt anhand des vorhandenen Plans. Fehlender Plan wird genannt. Krankheit und der gemeinsame vorhandene Beschwerdepfad haben Vorrang; keine Diagnose oder Trainingsfreigabe. Keine ungefragte Planänderung. KI-Anweisung: zuerst die konkrete Frage beantworten. |
| Schwimm-Score | Explizit andere Schwimmstile/Hilfsmittel sowie allein ein Testtitel konnten den unassistierten CSS-Nachweis verfälschen. Ausrüstung als Objekt wurde unvollständig erkannt. | Vorhandene Quellenfilter korrigiert, einschließlich wahrer/falscher Ausrüstungsflags. Titel allein ist kein CSS-Test. Unspezifische historische Gesamtpace bleibt höchstens eine schwache Schätzquelle; kein belegter Kraulrekord oder gemessener CSS-Test. |
| Fehlende Leistungsdaten | Ein profilbasierter Ausgangsschätzwert wurde intern als gemessener Score und in der Ansicht als Leistungsstufe behandelt. | Numerische Orientierung bleibt für Kompatibilität erhalten; `measured` ist ohne Leistungsnachweise leer. Karte und Detail zeigen „Schätzwert“. Kontext enthält Grundlage, Anzahl, Unsicherheit und Erklärung. |
| Konkurrierende Analyse | Nach einer asynchronen KI-/Enginephase wurde ein zuvor geladener Zustand mit einem neuen Zeitstempel geschrieben. Ein tatsächlich abgelehnter Vorschlag konnte dadurch wieder offen werden. | Engine und Analyse lesen frisch. Die vorhandene Nutzerrevision wird vor dem Lesen erfasst und im selben atomaren D1-Batch wie alle Änderungen geprüft. Bei Konflikt vollständiger Abbruch ohne Schreibvorgänge, Erfolgsmarker oder Aktualisierung des geteilten Zustands. Echte Datenbankfehler bleiben Fehler; keine neue Tabelle. |
| Automatische Planaktualisierung | Einzelne Aufrufpfade berücksichtigten Abschlussstatus, effektive Sperren oder aktive manuelle Änderungen nicht vollständig. | Bestehende Aktualisierung erhält den aktuellen Zustand. Abgeschlossene, gesperrte, eingefrorene und aktiv manuell bearbeitete/ergänzte Einheiten bleiben geschützt. Unbetroffene zukünftige Einheiten können weiter aktualisiert werden. |

Die allgemeine Belastung wird weiterhin aus den tatsächlich gespeicherten Aktivitäten/Minuten und vorhandenen Belastungsquellen berechnet. Es wurde kein unbelegtes neues Modell für muskelspezifische Erholung eingeführt. Beschwerden bleiben Hinweise und werden nicht in medizinische Aussagen umgedeutet.

## Schwimmbestleistung und bestätigte Stufe

Die bereits vorhandene Regel verlangt zwei voneinander unabhängige Einheiten zur Bestätigung einer Stufe. Ein einzelner Eintrag über 100 m kann daher korrekt **Bestleistung 100 m, bestätigt 50 m** ergeben. Diese Unterscheidung ist jetzt für beide Kategorien nachvollziehbar. Ein Pull-Buoy-Rekord bestätigt niemals automatisch dieselbe Strecke ohne Hilfsmittel. Profilangaben werden separat von tatsächlich beobachteten Nachweisen bezeichnet. Korrekturen werden aus aktuellen Ergebnissen neu ausgewertet; vergangene Trainings werden nicht umgeschrieben.

## Scoremodell und Grenzen

Bestehende Skala, Filter und Gewichtungen wurden erhalten. Die Korrekturen verbessern Evidenzzuordnung und Ehrlichkeit der Darstellung, nicht eine behauptete wissenschaftliche Genauigkeit. Fehlende Herzfrequenz bedeutet nicht automatisch fehlende Leistungsdaten: verwertbare Pace-/Leistungsnachweise können weiterhin zählen. Fehlende Leistung insgesamt bleibt eine vorläufige Orientierung mit Unsicherheit.

Es gibt keine neu erfundenen Prozentangaben, keine neue Normalpopulation und keine belegte sportwissenschaftliche Kalibrierung dieses heuristischen Scores. VO2max, Leistungskurve oder Technikqualität werden nicht aus unzureichenden Daten erfunden. Die Änderungen sind kein Nachweis einer individuellen medizinischen Eignung oder einer objektiven Vergleichbarkeit aller Athleten. Eine weitergehende Modellkalibrierung benötigt geeignete Referenzdaten und eine gesonderte fachliche Validierung.

## Nachvollziehbarkeit und notwendige Erweiterungen

Ein zusätzliches optionales Revisionsargument im bestehenden Schreibhelfer schützt Analyse-Transaktionen vor veralteten Entscheidungen. Die Prüfung nutzt die bereits vorhandene `meta`-Primärschlüsselbedingung: Ein nur bei veränderter Nutzerrevision versuchter Eintrag auf den bestehenden Schlüssel bricht den gesamten D1-Batch ab. Ein separater Vorab-SELECT würde eine neue Race-Lücke lassen. Der Konflikt wird als solcher behandelt; andere Datenbankfehler werden weitergegeben. Auch Löschmarkierungen gehören zur Revision. Änderungen anderer Nutzer blockieren den Vorgang nicht. Die nächste vorhandene Analyseauslösung kann den aktuellen Stand erneut prüfen; es wurde keine neue Warteschlange eingerichtet.

Die bestehende gespeicherte Analyse erhält eine kompakte `inputVersion` aus ihren relevanten Eingaben und `modelVersion`. Es werden keine zusätzlichen Rohdatenkopien protokolliert. Vorhandene Scoreerklärungen, Quellen und Anpassungsbegründungen werden weiterverwendet.

Notwendig waren ein gemeinsamer Helfer für den fachlichen Schwimmhinweis, ein direkter Entscheidungszweig im bestehenden Dialog und zusätzliche Felder in vorhandenen Nachrichten/Analysen. Ein neuer Status kennzeichnet überholte Hinweise. Alle Erweiterungen bleiben in bestehenden Dateien und Speichersätzen. Bestandsdaten werden weder migriert noch gelöscht.

## Tatsächlich ausgeführte Prüfungen

Die Läufe sind getrennt aufgeführt; überlappende Tests werden nicht als zusätzliche eindeutige Tests zusammengerechnet. Nachweise liegen unter `docs/test-evidence/coach28/`.

| Ausgeführter Lauf | Tatsächliches Ergebnis |
|---|---|
| Breite vorhandene Unit-/Serversuite in isolierter Kopie | 2325 bestanden, 67 übersprungen; ein neu ergänzter Race-Test schlug vor dessen Korrektur fehl. Außerdem blockierte die HTTP-API-Suite bereits bei der Vorbereitung. 407,53 Sekunden. Kein Gesamtgrün behauptet. |
| Gezielte 14 Unit-/Serverdateien | 632 bestanden, 61 regulär mangels echter Exporte übersprungen. |
| Alle Serverdateien nach dem Race-Fix | 214 bestanden, vier Tests in der bei HTTP-Vorbereitung gescheiterten API-Suite übersprungen. 18 Dateien bestanden; diese eine API-Suite bleibt blockiert. |
| Gezielt erweiterte Race-/Servernachbarn | Vorher vier fehlgeschlagene Regressionen; danach 86/86 bestanden. Darunter echte Ablehnung, verzögerte KI, Mutation unmittelbar vor dem Batch, unveränderter geteilter Zustand bei Konflikt, Tombstones, atomarer Rollback, anderer Nutzer und echte Datenbankfehler. |
| Fünf zuvor fehlgeschlagene Fälle ohne Puls | 5/5 bestanden; nur diese fünf erneut ausgeführt, die übrigen 46 Fälle waren im gezielten Lauf ausgefiltert. Helper unterscheidet unsichere Profilorientierung von tatsächlich nutzbarer Pace/RPE ohne Puls. |
| Bestehende Browserdateien: Coach, Speicherwiederherstellung, Kraftvorlagen, manuelle Belastungswerte, Ampel, Layout | 107 bestanden; 51 Chromium-Layoutfälle wie vorgesehen übersprungen, dieselben 51 Fälle in WebKit bestanden. 6,5 Minuten. |
| Neue Coach-Browserregressionen nach endgültiger Übernahme in den Projektordner | 10/10 bestanden (20,6 Sekunden); Chromium und WebKit, jeweils tatsächlicher Kraftbereich, getrennte 100-m-Werte, abgelehnter Hinweis nach Neustart, direkte Frage, Schätzwertbeschriftung. |
| Typecheck und Produktionsbuild im Projektordner | Bestanden; bestehende Warnung über Bundlegröße über 500 kB bleibt. |
| Reguläres `npm run e2e` | Gestartet, wegen ausbleibender lokaler Erreichbarkeit angehalten; separate Minimalprobe liefert EACCES. Kein vollständiger Standard-E2E-Erfolg. |

Der erste breite Diagnoselauf hatte außerdem zwei Fehler durch eine beim Kopieren ausgelassene unveränderte Windows-Starterdatei und fünf alte Helperannahmen zu `measured`. Starter unverändert nachkopiert: 2/2 bestanden. Helper präzisiert und um echte Ohne-Puls-Evidenz erweitert: 5/5 bestanden. Der spätere breite Lauf enthält diese ursprünglichen Fehler nicht mehr. Der zuletzt entdeckte Race-Test wurde erst während dieses breiten Laufs ergänzt und zunächst bewusst rot ausgeführt; der anschließende vollständige Serverlauf bestätigt dessen Korrektur.

- Fehler vor Korrektur durch gezielte rote Regressionen nachgewiesen: tatsächlicher Kraftbereich, Pull-Buoy-Kontext, falsche Schwimmtextbelege, Hilfsmittelobjekte, Hinweisduplikate/Korrekturen, direkte Fragen, Beschwerdevorrang, manuelle Plansperren und irreführende Scorebeschriftung.
- Bestehende Testdateien erweitert; keine zweite parallele Testsuite aufgebaut.
- Ausschließlich synthetische Aktivitäten und isoliertes SQLite-D1 für neue Tests. Vorhandene Tests mit echten Exporten wurden in der Testkopie mangels Daten regulär übersprungen.
- Bestehende Langzeitsimulationen mit zehn Profilen und 4/12/24/52 virtuellen Wochen bestanden im breiten Lauf, einschließlich reproduzierbarer Wiederholung. Weitere zehn Planprofile über 12–21 Wochen prüften Änderungen, Verschieben, Vorlagen und JSON-Neustarts. Zehn zusätzliche kurze Evidenzprüfungen decken Datenarmut, Fortschritt, stabile Leistung, wechselnden Umfang, lange Historie, fehlenden Puls, fehlenden Wattmesser, manuelle Eingaben und Wiedereinstieg ab.
- Unabhängige Codeprüfung: gefundene Parser-/Hilfsmittel-/Beschwerde-/Statusprobleme korrigiert und nachgeprüft; bei der letzten gezielten Nachprüfung keine weiteren konkreten schweren Befunde.

## Verbleibende Grenzen und Freigabestatus

Lokaler HTTP-Zugriff ist in dieser Sitzung mit EACCES blockiert. Die reguläre API-/End-to-End-Gesamtprüfung und eine reale Testbereitstellung müssen deshalb außerhalb dieser Sitzung stattfinden; bestehende Releasegates werden nicht abgeschwächt. Der isolierte Browsertransport prüft die gebaute App, echte Browser, IndexedDB und den echten Worker gegen synthetisches D1, ersetzt aber keinen Nachweis über die externe Cloudflare-Verbindung.

Antworttests prüfen deterministische Antworten und Kontextinhalte. Eine belastbare Bewertung wechselnder Antworten eines produktiven Sprachmodells wurde damit nicht durchgeführt. Es wurden keine kostenpflichtigen KI-Aufrufe ausgelöst. Die neue Fassung ist nicht veröffentlicht; die frühere Freigabe für Plan C ist keine Freigabe für diesen neuen Coach-Auftrag.
