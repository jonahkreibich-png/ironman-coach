# Entscheidungen

Nach Regel 8 selbst entschieden. Jede Zeile: was, warum, wie rückgängig.

## Arbeitsweise und Sicherheit
| # | Entscheidung | Warum |
|---|---|---|
| 1 | Alles auf dem Branch `entwicklung`, nur lokal committet, nichts nach GitHub gepusht. | `main` ist die echte App (GitHub Pages). Ein Push würde Code veröffentlichen; nötig ist er erst beim Freigeben. |
| 2 | Testumgebung: Worker `stamio-api-test`, Datenbank `stamio-test`, App `https://stamio-test.pages.dev` (Cloudflare Pages, `/api` über Pages Function an den Worker). | Eigene Adresse ohne „ironman“, gleiche Herkunft für App und API (keine CORS-Probleme), kostenlos. |
| 3 | Echte Datenbank nicht gelesen. Testdaten sind erfunden (`fixtures/demo.mjs`); Jonahs echte Daten kommen per `scripts/copy-prod-to-test.mjs` (von Jonah gestartet) oder per Backup-Datei in die Test-App. | Der Lesezugriff auf die echte Datenbank wurde abgelehnt. Nicht umgangen. |
| 4 | Migration auf mehrere Nutzer (0002) nur an Kopien: Unit-Test mit Altdaten, Kopier-Skript für die Testumgebung, beim Freigeben eine **neue** Datenbank aus einer Kopie. Die alte bleibt 4 Wochen. | Regel 2: Daten nie ohne Sicherung und getestete Migration umbauen. |
| 5 | Erste Einrichtung nur mit Einrichtungscode (`SETUP_CODE`), neue Nutzer nur per Einladung (14 Tage, einmalig). Keine offene Registrierung. | Regel 5. |
| 6 | Alle Schlüssel nur als Cloudflare-Secrets, Dienst-Tokens AES-GCM-verschlüsselt (`TOKEN_KEY`). Zugangsdaten für Jonah in `ZUGANG.local.md` (nicht im Repo). | Regel 3. |
| 7 | CI (GitHub Actions): Typen, Unit-, Server- und E2E-Tests (Chromium + WebKit, 390 px). Deploy nur aus `main`, nur wenn grün und ein Cloudflare-Token hinterlegt ist. Migrationen nie automatisch. | Regel 4 und 2. |

## Name und Marke
| # | Entscheidung | Warum |
|---|---|---|
| 8 | Name **Stamio** (von „Stamina“), Zeichen „S“. Steht nur in `shared/brand.ts`. Alternativen in NAMEN.md. | kurz, für alle Ausdauersportarten, deutsch/englisch aussprechbar, keine bekannte Marke gefunden (RDAP-Prüfung). |
| 9 | Repo, alter Worker und alte Adresse heißen bis zum Freigeben weiter „ironman…“. | Auftrag: Umbenennen erst beim Freigeben. |
| 10 | Alte Screenshots in `docs/design/vorher/` zeigen den alten Namen. | Dokumentieren den Ausgangszustand; die App selbst nennt ihn nirgends (Test prüft das). |

## Oberfläche
| # | Entscheidung | Warum |
|---|---|---|
| 11 | 5 Tabs: Heute, Plan, Coach, Fortschritt, Mehr. Werte und Essen unter „Mehr“. | Auftrag (max. 5 Tabs); Werte kommen meist automatisch, Essen ist nicht täglich nötig. |
| 12 | Heute-Variante A (Antwort-Karte) als Standard, B (Feed) unter Einstellungen wählbar. | Vergleich in DESIGN.md: A beantwortet die Kernfrage ohne Tippen. |
| 13 | Gut/Okay/Schlecht entfernt. Anstrengung (RPE) nur optional, eingeklappt. | Auftrag F: Bewertung aus Messdaten. |
| 14 | Manuelle Score-Korrektur nur unter Einstellungen, höchstens ±15. | Auftrag F. |
| 15 | Texte zentral in `shared/lang/de.ts`, Englisch vorbereitet (fällt auf Deutsch zurück). Test meldet fehlende Texte und Schaltflächen ohne Aktion. | Auftrag D (i18n). |
| 16 | Persönliche Standardwerte im Code (Alter 17, 184 cm, 73 kg, Ruhepuls 56, HFV 65) durch neutrale ersetzt. Gespeicherte Werte bleiben. | Profil statt Code-Konstanten. |

