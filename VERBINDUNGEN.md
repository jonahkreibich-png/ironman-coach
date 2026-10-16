# Verbindungen

Stand der Recherche: Oktober 2026, aktualisiert mit Auftrag 4 (11.10.2026).

## Auftrag 13: Warum HealthFit/Dropbox nicht ging (16.10.2026)

1. **Zweiter Worker mit altem Code:** Beim Umzug am 13.10. entstand versehentlich ein Worker `coach-app-efc7` (gleicher Name wie die Pages-App) an der echten Datenbank, ohne Schlüssel. Er holte alle 5 min Dropbox ab, scheiterte an „TOKEN_KEY fehlt“ und setzte den Zeitstempel, deshalb kam der richtige Server nie dran. Zeitplan abgeschaltet (16.10.); löschen beim Aufräumen der alten App.
2. **Anzeige:** Ein Fehler stand als „nicht verbunden“ mit Knopf „Verbinden“ da. Jetzt: „Fehler“ mit Grund, Hilfe, letzter Abruf, letzte Datei, „Jetzt abrufen“.
3. **CPU-Grenze (kostenloser Tarif, 10 ms pro Aufruf):** Eine FIT-Datei braucht 5-40 ms. Jetzt Warteschlange, eine Datei pro Aufruf, alle 5 min die nächste.
4. **Ordner:** HealthFit speichert in `/Apps/HealthFit`. Eine Dropbox-App mit „App folder“-Zugriff sieht diesen Ordner nicht; nötig ist „Full Dropbox“. Die App sucht auch `/HealthFit` und Ordner mit „HealthFit“ im Namen.

**Alternative ohne Dropbox:** HealthFit → Einstellungen → Intervals.icu → anmelden, automatisch hochladen; in der App intervals.icu verbinden. Trainings kommen alle 30 min.

## Auftrag 4: Warum „Verbinden“ beim ersten Test nicht ging

Geprüft am 11.10.2026 mit `node scripts/check-secrets.mjs` (zeigt nur Namen, keine Werte), der Test-Datenbank (nur Gerätenamen) und simulierten Anbietern in den Tests.

| Dienst | Ursache | Was am Code lag und repariert ist | Was noch fehlt |
|---|---|---|---|
| **Oura** | Server-Schlüssel fehlen: `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET` | Meldung ohne Ausweg → jetzt klare Erklärung plus Alternative (Apple Health per Kurzbefehl) | Entwickler-App anlegen (FUER-JONAH.md, Verbindungen) |
| **Dropbox (HealthFit)** | Server-Schlüssel fehlen: `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` | wie oben, Alternative: HealthFit-Datei hochladen | Dropbox-App anlegen |
| **WHOOP** | Server-Schlüssel fehlen: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` | wie oben | Entwickler-App anlegen |
| **Polar** | Server-Schlüssel fehlen: `POLAR_CLIENT_ID`, `POLAR_CLIENT_SECRET` | wie oben, Alternative: Polar in intervals.icu verbinden | Entwickler-App anlegen |
| **Withings** | Server-Schlüssel fehlen: `WITHINGS_CLIENT_ID`, `WITHINGS_CLIENT_SECRET` | wie oben | Entwickler-App anlegen |
| **intervals.icu** | lief, aber nur mit Server-Verbindung | Nach dem Verbinden wird sofort abgerufen | – |
| **Kurzbefehl (Apple Health)** | lief, aber nur mit Server-Verbindung | – | – |
| **Garmin, COROS, Suunto, Wahoo** | Partner-Freischaltung nötig, der Knopf erklärte nur „Partner nötig“ | geführter Weg über intervals.icu in 3 Schritten mit Knopf „intervals.icu jetzt verbinden“; Status „kommt über intervals.icu“ | – |
| **Knopf „Verbinden“ im Fragebogen** | sprang nur zur Verbindungsseite; der Rückweg führte nie in den Fragebogen; nach dem Erlaubnis-Bildschirm landete man immer unter Verbindungen | Liste direkt im Fragebogen, gleiche Abläufe wie unter Verbindungen, Rückkehr an dieselbe Stelle (`returnTo`), Antworten bleiben gespeichert | – |
| **Alle Dienste ohne Server-Verbindung** | Der Vater hat die App nur auf seinem Gerät genutzt (in der Test-Datenbank gibt es nur Jonahs zwei PCs). Ohne Konto auf dem Server kann kein Dienst verbunden werden; die App sagte das nur knapp. | klare Erklärung im Fragebogen und unter Verbindungen, Einladung für Test-Nutzer (F4) | Jonah gibt dem Vater den Einladungscode (FUER-JONAH.md) |

Die Weiterleitungs-Adresse stimmt: `https://stamio-test.pages.dev/api/connect/<dienst>/callback` antwortet live mit einer Rückleitung in die App. Jeder OAuth-Ablauf (Oura, Dropbox, WHOOP, Withings, Polar) ist mit einem simulierten Anbieter von Anfang bis Ende getestet: Verbinden, Rückkehr in die App bzw. in den Fragebogen, erster Abruf, Token erneuern, Trennen (`server/test/oauth-flow.test.ts`).

