# Dashboard und Extraeinheiten

Jonah beauftragt Einklappen, Entfernen der kryptischen Istzeile, vollstaendige direkte Erfassung von Extraeinheiten, Kraft ohne Kilometer und anschliessende Veroeffentlichung. CLAUDE.md verlangt autonome Umsetzung.

Architektur: vorhandener Dashboardrenderer und UI-Speicher; bestehender Feldereditor mit isoliertem temporaerem Entwurf. Erst Speichern uebernimmt Werte in customWorkouts. Keine Migration.

1. Regression fuer Einklappen/Reload, Istzeile, direkte Werte fuer vier Sportarten, Kraftuebungen, Abbrechen und Sportwechsel schreiben und RED pruefen.
2. Dashboardbutton mit UI-Zustand, Tages-Istkurzform entfernen, im Dashboard offene Zeiten lesbar ausweisen.
3. Feldereditor fuer Entwuerfe; Werte bei Sportwechsel getrennt halten; Speichern im bestehenden dauerhaften Pfad.
4. Gezielte Browsertests, Typecheck/Build und Standardtestgate. Isolierte Alternative bei HTTP-Blockade dokumentieren.
5. Releasehelfer mit Tests, geprueften Sicherungen, Testdeploy und Produktionsdeploy. Bei Fehler anhalten.

Risiken: Abbruch erzeugt keine Einheit; Feldneuzeichnen behaelt Titel/Werte; Kraft bekommt keine Laufkilometer; Speichern erzeugt keine Duplikate; Reload behaelt bestaetigte Werte.

Ergebnis: Umsetzung und gezielte Regressionen abgeschlossen. Reviewfehler und reproduzierter Speicherretry-Verlust behoben. 26+34+51 Browserpruefungen erfolgreich; Gesamtlauf 2301 bestanden, API-Suite durch lokalen HTTP-Zugriff blockiert. Regulaerer Browserlauf beim Serverstart angehalten. Release vor Backup/Deploy abgebrochen; autorisierter Restschritt in FUER-JONAH.md.
