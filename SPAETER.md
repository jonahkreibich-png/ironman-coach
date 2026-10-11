# Später (kostet Geld oder braucht eine Freischaltung)

Regel 7: Es wurde nichts gekauft und nichts verursacht laufende Kosten. Alles hier ist vorbereitet und abgeschaltet.

| Was | Kosten | Nutzen | Vorbereitet | Einschalten |
|---|---|---|---|---|
| **KI-Coach (Claude API)** | nach Verbrauch, geschätzt **0,50–2 $ pro Nutzer und Monat** (siehe unten); Budget-Grenze in der App 2–20 $/Monat | freie Antworten im Coach-Chat, Planänderungen per Gespräch mit Regelprüfung, natürlichere Morgen-Briefings | komplett: Server-Code, Werkzeuge, Regeln, Budget, Tageslimit, Kostenanzeige, Einwilligung, 18 Tests mit Mock | Anthropic-Konto, API-Schlüssel als Secret `ANTHROPIC_API_KEY` setzen, in der App einwilligen |
| **Essens-Foto mit KI** | ca. 0,1–0,3 Cent pro Foto (Routine-Modell) | Kalorien/Nährwerte als Spanne aus einem Foto | komplett, hängt am selben Schlüssel | wie oben. Bis dahin: Foto an die Claude-App teilen |
| **HealthKit direkt (echte iPhone-App)** | Apple-Entwicklerkonto 99 $/Jahr | Werte aus Apple Health im Hintergrund, ohne Kurzbefehl | Datenmodell und Quelle `healthkit` sind da, Zusammenführung fertig | Capacitor-Hülle um die Web-App + HealthKit-Plugin, TestFlight |
| **App Store / Google Play** | 99 $/Jahr Apple, 25 $ einmalig Google | Installation ohne Safari-Umweg, Push zuverlässiger | siehe STORE-PLAN.md | – |
| **Eigene Adresse** (z. B. stamio.app) | ca. 10–20 €/Jahr | schönere Adresse statt `stamio.pages.dev` | Pages-Projekt nimmt eigene Domains ohne Code-Änderung | Domain kaufen, in Cloudflare hinzufügen, `PUBLIC_URL`/`ALLOWED_ORIGINS` anpassen |
| **Terra API** | 399–499 $/Monat | ein Anschluss für Garmin, Suunto, COROS, Wahoo, Zepp usw. | – (bewusst nicht eingebaut) | erst bei vielen Nutzern sinnvoll |
| **Garmin / TrainingPeaks** | kostenlos, aber nur für Firmen | direkter Zugriff | als „Partner nötig“ angezeigt | Firmengründung bzw. Partnerantrag |
| **Englisch vollständig** | Zeit, kein Geld | Nutzer ohne Deutsch | Texte liegen zentral in `shared/lang/`, Englisch fällt auf Deutsch zurück | `shared/lang/en.ts` übersetzen, Test prüft Vollständigkeit von Deutsch |

## KI-Kosten genauer

Preise (Stand Oktober 2026, pro Million Tokens): starkes Modell `claude-opus-5-5` 4 $ Eingabe / 20 $ Ausgabe, Routine-Modell `claude-haiku-5-5` 0,10 $ / 0,50 $.
Die App nimmt das starke Modell nur für echte Gespräche (Chat, Planänderungen), sonst das Routine-Modell.

| Nutzung pro Monat | Rechnung | Kosten |
|---|---|---|
| 30 Morgen-Briefings umformulieren (Routine) | 30 × 3 000 Tokens rein, 200 raus | ~0,01 $ |
| 10 Chat-Gespräche (stark) | 10 × 15 000 rein, 800 raus | ~0,76 $ |
| 30 Essens-Fotos (Routine) | 30 × 2 000 rein, 300 raus | ~0,01 $ |
| **Summe typischer Nutzer** | | **~0,80 $** |

Grenzen in der App: Monatsbudget (Standard 5 $, höchstens 20 $), höchstens 30 Nachrichten pro Tag. Ist das Budget erreicht, übernimmt automatisch der kostenlose Coach.

**Alter:** Der KI-Coach ist ab 16 mit eigener Einwilligung nutzbar, unter 16 nur zusätzlich mit Einwilligung eines Elternteils. Unter 18 antwortet er vorsichtiger (keine Gewichtsziele, keine Medikamente, kein Ersatz für Ärzte). Anthropic erlaubt Apps für Minderjährige nur mit solchen Schutzmaßnahmen – vor dem Einschalten für Nutzer unter 18 die aktuellen Bedingungen noch einmal prüfen.

**Wer zahlt:** Du als Betreiber hast KI-Coach und Essens-Foto immer freigeschaltet. Die API-Kosten deiner eigenen Nutzung zahlst trotzdem du an Anthropic (siehe Tabelle, unter 1 $ im Monat). Für andere Nutzer sind die Funktionen aus, bis du sie freischaltest oder sie später im Store kaufen.

## Oura-Bedingungen in drei Sätzen

Oura-Daten dürfen nicht an KI-Dienste weitergegeben oder zum Trainieren verwendet werden, deshalb filtert die App sie aus KI-Coach und Claude-Zusammenfassung heraus. Für den Oura-Zugang darf kein Geld verlangt werden, und beim Trennen müssen die Daten innerhalb von 72 Stunden gelöscht werden (die App löscht sofort). Nutzer unter 18 brauchen die Einwilligung der Eltern.