**Status in der App:** Unter Mehr → Verbindungen steht bei jedem Dienst, ob er bereit ist. Als Betreiber siehst du zusätzlich „Server-Schlüssel“ mit den Namen der Secrets und ob sie gesetzt sind (`gesetzt` / `fehlt`). Jeder Nutzer verbindet seine Dienste selbst in der App (**Mehr → Verbindungen**). Zugangs-Tokens liegen nur verschlüsselt in der Datenbank (Schlüssel `TOKEN_KEY`), App-Schlüssel der Dienste nur als Cloudflare-Secrets. Strava ist bewusst nicht dabei (Auftrag).

## Übersicht

| Quelle | Status in der App | Was kommt rein | Kosten | Was fehlt noch |
|---|---|---|---|---|
| **Apple Health per Kurzbefehl** | fertig | HFV, Ruhepuls, Schlaf, Gewicht, SpO2, Atemfrequenz, Trainings (Dauer, Distanz, Puls) | kostenlos | Jonah baut den Kurzbefehl + 2 Automationen (FUER-JONAH.md) |
| **HealthFit → Dropbox** | fertig | jede Einheit als FIT-Datei: Runden, Puls, Pace/Leistung, Schwimmzüge | kostenlos (Dropbox Basic) | Dropbox-App mit **Full Dropbox** (nicht „App folder“), in HealthFit Export aktivieren |
| **HealthFit → intervals.icu** | fertig (über intervals.icu) | Trainings | kostenlos | in HealthFit Intervals.icu anmelden, in der App intervals.icu verbinden |
| **HealthFit → iCloud/Datei** | fertig | wie oben, per Kurzbefehl „Datei hochladen“ oder Datei-Import | kostenlos | – |
| **Datei-Import** (.fit, .gpx, .tcx) | fertig | Einheiten von jeder Uhr/jedem Radcomputer | kostenlos | – |
| **intervals.icu** | fertig | CTL/ATL/TSB, Wellness, Trainings | kostenlos | API-Schlüssel in der App eintragen (oder wie bisher als Secret) |
| **Oura** | fertig, Server-Schlüssel fehlt | Schlaf, HFV, Ruhepuls, Temperatur, SpO2 | kostenlos | Oura-Entwickler-App anlegen; bei unter 18: Einwilligung der Eltern (Oura-Bedingungen 12(a)(viii)) |
| **WHOOP** | fertig, Server-Schlüssel fehlt | Erholung, Schlaf, HFV, Trainings (Webhook) | kostenlos (Entwicklermodus bis 10 Mitglieder) | Entwickler-App anlegen |
| **Polar** (AccessLink) | fertig, Server-Schlüssel fehlt | Trainings, Nachtwerte | kostenlos | Entwickler-App anlegen |
| **Withings** | fertig, Server-Schlüssel fehlt | Gewicht, Schlaf, Puls | kostenlos bis 1000 Nutzer | Entwickler-App anlegen |
| **Fitbit / Google Health** | vorbereitet | Schlaf, Aktivität | kostenlos | Fitbit-Web-API wird am 30.10.2026 abgeschaltet; die neue Google-Health-API nimmt noch keine neuen Apps auf. Freischalten, sobald möglich. |
| **HealthKit direkt** | vorbereitet (Plan in SPAETER.md) | alles aus Apple Health, im Hintergrund | 99 $/Jahr Apple-Entwicklerkonto | braucht eine echte iPhone-App (Capacitor-Hülle). Bis dahin: Kurzbefehl. |
| **Suunto** | über intervals.icu (geführt) | Trainings | kostenlos | direkt nur mit Partnerprogramm |
| **COROS** | über intervals.icu (geführt) | Trainings | kostenlos | direkt nur mit Partner-Freigabe |
| **Wahoo** | über intervals.icu (geführt) | Fahrten | kostenlos | direkt nur mit Freigabe durch Wahoo |
| **Garmin** | über intervals.icu (geführt) | Trainings, über intervals.icu auch Wellness | kostenlos | direkt nur über das Garmin-Programm für Firmen |
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

- Oura-Daten dürfen nicht an KI-Dienste gehen (4(d), 6(g)). Die App filtert sie aus dem KI-Coach heraus. (Die Zusammenfassung für Claude gibt es seit Auftrag 4 nicht mehr.)
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
