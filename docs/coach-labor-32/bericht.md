# Coach-Testlabor (Auftrag 32)

21 erfundene Test-Nutzer × 36 Fragen = 756 Antworten. Läuft in `npm test` (`tests/unit/auftrag32-coach.test.ts`) und damit vor jedem Release; rot = kein Release.
Nutzer: Jugendlicher mit Fußball (Training fällt aus, Kraft schon erledigt, Ampel gelb, Raster sperrt den Tag), krank, verletzt (Knie), Ampel grün/gelb/rot/ohne Werte, Läuferin nur Laufen, Einsteiger, Marathon-Anfänger, Rad-Event, Olympisch, Ironman-Profi, viele eigene Regeln, Einheit offen/erledigt, Ruhetag, schon 2 h trainiert.
Fragen (in Gesprächen mit Folgefragen): Ersatz für ausgefallenes Training, „soll ich heute noch was machen“, „aber ich will …“, „und wie lange?“, „wie locker?“, „kann ich auch laufen?“, ja/nein, Rad oder Lauf, müde, kürzer, nur 20 min, verschieben, tauschen, keine Zeit, Knie, krank, Wissen (Zone 2, Kraul-Atmung, Essen, Schlaf), Bewertung, Ziel, morgen, „was genau heute“, warum locker, übertrainiert, Unsinn.

Geprüft je Antwort: genau eine Antwort und höchstens ein Vorschlag · kein Widerspruch zu einem offenen Angebot (nur mit „Korrektur:“) · kennt den Tag (nichts Erledigtes erneut, keine Sportart doppelt) · sinnvoll (krank/rot → kein Training mit leichter Alternative, gelb ≤ 45 min, Knie → kein Laufen, nur gewählte Sportarten, nicht zu streng, „nicht im Plan“ nie als Grund) · Länge (≤ 5–6 Sätze bzw. kurze Liste) · keine Wiederholung · richtige Wochentage und Minuten · Folgefragen verstanden. Dazu Bewertungsregeln (zweite Meinung) für Sinn, Verständlichkeit, Hilfsbereitschaft (je 1–5, mindestens 3).

| | vorher (3.19.0) | nachher (3.20.0) |
|---|---|---|
| bestanden | 561 / 756 = **74,2 %** | 756 / 756 = **100 %** |
| Ersatz für ausgefallenes Training | 12 / 21 | 21 / 21 |
| „soll ich heute noch was machen“ | 32 / 84 | 84 / 84 |
| „aber ich will …“ | 0 / 21 | 21 / 21 |
| „und wie lange?“ | 9 / 42 | 42 / 42 |
| „wie locker?“ | 0 / 21 | 21 / 21 |
| Unsinn (ohne Wiederholung) | 21 / 63 | 63 / 63 |
| Bewertung Sinn / Verständlich / Hilfsbereit | 4,24 / 4,96 / 4,80 | 4,89 / 4,99 / 4,78 |

Häufigste Fehler vorher: gleiche Antwort wie vorher (101), zu streng ohne Vorschlag (50), „wie lange“ nicht verstanden (30), zu lang (26), rot ohne leichte Alternative (14), krank nicht erwähnt (12).

Beispiele (Test-Nutzer „Jonah-ähnlich“):
- „und wie lange?“ – vorher: „Das habe ich nicht genau verstanden. Geht es um heute, um deine Woche oder um deine Ziele?“ – nachher: „40 min, ganz locker (Zone 2, Puls bis etwa 150). Fühlst du dich nach der Hälfte schlapp, darfst du früher aufhören.“
- „aber ich will heute irgendwas machen“ – vorher: „Heute: Fußball-Training (90 min). Fester Termin.“ (obwohl ausgefallen) – nachher: „Bleibt dabei: 40 min locker Rad fahren (Zone 2). Mit „Übernehmen“ steht es im Plan.“
- „Was soll ich vor dem Training essen?“ – vorher: ganze Tageserklärung der Einheit – nachher: Ernährungs-Antwort.

Rohdaten: `ergebnis.json` (neu erzeugen: `LAB_REPORT=1 npx vitest run tests/unit/auftrag32-coach.test.ts`).
