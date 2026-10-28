# Variante C im echten Plan-Tab

Stand: 27.10.2026. Jonah hat C ausgewaehlt und die Umsetzung beauftragt; keine weitere Designauswahl erforderlich. Umsetzung lokal im Projekt, keine Veroeffentlichung oder Datenmigration.

## Umsetzung

Oben zeigt der Plan nun geplante Wochenstunden, erfasste absolvierte Minuten, abgeschlossene Einheiten und die Sportverteilung. Darunter bleiben Wochenwahl, Tagesnavigation, aufklappbare Tageskarten, Einheiten und Anpassungen erreichbar. Die bestehende Glasdarstellung und der helle/dunkle Modus werden genutzt. Die taeglichen Balken bleiben als zusaetzliche Navigation erhalten.

Das Abhaken wurde nicht entfernt oder neu implementiert: dieselben sess-toggle-Schaltflaechen und Speicherpfade wie zuvor bleiben aktiv. Geplante Einheiten und aus Vorlagen angelegte Einheiten lassen sich abschliessen und wieder oeffnen. Zusatzentwuerfe behalten ihren Abschluss im Detail. Istwerte koennen weiter korrigiert werden; Abhaken/Ruecknahme ueberschreibt weder Werte noch Notizen.

Alle Zahlen kommen aus derselben weekSummary wie die bestehenden Tages-/Wochenzaehler. Ausfaelle zaehlen nicht zu aktiven Planminuten; Extras zaehlen mit. Geplante Zeit ist kein Ersatz fuer fehlende Istwerte: fehlende Dauer wird als offen gekennzeichnet. Es gibt keine neue Speicherung, API oder Datenmigration fuer dieses Dashboard.

Geaenderter Produktcode: web/src/views/plan-dashboard27.ts (neue reine Darstellung), web/src/views/plan.ts (Einbindung und CSS-Wrapper), web/src/styles.css (lokal begrenzte C-Regeln). Tests/Browserkonfiguration entsprechend erweitert.

## Tatsaechlich ausgefuehrte Pruefungen

- 11 gezielte Unitpruefungen (3 neue Dashboardfaelle und 8 Summenregressionen) bestanden. Dashboard-Einbindung im Browser vor der Implementierung reproduzierbar fehlgeschlagen, danach erfolgreich.
- 51 Browserfaelle in Desktop-Chromium, mobilem Chromium und mobilem WebKit bestanden. Darin 15 neue C-Faelle: Abhaken, Istkorrektur, Neuladen, Haken zuruecknehmen und Vorlage anlegen/abschliessen fuer jede der vier Sportarten; Darstellung bei 320/390/1440px in hell/dunkel sowie erhaltene Tastaturbedienung. Die weiteren 36 Faelle decken bestehende Vorlagen-/Verschiebe-/Syncablaeufe ab.
- 22 bestehende Speicher-/Backupregressionen in Chromium/WebKit bestanden, einschliesslich zwei Tabs, Export/isoliertem Import, blockierten Speichern, Netz-/Datenbankfehlern, Neustart und mehrfachen Verschiebungen.
- Nach Uebernahme in den Originalordner: Typecheck und Build erfolgreich; drei erneute Browserpruefungen bestanden. Git diff --check ohne Befund. Bekannte Bundle-Groessenwarnung bleibt.
- Unabhaengige Quellcodepruefung ohne konkrete P1/P2-Befunde. Screenshot in hell und dunkel zusaetzlich visuell geprueft.

Abschliessend 67 gezielte Unit-/Integrationstests in sechs Dateien bestanden, einschliesslich der zehn Langzeitprofile (2.970 Aktionen, 165 JSON-Neustarts). Der vollstaendige Vitest-Lauf meldete 2.226 bestanden, zwei fehlgeschlagen und 67 uebersprungen; zusaetzlich scheiterte die HTTP-API-Suite beim Setup. Die beiden Einzelfehler waren fehlende Dateien in meiner isolierten Kopie: server/wrangler.toml und docs/TRAININGSREGELN.md. Nach unveraendertem Nachkopieren aus dem Projekt bestanden alle 34 Tests der betroffenen Dateien server/test/scheduled.test.ts und tests/unit/auftrag18-regeln.test.ts. Keine Produktkorrektur dafuer erforderlich. Die API-Suite separat erneut gestartet: Setup scheitert am unerreichbaren lokalen Mockserver 127.0.0.1:8799; vier Faelle werden deshalb uebersprungen. Kein vollstaendig gruener Gesamtlauf behauptet.

## Grenzen

Die Browserlaeufe nutzten echte gebaute App-Assets, IndexedDB und den echten Worker mit isolierter SQLite/D1-Bruecke ueber prozessinterne Routen. Der regulaere HTTP-E2E-Lauf scheiterte beim Serverstart/Plugin-Setup; unabhaengiger Minimalserver-Probe: Fetch auf 127.0.0.1 mit EACCES verweigert. Keine erfassten HTTP-Testfaelle als bestanden gezaehlt. Firefox ist nicht installiert; kein echtes iOS-Geraet und keine Cloudflare-Testveroeffentlichung in diesem Auftrag. Beim Chromium-Backup wird wie bisher die Dateifreigabe im isolierten Harness erfasst; das ist kein nativer Betriebssystem-Downloadnachweis.

Vor einem Release bleiben normale HTTP-Gesamtpruefung, Testumgebung und Produktionsfreigabe erforderlich. Bestehende Nutzerdaten und externe Datenbanken wurden nicht beruehrt.

Protokolle: docs/qa27/. Screenshots mit synthetischen Daten: dashboard-c-light-2026-10-27.png und dashboard-c-dark-2026-10-27.png.
