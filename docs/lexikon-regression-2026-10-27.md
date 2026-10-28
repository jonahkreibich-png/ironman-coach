# Lexikon-Regressionspruefung

Jonahs normaler Gesamtlauf: 419 Browserfaelle bestanden, 113 uebersprungen, zweimal derselbe Lexikonfehler. Beide Fehlerkontexte belegen fehlendes [data-sub="strength"] direkt im Mehr-Menue.

Ursache: Der Test erwartete den alten direkten Kraftvorlagen-Menuepunkt. Der beauftragte allgemeine Vorlagenbereich ist jetzt unter Mehr -> Trainingsvorlagen erreichbar; darin befindet sich weiterhin der Link zur bestehenden Kraftvorlagenverwaltung.

Aenderung ausschliesslich tests/e2e/lexikon.spec.ts: neuen Navigationsweg pruefen, vorhandene Suche-/Themen-/Sortier-/Inhaltsassertions erhalten. Synthetische gespeicherte Kraftvorlage wird in allgemeiner Bibliothek und alter Verwaltung angezeigt und anschliessend unveraendert mit dem Ausgangsdatensatz verglichen. Storage-Harness bleibt bei normalen HTTP-Laeufen passiv und ermoeglicht hier die isolierte Browserpruefung. Kein Produktcode, keine Nutzerdaten und keine Freigabegates geaendert.

RED: beide gemeldeten Faelle hier reproduziert. GREEN nach frischem Build: alle sechs Lexikonpruefungen in Chromium/WebKit bestanden (8,9 s). Typecheck und Build erfolgreich; bekannte Bundlewarnung bleibt. Diese gezielten Laeufe verwenden prozessinterne Routen wegen der HTTP-Sperre; kein neuer normaler Gesamtlauf behauptet.

Naechster Schritt: vorbereiteten Teststarter in normaler PowerShell erneut ausfuehren. Er wiederholt Standardpruefungen und wird erst nach Erfolg Testsicherung und Testdeploy ausfuehren. Keine Veroeffentlichung durch diese Korrektur erfolgt.
