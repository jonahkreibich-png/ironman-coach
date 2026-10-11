# Plan-Format (Plan-Code)

Ein Plan-Code ist ein JSON-Text. Claude (oder ein Mensch) erzeugt ihn, du fügst ihn in der App unter **Coach → Plan-Code einfügen** ein.
Die App prüft ihn, zeigt eine Vorschau (welche Wochen neu, ersetzt oder gleich sind) und lässt ihn durch dieselben Sicherheitsregeln laufen wie jede automatische Anpassung. Erst nach „Übernehmen“ ändert sich etwas.

Text oder ```json-Blöcke rund um den Code stören nicht. Die App sucht das JSON selbst heraus.

## Zwei Arten

- **Wochen ergänzen oder ersetzen (Standard):** nur `weeks`. Wochen mit gleicher `weekNumber` werden ersetzt, neue hinzugefügt, alle anderen bleiben.
- **Ganzen Plan ersetzen:** `"mode": "replace"` und `meta` mit `eventDate`. Die App fragt zur Sicherheit zweimal.

Erledigte Einheiten und eingetragene Werte bleiben in beiden Fällen erhalten (sie hängen an der `id` der Einheit).

## Aufbau

```json
{
  "version": 1,
  "mode": "merge",
  "weeks": [
    {
      "weekNumber": 9,
      "startDate": "2026-11-09",
      "focus": "Grundlage, Schwimmtechnik",
      "isRecoveryWeek": false,
      "days": [
        {
          "date": "2026-11-09",
          "sessions": [
            { "id": "w9-mo-1", "sport": "swim", "title": "Technik 8×50", "plannedMinutes": 40, "plannedKm": 1.6, "zone": "Zone 2", "description": "Abschlag, Catch-up, Atmung 3er" }
          ]
        },
        { "date": "2026-11-10", "sessions": [ { "id": "w9-di-1", "sport": "rest", "title": "Ruhetag" } ] }
      ]
    }
  ]
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `weekNumber` | ja | ganze Zahl, fortlaufend |
| `startDate` | ja | Montag der Woche, `JJJJ-MM-TT` |
| `focus` | nein | kurzer Schwerpunkt |
| `isRecoveryWeek` | nein | Erholungswoche (`true`/`false`) |
| `days[].date` | ja | Datum innerhalb der Woche |
| `sessions[].id` | empfohlen | eindeutig; fehlt sie, vergibt die App eine |
| `sessions[].sport` | ja | `swim`, `bike`, `run`, `strength`, `football` (Teamsport), `rest` |
| `sessions[].title` | ja | Name der Einheit |
| `sessions[].plannedMinutes` | nein | 1–600 |
| `sessions[].plannedKm` | nein | 0–300 (Schwimmen in km, z. B. 1.6) |
| `sessions[].zone` | nein | z. B. „Zone 2“, „Zone 3-4“ – die App zeigt dazu Puls/Pace aus deinen Schwellen |
| `sessions[].description` | nein | Ablauf, Hinweise |
| `sessions[].time` | nein | Uhrzeit `HH:MM` (für Erinnerungen) |
| `meta` | nur bei `replace` | `eventDate`, `event` (Name des Ziels) |

## Was die App prüft

- Fehler (verhindern die Übernahme): fehlende Felder, falsches Datum, Tag außerhalb der Woche, unbekannte Sportart, doppelte IDs, unrealistische Dauer.
- Sicherheitsregeln (Hinweise in der Vorschau, die App passt nichts heimlich an): Umfang höchstens +10 % pro Woche (+8 % unter 18), Laufumfang, keine zwei harten Tage hintereinander, Erholungswochen, Krankheit, Mindestalter für lange Distanzen.

## Für Claude

„Mit Claude besprechen“ gibt Claude eine Zusammenfassung deiner letzten Wochen mit. Bitte Claude, Änderungen **als Plan-Code nach PLAN-FORMAT** zu liefern. Diese Datei kann man Claude auch direkt zeigen.
