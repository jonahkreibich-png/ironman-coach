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

Preise (Stand Oktober 2026, pro Million Tokens): Gesprächs-Modell `claude-sonnet-5-5` 2 $ Eingabe / 10 $ Ausgabe (vorher Opus 5.5 mit 4 $ / 20 $), Routine-Modell `claude-haiku-5-5` 0,10 $ / 0,50 $.
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

## KI-Chat im Coach-Tab (Auftrag 4 D2)

Ohne Schlüssel beantwortet die Engine typische Sätze kostenlos (46 Absichten). Mit Schlüssel übernimmt der KI-Coach dieselbe Oberfläche. Geschätzte Kosten pro Monat (starkes Modell für Gespräche, Routine-Modell für den Rest, Preise wie oben):

| | normal (10 Gespräche + Briefings + Fotos) | viel (30 Gespräche) |
|---|---|---|
| **Jonah allein** | ~0,80 $ | ~2,30 $ |
| **10 Nutzer** | ~8 $ | ~23 $ |
| **100 Nutzer** | ~80 $ | ~230 $ |

Mit Prompt-Caching (gleicher Anfang jeder Anfrage: Handbuch und Regeln) sinkt der Eingabe-Anteil spürbar, grob um 30-50 %. Die Grenzen pro Nutzer (Monatsbudget, 30 Nachrichten pro Tag) bleiben. Ab 10 Nutzern lohnt es sich, die KI nur für Nutzer mit Kauf freizuschalten (siehe STORE-PLAN.md).

## Oura-Bedingungen in drei Sätzen

Oura-Daten dürfen nicht an KI-Dienste weitergegeben oder zum Trainieren verwendet werden, deshalb filtert die App sie aus dem KI-Coach heraus. Für den Oura-Zugang darf kein Geld verlangt werden, und beim Trennen müssen die Daten innerhalb von 72 Stunden gelöscht werden (die App löscht sofort). Nutzer unter 18 brauchen die Einwilligung der Eltern.

## Ab wann lohnt sich der KI-Schlüssel? (Auftrag 5 D7)

Seit Auftrag 5 versteht der Coach auch ohne KI die wichtigsten Wünsche (verschieben, tauschen, kürzer, länger, leichter, härter, streichen, Tag frei, Woche leichter, krank, Schmerzen, Urlaub, neue Regeln, Ziele) mit Rückfragen und Rückgängig. Der Schlüssel lohnt sich, wenn:
- Tester oft Dinge schreiben, die der Coach nur mit Rückfrage versteht (das siehst du im Posteingang unter „Fehler bei Testern“ bzw. in den Meldungen), oder
- du freie Fragen zu Training und Ernährung beantwortet haben willst, die über die eingebauten Antworten hinausgehen, oder
- Sätze unter „Berücksichtigungen“ sehr frei formuliert werden (die KI übersetzt sie in dasselbe Regel-Format, die App zeigt es zur Bestätigung).

Planänderungen laufen auch mit KI immer über dieselben Aktionen und Regeln; die KI kann keine harte Regel brechen. Kosten: siehe oben, für dich allein unter 1 $ im Monat. Freitext → Regeln kostet mit dem Routine-Modell etwa 0,01 Cent pro Satz.

## E-Mail bei neuen Meldungen (Auftrag 5 B)

Cloudflare Email Routing (kostenloser Mail-Versand aus dem Worker) braucht eine eigene Domain in Cloudflare (ca. 10 €/Jahr, siehe „Eigene Adresse“). Deshalb gibt es vorerst nur die Push-Mitteilung an deine Geräte. Mit Domain: Email Routing einschalten, deine Adresse bestätigen, im Worker die Bindung `send_email` ergänzen; der Posteingang und der Text „Als Text kopieren“ sind schon fertig.
Ebenfalls mit Domain möglich: Anmeldung per E-Mail-Link als zweiter Weg neben dem Wiederherstellungscode.