## Funktionen
| # | Entscheidung | Warum |
|---|---|---|
| 17 | Plan-Generator nur sichtbar, wenn die App nicht als echte App läuft (`APP_ENV` ≠ production). Der Fragebogen nutzt ihn auch in der Testumgebung. | Auftrag D: Generator nur im Test. |
| 18 | Neuer Plan ersetzt nur die Zukunft (`transitionPlan`); der alte Plan wird gemerkt und kann zurückgeholt werden. | Nichts Erledigtes geht verloren. |
| 19 | Coach-Engine regelbasiert, läuft bei neuen Daten, täglich und sonntags; jede Planänderung als Nachricht mit Grund und Rückgängig. | Auftrag 3A, kostenlos. |
| 20 | KI-Coach komplett gebaut, aber aus (kein API-Schlüssel). Starkes Modell nur für Gespräche, Routine-Modell für Umformulierungen und Essensfotos. Budget und Tageslimit. | Regel 7, Auftrag 3A. |
| 21 | Regeln stehen über der KI: jede KI-Änderung läuft durch dieselbe Regelprüfung; größere Änderungen nur als Vorschlag. Keine Diagnosen, keine Medikamente. | Auftrag 3A. |
| 22 | KI-Coach ab 16 mit eigener Einwilligung, unter 16 zusätzlich Eltern (App **und** Server prüfen). Unter 18 bleiben: keine Gewichtsziele, vorsichtigere Steigerung (+8 % statt +10 %), Mindestalter für lange Distanzen, Oura nur mit Eltern-Einwilligung (Oura-Vertrag). | Wunsch von Jonah (16 statt 18); Schutz Jüngerer bleibt. |
| 31 | Freischaltungen pro Nutzer (`shared/features.ts`): Betreiber (Admin, Nutzer 1) hat immer KI-Coach, Essen per Foto und Plan-Generator. Andere Nutzer nur, was freigeschaltet ist – heute vom Betreiber unter Daten und Geräte, später per Kauf im Store. Der Server prüft das bei jedem KI-Aufruf. | Wunsch von Jonah: für ihn immer alles, für andere später kostenpflichtig. |
| 23 | Oura-Daten gehen nie an die KI und nicht in die Claude-Zusammenfassung; beim Trennen standardmäßig löschen. | Oura API Agreement 4(d), 6(g), 5(f). |
| 24 | Apple Health über Kurzbefehl mit eigenem, widerrufbarem Schlüssel statt HealthKit. | HealthKit braucht eine native App (99 $/Jahr). |
| 25 | HealthFit: Dropbox-Weg gebaut, zusätzlich Datei-Upload per Kurzbefehl (iCloud) und intervals.icu. | Automatischer Dropbox-Export von HealthFit war nicht sicher zu bestätigen. |
| 26 | Eigener FIT-Decoder statt Bibliothek. | klein, läuft im Worker, mit echten FIT-Beispieldateien (MIT-Lizenz) getestet. |
| 27 | Dubletten: gleicher Tag, gleiche Sportart, Start ±30 min. Von Hand eingetragene Werte gewinnen immer. | Auftrag E. |
| 28 | Leistungs-Scores (0–100) relativ zum Ziel aus gemessener Pace/Leistung/Puls/Umfang, Start mit der alten Kalibrierung vom 03.10. | Auftrag F. |
| 29 | Krankheit am selben Tag beenden löscht die Phase (Versehen); sonst endet sie gestern und der Wiedereinstieg beginnt. | sonst blieb man nach „gesund“ bis Mitternacht krank. |
| 30 | „Wettkampf-Modus“ ab 14 Tagen vor einem A/B-Ziel mit Datum, danach 10 Tage Ergebnis und Erholung. | Auftrag 3E. |
