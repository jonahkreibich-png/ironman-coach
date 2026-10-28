# KI-Coach und Analyse: Umsetzung des neuen Auftrags

Spezifikation: Eingefuegter Text(5).txt im Projektordner. Bestehende Architektur hat Vorrang; CLAUDE.md fordert autonome Entscheidungen. Kein Produktionsdeploy dieses neuen Auftrags ohne gesonderte Freigabe und bestandene Releasegates.

Bestand: actualMetrics/fieldsOf/effectiveActivity bilden Ergebnisse ab; doneItems/valsOf/reviewOne und buildContext/freeai verwenden sie teilweise unvollstaendig. swimProofs/swimBests trennen Bestaetigung und Bestleistung. Coach-Hinweise entstehen lokal und im Serverprozess; IDs/Signaturen sind vorhanden. Scores enthalten Quellenfilter, Konfidenz und Historie; Neuplanung ist vorhanden.

1. Bestehende Aufrufketten und Tests erfassen; synthetische Regressionen fuer Kraftbereich, Uebungen, Pull-Buoy-Werte, Korrektur, Hinweisduplikate und direkte Fragen schreiben. Kein Zugriff auf echte Nutzerdaten.
2. Bestehende Ergebnis-/Coachfunktionen erweitern, fehlende strukturierte Istwerte weiterreichen und geplantes Training sprachlich von absolviertem unterscheiden. Unklare Uebungszuordnung nicht erfinden.
3. Schwimm-Parser, getrennte Hilfsmittelnachweise, eindeutige Sessionzaehlung, Widersprueche und Bestwert-/Stufenanzeige korrigieren. Bestehende Bestaetigungsregeln erhalten und sichtbar erklaeren.
4. Vorhandene Hinweis-IDs/Signaturen und Proposal-Status fuer idempotente Aktualisierung, Verwerfen und Ueberholt-Kennzeichnung verwenden. Keine zweite Nachrichtentabelle; kompakte Texte, Details separat.
5. Konkrete Frage nach Schwimmen oder Laufen direkt aus aktuellen Daten beantworten; bestehende Intent-/Kontext-/Antwortfunktionen korrigieren. Keine erfundenen Aenderungen oder Trainingsfreigaben.
6. Scorequellen und Kriterien pruefen; nur konkret reproduzierte fachliche Fehler beheben. Keine neue Skala oder willkuerlichen Gewichte. Plaene/manuelle Aenderungen schuetzen.
7. Bestehende Langzeitsimulationen auf mindestens zehn synthetische Profile und Korrektur/Neustart/Deduplikation erweitern. Betroffene Tests, Typecheck, Build, isolierte Browserpruefungen und Standardgate mit ehrlich benannten Umgebungsgrenzen.
8. Unabhaengiges Abschlussreview, SHA-geschuetzte Uebernahme aus isolierter Arbeitskopie, ausfuehrlicher Bericht mit Bestand/Ursache/Fix/notwendiger Erweiterung/tatsaechlichen Tests/offenen Punkten.

Isolation: .git ist schreibgeschuetzt; Arbeitskopie mit Hashmanifest unter scratch/coach28-work statt neuer Git-Metadaten. Vorhandene offene Aenderungen bleiben erhalten.
