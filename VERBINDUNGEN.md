# Verbindungen

Stand der Recherche: Oktober 2026. Jeder Nutzer verbindet seine Dienste selbst in der App (**Mehr → Verbindungen**). Zugangs-Tokens liegen nur verschlüsselt in der Datenbank (Schlüssel `TOKEN_KEY`), App-Schlüssel der Dienste nur als Cloudflare-Secrets. Strava ist bewusst nicht dabei (Auftrag).

## Übersicht

| Quelle | Status in der App | Was kommt rein | Kosten | Was fehlt noch |
|---|---|---|---|---|
| **Apple Health per Kurzbefehl** | fertig | HFV, Ruhepuls, Schlaf, Gewicht, SpO2, Atemfrequenz, Trainings (Dauer, Distanz, Puls) | kostenlos | Jonah baut den Kurzbefehl + 2 Automationen (FUER-JONAH.md) |
| **HealthFit → Dropbox** | fertig | jede Einheit als FIT-Datei: Runden, Puls, Pace/Leistung, Schwimmzüge | kostenlos (Dropbox Basic) | Dropbox-App anlegen (5 min), in HealthFit Export aktivieren |
| **HealthFit → iCloud/Datei** | fertig | wie oben, per Kurzbefehl „Datei hochladen“ oder Datei-Import | kostenlos | – |
| **Datei-Import** (.fit, .gpx, .tcx) | fertig | Einheiten von jeder Uhr/jedem Radcomputer | kostenlos | – |
| **intervals.icu** | fertig | CTL/ATL/TSB, Wellness, Trainings | kostenlos | API-Schlüssel in der App eintragen (oder wie bisher als Secret) |
| **Oura** | fertig, Server-Schlüssel fehlt | Schlaf, HFV, Ruhepuls, Temperatur, SpO2 | kostenlos | Oura-Entwickler-App anlegen; bei unter 18: Einwilligung der Eltern (Oura-Bedingungen 12(a)(viii)) |
| **WHOOP** | fertig, Server-Schlüssel fehlt | Erholung, Schlaf, HFV, Trainings (Webhook) | kostenlos (Entwicklermodus bis 10 Mitglieder) | Entwickler-App anlegen |
| **Polar** (AccessLink) | fertig, Server-Schlüssel fehlt | Trainings, Nachtwerte | kostenlos | Entwickler-App anlegen |
| **Withings** | fertig, Server-Schlüssel fehlt | Gewicht, Schlaf, Puls | kostenlos bis 1000 Nutzer | Entwickler-App anlegen |
| **Fitbit / Google Health** | vorbereitet | Schlaf, Aktivität | kostenlos | Fitbit-Web-API wird am 30.10.2026 abgeschaltet; die neue Google-Health-API nimmt noch keine neuen Apps auf. Freischalten, sobald möglich. |
| **HealthKit direkt** | vorbereitet (Plan in SPAETER.md) | alles aus Apple Health, im Hintergrund | 99 $/Jahr Apple-Entwicklerkonto | braucht eine echte iPhone-App (Capacitor-Hülle). Bis dahin: Kurzbefehl. |
| **Suunto** | angezeigt als „Partner nötig“ | Trainings | kostenlos | Antrag beim Suunto-Partnerprogramm |
| **COROS** | „Partner nötig“ | Trainings | kostenlos | Antrag bei COROS |
| **Wahoo** | „Partner nötig“ | Fahrten | kostenlos | Freigabe durch Wahoo |
| **Garmin** | „Partner nötig“ | alles | kostenlos für Firmen | Garmin Connect Developer Program nur für Unternehmen. Bis dahin: Garmin → Apple Health/HealthFit oder intervals.icu |
| **TrainingPeaks** | „Partner nötig“ | Pläne, Einheiten | – | nur für Partner-Firmen |
| **Zepp (Amazfit)** | nicht möglich | – | – | keine öffentliche Schnittstelle. Weg: Zepp → Apple Health → Kurzbefehl |
| **Terra** (ein Anschluss für alle) | nicht eingebaut | alles | 399–499 $/Monat | siehe SPAETER.md |

## Wie die App Daten zusammenführt

- **Quelle bei jedem Wert:** kleines Kürzel neben dem Wert (z. B. „OU“ für Oura, „✎“ für von Hand).
- **Reihenfolge je Messwert** (Schlaf, HFV, Ruhepuls, Temperatur, SpO2, Atmung, Belastung, Gewicht, Einheiten) ist einstellbar. Standard: spezialisierte Geräte vor allgemeinen (z. B. Schlaf: Oura → WHOOP → Withings → … → Apple Health).
- **Von Hand gewinnt immer.** Neue Messwerte überschreiben nichts, was du eingetragen hast. „Auf Original zurücksetzen“ holt den gemessenen Wert zurück.
- **Doppelte Einheiten:** gleicher Tag, gleiche Sportart, Start innerhalb von ±30 min → eine Einheit, die bessere Quelle gewinnt, die andere bleibt als Verweis.
- **Automatisch abhaken:** eine gemessene Einheit wird der passenden geplanten Einheit des Tages zugeordnet und abgehakt. Passt keine, erscheint sie als Extra-Einheit.
- **Neu verbinden:** lehnt ein Dienst die Anmeldung ab, zeigt die App das unter Verbindungen und auf „Mehr“ an.
- **Trennen** beendet den Zugriff und löscht auf Wunsch alle Daten dieser Quelle (bei Oura standardmäßig, Bedingung 5(f): Löschung innerhalb von 72 Stunden).

## Oura: besondere Bedingungen (API Agreement, gültig ab 08.06.2026)

- Oura-Daten dürfen nicht an KI-Dienste gehen (4(d), 6(g)). Die App filtert sie aus dem KI-Coach und aus der Zusammenfassung für Claude heraus.
- Keine Gebühren für den Oura-Zugang (4(a)(xiii)) – passt, die App ist kostenlos.
- Nutzer unter 18 brauchen die Einwilligung der Eltern (12(a)(viii)).

## Kurzbefehl: Format

`POST https://<adresse>/api/ingest/shortcut` mit Header `X-Ingest-Key: sk_…` und JSON:
```json
{ "date": "2026-10-14", "hrv": 68, "restingHR": 49, "sleepHours": 7.6, "weight": 70.2,
  "workouts": [ { "type": "Laufen", "start": "2026-10-14T17:05:00+02:00", "durationMin": 42, "distanceKm": 7.9, "avgHr": 151 } ] }
```
Deutsche Feldnamen (`ruhepuls`, `schlaf`, `gewicht`) und Minuten statt Stunden werden erkannt. Mehrere Tage: `{ "days": [ … ] }`.
Datei-Upload: `POST /api/import/file?source=healthfit` mit demselben Header und der FIT-Datei als Inhalt.
